import "server-only";
import { db } from "@/lib/server/db";
import { puedeVerContabilidad, puedeVerInformacionPrivada } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";

// Saldo de una cuenta (Bancos/Tesorería) — se calcula, nunca se almacena, y
// se construye ÚNICAMENTE con dinero real que ya se movió: un Egreso sin
// fechaPago, o un Ingreso manual sin fechaCobro, nunca restan/suman al
// saldo (son operaciones reconocidas, no efectivo todavía). Un Ingreso que
// decora un MovimientoFinancieroCliente siempre cuenta — ese modelo solo
// existe cuando el dinero ya entró. Ver
// docs/negocio/05-modulo-contabilidad.md, sección 13.

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

export type MedioFinancieroConSaldo = {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  moneda: string;
  numeroCuentaEnmascarado: string | null;
  saldoInicial: number;
  fechaSaldoInicial: string | null;
  // null = saldo restringido para este usuario (ver puedeConsultarSaldosReales).
  saldoActual: number | null;
};

export type SaldosMediosFinancieros = {
  // true = ningún saldo actual se calculó ni se envía; la UI muestra un
  // aviso neutral, sin mencionar el motivo.
  saldosRestringidos: boolean;
  medios: MedioFinancieroConSaldo[];
};

// Saldos reales (C3, octubre 2026) — un saldo bancario incluye los cobros de
// la capa Privado que tengan cuenta receptora; nunca se excluyen para
// fabricar un saldo "General". Por eso solo se calcula para quien puede verlo:
// - Empresa con Privado habilitado: puedeVerInformacionPrivada (rol + switch
//   personal Vista privada).
// - Empresa sin Privado habilitado: todo usuario de Contabilidad, salvo que
//   existan cobros Privado históricos vigentes con cuenta receptora — en ese
//   caso se restringen TODOS los saldos de la Empresa (comprobación a nivel
//   Empresa, nunca por cuenta, para no señalar en cuál cayó dinero privado).
//   La comprobación solo pide un id: nunca importes, fechas ni referencias.
//   Se acepta (decisión de negocio) que la restricción permita inferir que
//   existió información privada, nunca sus importes ni detalles.
async function puedeConsultarSaldosReales(usuario: UsuarioSesion, empresaId: string): Promise<boolean> {
  if (usuario.empresa?.privadoHabilitado) return puedeVerInformacionPrivada(usuario);

  const cobroPrivadoConCuenta = await db.ingreso.findFirst({
    where: {
      empresaId,
      estatus: "VIGENTE",
      cuentaReceptoraId: { not: null },
      movimientoFinancieroCliente: { estatus: "VIGENTE", estimacionClienteCapa: { capa: "PRIVADO" } },
    },
    select: { id: true },
  });
  return cobroPrivadoConCuenta === null;
}

export async function obtenerSaldosMediosFinancieros(usuario: UsuarioSesion): Promise<SaldosMediosFinancieros> {
  const empresaId = requerirContabilidad(usuario);

  const medios = await db.medioFinanciero.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } });

  const datosCuenta = (m: (typeof medios)[number]) => ({
    id: m.id,
    nombre: m.nombre,
    tipo: m.tipo,
    activo: m.activo,
    moneda: m.moneda,
    numeroCuentaEnmascarado: m.numeroCuentaEnmascarado,
    saldoInicial: Number(m.saldoInicial),
    fechaSaldoInicial: m.fechaSaldoInicial ? m.fechaSaldoInicial.toISOString() : null,
  });

  // Restringido: ningún movimiento se consulta ni se calcula.
  if (!(await puedeConsultarSaldosReales(usuario, empresaId))) {
    return { saldosRestringidos: true, medios: medios.map((m) => ({ ...datosCuenta(m), saldoActual: null })) };
  }

  const conSaldo = await Promise.all(
    medios.map(async (m) => {
      const desde = m.fechaSaldoInicial ?? undefined;

      const [movimientosLigados, ingresosManualesCobrados, egresosDeGastoPagados, egresosManualesPagados] = await Promise.all([
        // Un Ingreso que decora un MovimientoFinancieroCliente no persiste
        // monto propio (decora, no duplica) — su monto real vive en el
        // movimiento, así que se lee de ahí, no de Ingreso.monto.
        db.movimientoFinancieroCliente.findMany({
          where: {
            estatus: "VIGENTE",
            ingreso: { cuentaReceptoraId: m.id, estatus: "VIGENTE" },
            ...(desde ? { fecha: { gte: desde } } : {}),
          },
          select: { monto: true },
        }),
        db.ingreso.aggregate({
          where: {
            cuentaReceptoraId: m.id,
            estatus: "VIGENTE",
            movimientoFinancieroClienteId: null,
            fechaCobro: desde ? { gte: desde, not: null } : { not: null },
          },
          _sum: { monto: true },
        }),
        // Mismo criterio que el lado Ingreso: un Egreso que decora un
        // GastoObra tampoco persiste monto propio (Egreso.monto es null en
        // ese caso) — el monto real vive en GastoObra.monto.
        db.egreso.findMany({
          where: {
            medioFinancieroId: m.id,
            estatus: "VIGENTE",
            gastoObraId: { not: null },
            fechaPago: desde ? { gte: desde, not: null } : { not: null },
          },
          select: { gastoObra: { select: { monto: true } } },
        }),
        db.egreso.aggregate({
          where: {
            medioFinancieroId: m.id,
            estatus: "VIGENTE",
            gastoObraId: null,
            fechaPago: desde ? { gte: desde, not: null } : { not: null },
          },
          _sum: { monto: true },
        }),
      ]);

      const totalIngresosMovimiento = movimientosLigados.reduce((acc, mv) => acc + Number(mv.monto), 0);
      const totalIngresos = totalIngresosMovimiento + Number(ingresosManualesCobrados._sum.monto ?? 0);
      const totalEgresosDeGasto = egresosDeGastoPagados.reduce((acc, e) => acc + Number(e.gastoObra?.monto ?? 0), 0);
      const totalEgresos = totalEgresosDeGasto + Number(egresosManualesPagados._sum.monto ?? 0);

      const saldoActual = Number(m.saldoInicial) + totalIngresos - totalEgresos;

      return { ...datosCuenta(m), saldoActual };
    })
  );

  return { saldosRestringidos: false, medios: conSaldo };
}
