import "server-only";
import { db } from "@/lib/server/db";
import { puedeVerContabilidad } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";
import { obtenerFacturasPendientes } from "./facturas-pendientes";

// Contabilidad se consulta por MES — ciclo fiscal, deliberadamente distinto
// del ciclo semanal de Reporte General (nunca se mezclan, Contabilidad,
// septiembre 2026).

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function rangoMes(anio: number, mes: number): { desde: Date; hasta: Date } {
  return { desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 1) };
}

export type ResumenMensualContabilidad = {
  ingresosFiscales: number;
  egresosFiscales: number;
  resultado: number;
  facturasPendientes: number;
};

export type ResumenFiscalPeriodo = {
  ingresosFiscales: number;
  egresosFiscales: number;
  resultado: number;
};

// Núcleo reutilizable por rango de fechas arbitrario — Contabilidad lo envuelve
// para su ciclo mensual (obtenerResumenMensual, abajo); Inicio/Dashboard lo
// llama directo con su propio rango (semana/mes/mes anterior/acumulado), sin
// duplicar la fórmula (Rediseño de Inicio, septiembre 2026). Requiere
// permiso de Contabilidad — el dashboard solo lo invoca cuando
// puedeVerContabilidad(usuario), igual que cualquier otro dato fiscal.
export async function obtenerResumenFiscalPeriodo(
  usuario: UsuarioSesion,
  desde: Date,
  hasta: Date
): Promise<ResumenFiscalPeriodo> {
  const empresaId = requerirContabilidad(usuario);

  const [pagosCliente, ingresosManuales, gastosFiscales, egresosManuales] = await Promise.all([
    db.movimientoFinancieroCliente.aggregate({
      where: {
        empresaId,
        estatus: "VIGENTE",
        tipo: { in: ["PAGO_ESTIMACION", "APORTACION_FONDO"] },
        fecha: { gte: desde, lt: hasta },
      },
      _sum: { monto: true },
    }),
    db.ingreso.aggregate({
      where: { empresaId, movimientoFinancieroClienteId: null, estatus: "VIGENTE", fecha: { gte: desde, lt: hasta } },
      _sum: { monto: true },
    }),
    db.gastoObra.aggregate({
      where: { empresaId, estatus: "APROBADO", requiereFactura: true, fecha: { gte: desde, lt: hasta } },
      _sum: { monto: true },
    }),
    db.egreso.aggregate({
      where: { empresaId, gastoObraId: null, estatus: "VIGENTE", fecha: { gte: desde, lt: hasta } },
      _sum: { monto: true },
    }),
  ]);

  const ingresosFiscales = Number(pagosCliente._sum.monto ?? 0) + Number(ingresosManuales._sum.monto ?? 0);
  const egresosFiscales = Number(gastosFiscales._sum.monto ?? 0) + Number(egresosManuales._sum.monto ?? 0);

  return { ingresosFiscales, egresosFiscales, resultado: ingresosFiscales - egresosFiscales };
}

export async function obtenerResumenMensual(
  usuario: UsuarioSesion,
  anio: number,
  mes: number
): Promise<ResumenMensualContabilidad> {
  const { desde, hasta } = rangoMes(anio, mes);
  const [resumen, facturasPendientes] = await Promise.all([
    obtenerResumenFiscalPeriodo(usuario, desde, hasta),
    obtenerFacturasPendientes(usuario),
  ]);

  return { ...resumen, facturasPendientes: facturasPendientes.length };
}
