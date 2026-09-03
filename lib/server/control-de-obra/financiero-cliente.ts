import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { CapaEstimacion } from "@/lib/generated/prisma/enums";
import { formatMoney } from "@/lib/dinero";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import { obtenerBrandingEmpresa, type BrandingEmpresa } from "@/lib/server/branding";
import {
  puedeVerFinancieroCliente,
  puedeVerFinancieroClienteOperativo,
  puedeRegistrarMovimientoFinancieroCliente,
  puedeRegistrarMovimientoFinancieroClienteOperativo,
} from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";
import {
  calcularImportesConcepto,
  calcularImportesOperativoConcepto,
  type PorcentajesDefaultProyecto,
} from "@/lib/control-de-obra/contrato-general";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { RegistroNoEncontradoError } from "./estructura-contractual";

type Cliente = Prisma.TransactionClient;

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function numOrNull(valor: { toNumber(): number } | null): number | null {
  return valor === null ? null : valor.toNumber();
}

function suma(movs: { tipo: string; monto: Prisma.Decimal }[], tipo: string): number {
  return movs.filter((m) => m.tipo === tipo).reduce((t, m) => t + Number(m.monto), 0);
}

export type CapaValorizacion = "operativo" | "privado";

function aCapaEstimacion(capa: CapaValorizacion): CapaEstimacion {
  return capa === "privado" ? "PRIVADO" : "OPERATIVO";
}

// ---------------------------------------------------------------------------
// Aplicación de fondo contra una estimación (una capa) — toda obra se cobra
// por Estimación; el fondo es una fuente de recursos opcional (existe si el
// proyecto tiene al menos una APORTACION_FONDO) que puede cubrir total o
// parcialmente cualquier estimación EMITIDA de cualquier capa. El fondo en sí
// es efectivo real del proyecto — único, compartido por ambas capas, porque
// solo ingresó una vez: `disponible = Σ aportaciones − Σ aplicaciones de
// TODAS las capas`. Si General aplica $20,000, esos $20,000 dejan de estar
// disponibles también para Privado — intencional, no un efecto accidental
// (arquitectura por capas, agosto 2026). Se usa tanto automáticamente al
// emitir (si se elige la casilla) como manualmente desde "Aplicar fondo" en
// el historial — una sola implementación del cálculo. La validación y el
// consumo son transaccionales bajo el lock de fila de Proyecto (ver
// aplicarFondoAEstimacion/emitirEstimacion), así que dos aplicaciones
// concurrentes nunca pueden aplicar el mismo dinero dos veces.
// ---------------------------------------------------------------------------

export async function aplicarFondoAEstimacionTx(
  tx: Cliente,
  ctx: { empresaId: string; proyectoId: string; usuarioId: string },
  estimacionClienteCapaId: string,
  // undefined = aplicar el máximo posible; con valor = tope adicional.
  montoSolicitado?: number
): Promise<{ aplicado: number }> {
  const movimientosProyecto = await tx.movimientoFinancieroCliente.findMany({
    where: { proyectoId: ctx.proyectoId },
    select: { tipo: true, monto: true, estimacionClienteCapaId: true },
  });
  // Fondo disponible del proyecto — SIEMPRE todas las capas juntas, nunca
  // particionado (ver comentario arriba).
  const disponible =
    suma(movimientosProyecto, "APORTACION_FONDO") - suma(movimientosProyecto, "APLICACION_ESTIMACION");
  if (disponible <= 0) return { aplicado: 0 };

  const capaRow = await tx.estimacionClienteCapa.findFirstOrThrow({ where: { id: estimacionClienteCapaId } });
  const cubiertoDeEsta = movimientosProyecto
    .filter((m) => m.estimacionClienteCapaId === estimacionClienteCapaId && m.tipo !== "APORTACION_FONDO")
    .reduce((t, m) => t + Number(m.monto), 0);
  const saldo = Number(capaRow.total) - cubiertoDeEsta;
  if (saldo <= 0) return { aplicado: 0 };

  const tope = montoSolicitado !== undefined ? Math.min(montoSolicitado, disponible) : disponible;
  const aplicar = Math.min(tope, saldo);
  if (aplicar <= 0) return { aplicado: 0 };

  const movimiento = await tx.movimientoFinancieroCliente.create({
    data: {
      empresaId: ctx.empresaId,
      proyectoId: ctx.proyectoId,
      tipo: "APLICACION_ESTIMACION",
      monto: aplicar,
      fecha: new Date(),
      estimacionClienteCapaId,
      registradoPorId: ctx.usuarioId,
    },
  });
  await registrarAuditoriaTx(tx, {
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    entidad: "MovimientoFinancieroCliente",
    entidadId: movimiento.id,
    accion: "CREAR",
    valorNuevo: { tipo: "APLICACION_ESTIMACION", monto: aplicar, estimacionClienteCapaId },
  });
  return { aplicado: aplicar };
}

const MontoAplicacionSchema = z.coerce.number().positive("El monto debe ser mayor a cero.").optional();

function puedeRegistrarParaCapa(usuario: UsuarioSesion, capa: CapaEstimacion): boolean {
  return capa === "PRIVADO"
    ? puedeRegistrarMovimientoFinancieroCliente(usuario)
    : puedeRegistrarMovimientoFinancieroClienteOperativo(usuario);
}

export async function aplicarFondoAEstimacion(
  usuario: UsuarioSesion,
  estimacionClienteCapaId: string,
  montoCrudo?: unknown
): Promise<{ aplicado: number }> {
  const empresaId = requerirEmpresa(usuario);
  const monto = MontoAplicacionSchema.parse(montoCrudo);

  const referencia = await db.estimacionClienteCapa.findFirst({
    where: { id: estimacionClienteCapaId, estimacionCliente: { empresaId } },
    select: { capa: true, estimacionCliente: { select: { proyectoId: true } } },
  });
  if (!referencia) throw new RegistroNoEncontradoError("La estimación");
  if (!puedeRegistrarParaCapa(usuario, referencia.capa)) throw new SinPermisoError();

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM proyectos WHERE id = ${referencia.estimacionCliente.proyectoId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM estimacion_cliente_capas WHERE id = ${estimacionClienteCapaId} FOR UPDATE`;

    const capaRow = await tx.estimacionClienteCapa.findFirst({
      where: { id: estimacionClienteCapaId, estimacionCliente: { empresaId } },
    });
    if (!capaRow) throw new RegistroNoEncontradoError("La estimación");
    if (capaRow.estatus !== "EMITIDA") {
      throw new ValidacionError("Solo se puede aplicar fondo a una estimación emitida.");
    }

    const resultado = await aplicarFondoAEstimacionTx(
      tx,
      { empresaId, proyectoId: referencia.estimacionCliente.proyectoId, usuarioId: usuario.id },
      estimacionClienteCapaId,
      monto
    );
    if (resultado.aplicado === 0) {
      throw new ValidacionError("No hay fondo disponible, o esta estimación ya está cubierta.");
    }
    return resultado;
  });
}

// ---------------------------------------------------------------------------
// Control Contractual — resumen de proyecto, sin acumulados persistidos.
// Existe tanto en Cliente (capa "operativo") como en Cliente Priv. (capa
// "privado"). `avanceContractual` varía según `capa` (monto de contrato,
// total estimado, saldo, % avance). `financiero` es la realidad de cobro de
// ESA MISMA capa — pagos/aplicaciones registrados contra estimaciones de esa
// capa, comparados contra el total emitido de esa misma capa (arquitectura
// por capas, agosto 2026: cada capa tiene su propio saldo independiente,
// nunca ancorado a la otra). El único dato realmente compartido entre capas
// es el fondo (`financiero.fondo`) — efectivo real del proyecto, ver
// aplicarFondoAEstimacionTx. `financiero` es `null` si el usuario no tiene
// permiso para verlo en esta capa.
// ---------------------------------------------------------------------------

export type CorteHistorico = {
  fechaCorte: Date;
  hastaSemanaFechaInicio: Date;
  montoContrato: number;
};

export type ControlContractual = {
  proyecto: {
    nombre: string;
    esquemaContractual: EsquemaContractual | null;
    fechaInicio: string | null;
  };
  avanceContractual: {
    montoContrato: number;
    totalEstimado: number;
    saldoPorEjercer: number;
    porcentajeEjercido: number;
  };
  financiero: {
    totalCubierto: number;
    pendienteFinancieroReal: number;
    fondo: { aportado: number; aplicado: number; disponible: number } | null;
  } | null;
};

// Exportada para el dashboard ejecutivo (Inicio) — mismo cálculo, ninguna
// fórmula nueva (agosto 2026).
export async function calcularMontoContrato(
  proyectoId: string,
  esquemaContractual: EsquemaContractual | null,
  porcentajesDefault: PorcentajesDefaultProyecto,
  capa: CapaValorizacion
): Promise<number> {
  const conceptos = await db.concepto.findMany({
    where: { partida: { proyectoId }, estatus: "ACTIVO" },
    select: {
      cantidadContratada: true,
      precioUnitarioContratista: true,
      precioUnitarioContratistaPrivado: true,
      precioUnitarioMateriales: true,
      precioUnitarioIndirectos: true,
      precioUnitarioHerramienta: true,
      porcentajeUtilidad: true,
      porcentajeAdministracion: true,
    },
  });

  return conceptos.reduce((total, c) => {
    const cantidadContratada = Number(c.cantidadContratada);
    if (capa === "privado") {
      const importes = calcularImportesConcepto(
        {
          precioUnitarioContratista: numOrNull(c.precioUnitarioContratista),
          precioUnitarioContratistaPrivado: numOrNull(c.precioUnitarioContratistaPrivado),
          precioUnitarioMateriales: numOrNull(c.precioUnitarioMateriales),
          precioUnitarioIndirectos: numOrNull(c.precioUnitarioIndirectos),
          precioUnitarioHerramienta: numOrNull(c.precioUnitarioHerramienta),
          porcentajeUtilidad: numOrNull(c.porcentajeUtilidad),
          porcentajeAdministracion: numOrNull(c.porcentajeAdministracion),
          cantidadContratada,
        },
        esquemaContractual,
        porcentajesDefault
      );
      return total + importes.importeTotal;
    }
    const importes = calcularImportesOperativoConcepto(
      {
        precioUnitarioContratista: numOrNull(c.precioUnitarioContratista),
        precioUnitarioMateriales: numOrNull(c.precioUnitarioMateriales),
        porcentajeAdministracion: numOrNull(c.porcentajeAdministracion),
        cantidadContratada,
      },
      esquemaContractual,
      porcentajesDefault.administracion
    );
    return total + importes.importeTotal;
  }, 0);
}

async function totalEmitidoPorCapa(
  proyectoId: string,
  capa: CapaEstimacion,
  hastaSemanaFechaInicio?: Date
): Promise<number> {
  const r = await db.estimacionClienteCapa.aggregate({
    where: {
      capa,
      estatus: "EMITIDA",
      estimacionCliente: {
        proyectoId,
        ...(hastaSemanaFechaInicio && { semana: { fechaInicio: { lte: hastaSemanaFechaInicio } } }),
      },
    },
    _sum: { total: true },
  });
  return Number(r._sum.total ?? 0);
}

export type EstimacionConCorte = {
  id: string;
  capa: CapaEstimacion;
  proyectoId: string;
  semanaId: string;
  numero: number;
  emitidoEn: Date | null;
  semanaFechaInicio: Date;
  semanaNumero: number;
  semanaAnio: number;
  corte: CorteHistorico;
  // Identidad de Empresa congelada al momento en que este documento se
  // generó por primera vez. Null solo si la capa fue emitida antes de que
  // este campo existiera (documento histórico previo a este cambio).
  branding: BrandingEmpresa | null;
};

// Fija (una sola vez, la primera vez que ESTA capa pide su documento) el
// instante de corte del ledger financiero y el monto del contrato de esta
// capa — lo mínimo que hace falta congelar para que el documento histórico
// sea reproducible para siempre. Independiente por capa (arquitectura por
// capas, agosto 2026): emitir/descargar Privado nunca fija ni modifica el
// corte de General. Si ya estaba fijado, lo devuelve tal cual.
export async function obtenerOFijarCorteDocumento(
  usuario: UsuarioSesion,
  estimacionClienteCapaId: string
): Promise<EstimacionConCorte> {
  const empresaId = requerirEmpresa(usuario);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM estimacion_cliente_capas WHERE id = ${estimacionClienteCapaId} FOR UPDATE`;

    const capaRow = await tx.estimacionClienteCapa.findFirst({
      where: { id: estimacionClienteCapaId, estimacionCliente: { empresaId } },
      include: {
        estimacionCliente: {
          include: {
            semana: { select: { fechaInicio: true, numero: true, anio: true } },
            proyecto: {
              select: {
                esquemaContractual: true,
                porcentajeUtilidadDefault: true,
                porcentajeAdministracionDefault: true,
                porcentajeAdministracionPrivadoDefault: true,
              },
            },
          },
        },
      },
    });
    if (!capaRow) throw new RegistroNoEncontradoError("La estimación");
    if (capaRow.estatus !== "EMITIDA") {
      throw new ValidacionError("Solo se puede generar el documento de una estimación emitida.");
    }

    let fechaCorteDocumento = capaRow.fechaCorteDocumento;
    let montoContrato = numOrNull(capaRow.montoContratoCongelado);
    let brandingSnapshot = capaRow.brandingSnapshot as BrandingEmpresa | null;

    if (!fechaCorteDocumento) {
      const { estimacionCliente } = capaRow;
      const porcentajesDefault: PorcentajesDefaultProyecto = {
        utilidad: numOrNull(estimacionCliente.proyecto.porcentajeUtilidadDefault),
        administracion: numOrNull(estimacionCliente.proyecto.porcentajeAdministracionDefault),
        administracionPrivado: numOrNull(estimacionCliente.proyecto.porcentajeAdministracionPrivadoDefault),
      };
      montoContrato = await calcularMontoContrato(
        estimacionCliente.proyectoId,
        estimacionCliente.proyecto.esquemaContractual,
        porcentajesDefault,
        capaRow.capa === "PRIVADO" ? "privado" : "operativo"
      );
      fechaCorteDocumento = new Date();
      // Identidad de Empresa AL MOMENTO en que este documento se genera por
      // primera vez — mismo criterio de congelamiento que montoContratoCongelado,
      // nunca se recalcula después (branding histórico, Portal Master).
      brandingSnapshot = await obtenerBrandingEmpresa(empresaId);
      await tx.estimacionClienteCapa.update({
        where: { id: estimacionClienteCapaId },
        data: { fechaCorteDocumento, montoContratoCongelado: montoContrato, brandingSnapshot },
      });
    }

    return {
      id: capaRow.id,
      capa: capaRow.capa,
      proyectoId: capaRow.estimacionCliente.proyectoId,
      semanaId: capaRow.estimacionCliente.semanaId,
      numero: capaRow.numero!,
      emitidoEn: capaRow.emitidoEn,
      semanaFechaInicio: capaRow.estimacionCliente.semana.fechaInicio,
      semanaNumero: capaRow.estimacionCliente.semana.numero,
      semanaAnio: capaRow.estimacionCliente.semana.anio,
      corte: {
        fechaCorte: fechaCorteDocumento,
        hastaSemanaFechaInicio: capaRow.estimacionCliente.semana.fechaInicio,
        montoContrato: montoContrato!,
      },
      branding: brandingSnapshot,
    };
  });
}

export async function obtenerControlContractual(
  usuario: UsuarioSesion,
  proyectoId: string,
  capa: CapaValorizacion,
  corte?: CorteHistorico
): Promise<ControlContractual> {
  const proyecto = await obtenerProyecto(usuario, proyectoId);
  const porcentajesDefault: PorcentajesDefaultProyecto = {
    utilidad: numOrNull(proyecto.porcentajeUtilidadDefault),
    administracion: numOrNull(proyecto.porcentajeAdministracionDefault),
    administracionPrivado: numOrNull(proyecto.porcentajeAdministracionPrivadoDefault),
  };
  const capaEnum = aCapaEstimacion(capa);

  const puedeVerFinanciero =
    capa === "privado" ? puedeVerFinancieroCliente(usuario) : puedeVerFinancieroClienteOperativo(usuario);
  const hastaSemanaFechaInicio = corte?.hastaSemanaFechaInicio;

  const [montoContrato, totalEmitidoCapa, movimientos] = await Promise.all([
    corte
      ? Promise.resolve(corte.montoContrato)
      : calcularMontoContrato(proyectoId, proyecto.esquemaContractual, porcentajesDefault, capa),
    totalEmitidoPorCapa(proyectoId, capaEnum, hastaSemanaFechaInicio),
    db.movimientoFinancieroCliente.findMany({
      where: { proyectoId, ...(corte && { createdAt: { lte: corte.fechaCorte } }) },
      select: { tipo: true, monto: true, estimacionClienteCapa: { select: { capa: true } } },
    }),
  ]);

  const saldoPorEjercer = montoContrato - totalEmitidoCapa;
  const porcentajeEjercido = montoContrato > 0 ? (totalEmitidoCapa / montoContrato) * 100 : 0;

  let financiero: ControlContractual["financiero"] = null;
  if (puedeVerFinanciero) {
    // Fondo — proyecto-wide, todas las capas juntas (efectivo real, único).
    const aportado = suma(movimientos, "APORTACION_FONDO");
    const aplicadoTotalProyecto = suma(movimientos, "APLICACION_ESTIMACION");

    // Situación financiera de ESTA capa — solo sus propios movimientos
    // (independiente de la otra capa, arquitectura por capas, agosto 2026).
    const movimientosDeEstaCapa = movimientos.filter((m) => m.estimacionClienteCapa?.capa === capaEnum);
    const aplicadoEstaCapa = suma(movimientosDeEstaCapa, "APLICACION_ESTIMACION");
    const pagadoEstaCapa = suma(movimientosDeEstaCapa, "PAGO_ESTIMACION");
    const totalCubierto = aplicadoEstaCapa + pagadoEstaCapa;

    financiero = {
      totalCubierto,
      pendienteFinancieroReal: totalEmitidoCapa - totalCubierto,
      fondo: aportado > 0 ? { aportado, aplicado: aplicadoTotalProyecto, disponible: aportado - aplicadoTotalProyecto } : null,
    };
  }

  return {
    proyecto: {
      nombre: proyecto.nombre,
      esquemaContractual: proyecto.esquemaContractual,
      fechaInicio: proyecto.fechaInicio?.toISOString() ?? null,
    },
    avanceContractual: {
      montoContrato,
      totalEstimado: totalEmitidoCapa,
      saldoPorEjercer,
      porcentajeEjercido,
    },
    financiero,
  };
}

// ---------------------------------------------------------------------------
// Historial semanal — una fila por EstimacionClienteCapa EMITIDA de la capa
// pedida. Estado siempre derivado de los movimientos de ESA capa, nunca
// persistido ni anclado a la otra capa.
// ---------------------------------------------------------------------------

export type EstadoPagoEstimacion = "PENDIENTE" | "PARCIAL" | "CUBIERTA";

export type FilaHistorialEstimacion = {
  id: string;
  numero: number;
  semanaNumero: number;
  semanaAnio: number;
  importe: number;
  emitidoEn: string | null;
  financiero: {
    aplicadoFondo: number;
    pagoDirecto: number;
    pendiente: number;
    estado: EstadoPagoEstimacion;
  } | null;
};

export async function obtenerHistorialEstimacionesCliente(
  usuario: UsuarioSesion,
  proyectoId: string,
  capa: CapaValorizacion,
  corte?: CorteHistorico
): Promise<FilaHistorialEstimacion[]> {
  await obtenerProyecto(usuario, proyectoId);
  const puedeVerFinanciero =
    capa === "privado" ? puedeVerFinancieroCliente(usuario) : puedeVerFinancieroClienteOperativo(usuario);
  const capaEnum = aCapaEstimacion(capa);

  const capas = await db.estimacionClienteCapa.findMany({
    where: {
      capa: capaEnum,
      estatus: "EMITIDA",
      estimacionCliente: {
        proyectoId,
        ...(corte && { semana: { fechaInicio: { lte: corte.hastaSemanaFechaInicio } } }),
      },
    },
    include: {
      estimacionCliente: { include: { semana: { select: { numero: true, anio: true, fechaInicio: true } } } },
      movimientosFinancieros: {
        select: { tipo: true, monto: true },
        ...(corte && { where: { createdAt: { lte: corte.fechaCorte } } }),
      },
    },
    orderBy: { estimacionCliente: { semana: { fechaInicio: "asc" } } },
  });

  return capas.map((c) => {
    const importe = Number(c.total);

    let financiero: FilaHistorialEstimacion["financiero"] = null;
    if (puedeVerFinanciero) {
      const aplicadoFondo = suma(c.movimientosFinancieros, "APLICACION_ESTIMACION");
      const pagoDirecto = suma(c.movimientosFinancieros, "PAGO_ESTIMACION");
      const pendiente = importe - aplicadoFondo - pagoDirecto;
      const estado: EstadoPagoEstimacion =
        pendiente <= 0 ? "CUBIERTA" : aplicadoFondo > 0 || pagoDirecto > 0 ? "PARCIAL" : "PENDIENTE";
      financiero = { aplicadoFondo, pagoDirecto, pendiente, estado };
    }

    return {
      id: c.id,
      numero: c.numero!,
      semanaNumero: c.estimacionCliente.semana.numero,
      semanaAnio: c.estimacionCliente.semana.anio,
      importe,
      emitidoEn: c.emitidoEn?.toISOString() ?? null,
      financiero,
    };
  });
}

// ---------------------------------------------------------------------------
// Aportaciones al fondo — solo aumentan lo disponible; nunca aplican nada
// por sí solas.
// ---------------------------------------------------------------------------

export type FilaAportacionFondo = {
  id: string;
  fecha: string;
  referencia: string | null;
  notas: string | null;
  monto: number;
  registradoPorNombre: string;
};

export async function obtenerAportacionesFondo(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<FilaAportacionFondo[]> {
  // El fondo es una sola cifra compartida por ambas capas (no hay un "fondo
  // operativo" distinto de un "fondo privado"). Se usa el gate operativo
  // (superset del privado) para que la página Cliente normal, que ya decide
  // mostrar este bloque sin Vista privada, no choque aquí con un gate más
  // estricto.
  if (!puedeVerFinancieroClienteOperativo(usuario)) throw new SinPermisoError();
  await obtenerProyecto(usuario, proyectoId);

  const aportaciones = await db.movimientoFinancieroCliente.findMany({
    where: { proyectoId, tipo: "APORTACION_FONDO" },
    include: { registradoPor: { select: { nombre: true } } },
    orderBy: { fecha: "desc" },
  });

  return aportaciones.map((a) => ({
    id: a.id,
    fecha: a.fecha.toISOString(),
    referencia: a.referencia,
    notas: a.notas,
    monto: Number(a.monto),
    registradoPorNombre: a.registradoPor.nombre,
  }));
}

const DatosMovimientoSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a cero."),
  fecha: z.coerce.date(),
  referencia: z.string().trim().optional().nullable(),
  notas: z.string().trim().optional().nullable(),
});

export async function registrarAportacionFondo(
  usuario: UsuarioSesion,
  proyectoId: string,
  datosCrudos: unknown
) {
  if (!puedeRegistrarMovimientoFinancieroCliente(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosMovimientoSchema.parse(datosCrudos);
  await obtenerProyecto(usuario, proyectoId);

  const movimiento = await db.movimientoFinancieroCliente.create({
    data: {
      empresaId,
      proyectoId,
      tipo: "APORTACION_FONDO",
      monto: datos.monto,
      fecha: datos.fecha,
      referencia: datos.referencia || null,
      notas: datos.notas || null,
      registradoPorId: usuario.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "MovimientoFinancieroCliente",
    entidadId: movimiento.id,
    accion: "CREAR",
    valorNuevo: { tipo: "APORTACION_FONDO", monto: datos.monto, fecha: datos.fecha.toISOString() },
  });

  return movimiento;
}

// ---------------------------------------------------------------------------
// Registrar pago directo de una estimación (una capa) — el saldo pendiente
// descuenta tanto aplicaciones de fondo como pagos ya registrados de ESA
// MISMA capa (una capa puede tener ambos a la vez, independiente de la
// otra). Toma el lock del proyecto además del de la propia capa: el saldo
// depende de aplicaciones de fondo que "Aplicar fondo" también escribe bajo
// el lock del proyecto.
// ---------------------------------------------------------------------------

export async function registrarPagoEstimacion(
  usuario: UsuarioSesion,
  estimacionClienteCapaId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosMovimientoSchema.parse(datosCrudos);

  const referencia = await db.estimacionClienteCapa.findFirst({
    where: { id: estimacionClienteCapaId, estimacionCliente: { empresaId } },
    select: { capa: true, estimacionCliente: { select: { proyectoId: true } } },
  });
  if (!referencia) throw new RegistroNoEncontradoError("La estimación");
  if (!puedeRegistrarParaCapa(usuario, referencia.capa)) throw new SinPermisoError();

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM proyectos WHERE id = ${referencia.estimacionCliente.proyectoId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM estimacion_cliente_capas WHERE id = ${estimacionClienteCapaId} FOR UPDATE`;

    const capaRow = await tx.estimacionClienteCapa.findFirst({
      where: { id: estimacionClienteCapaId, estimacionCliente: { empresaId } },
    });
    if (!capaRow) throw new RegistroNoEncontradoError("La estimación");
    if (capaRow.estatus !== "EMITIDA") {
      throw new ValidacionError("Solo se pueden registrar pagos sobre una estimación emitida.");
    }

    const movimientosPrevios = await tx.movimientoFinancieroCliente.findMany({
      where: { estimacionClienteCapaId, tipo: { in: ["PAGO_ESTIMACION", "APLICACION_ESTIMACION"] } },
      select: { tipo: true, monto: true },
    });
    const totalPagado = suma(movimientosPrevios, "PAGO_ESTIMACION");
    const totalAplicado = suma(movimientosPrevios, "APLICACION_ESTIMACION");
    const saldoPendiente = Number(capaRow.total) - totalPagado - totalAplicado;

    if (datos.monto > saldoPendiente) {
      throw new ValidacionError(`El pago excede el saldo pendiente (${formatMoney(saldoPendiente)}).`);
    }

    const movimiento = await tx.movimientoFinancieroCliente.create({
      data: {
        empresaId,
        proyectoId: referencia.estimacionCliente.proyectoId,
        tipo: "PAGO_ESTIMACION",
        monto: datos.monto,
        fecha: datos.fecha,
        referencia: datos.referencia || null,
        notas: datos.notas || null,
        estimacionClienteCapaId,
        registradoPorId: usuario.id,
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "MovimientoFinancieroCliente",
      entidadId: movimiento.id,
      accion: "CREAR",
      valorNuevo: { tipo: "PAGO_ESTIMACION", monto: datos.monto, estimacionClienteCapaId },
    });

    return movimiento;
  });
}
