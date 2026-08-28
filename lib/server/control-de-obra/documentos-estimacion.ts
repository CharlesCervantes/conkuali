import "server-only";
import { puedeVerContratoGeneralPrivado } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { formatearRangoSemana } from "@/lib/server/semanas";
import { db } from "@/lib/server/db";
import {
  obtenerOFijarCorteDocumento,
  obtenerControlContractual,
  obtenerHistorialEstimacionesCliente,
  type CapaValorizacion,
  type ControlContractual,
  type FilaHistorialEstimacion,
} from "./financiero-cliente";
import {
  obtenerEstimacionCliente,
  type FilaEstimacionCapa,
  type FilaGastoEstimacion,
} from "./estimacion-cliente";
import { SinPermisoError, obtenerProyecto } from "./proyectos";

// Orquestador del documento histórico (Control Contractual al corte +
// Estimación semanal) — solo obtención de datos, cero cálculo propio y cero
// render. Reutiliza obtenerOFijarCorteDocumento (fija el corte de ESTA capa,
// independiente de la otra), y las mismas funciones ya usadas por las
// pantallas en vivo — una sola fuente de verdad para la realidad financiera
// y el avance contractual, nunca un segundo cálculo para el PDF. Una vez que
// una capa está EMITIDA, el documento se reconstruye EXCLUSIVAMENTE desde
// snapshots congelados (EstimacionClienteConcepto, EstimacionClienteCapaConcepto,
// EstimacionClienteGasto/detalle, montoContratoCongelado) — nunca depende de
// valores actuales de Concepto/Partida/Proyecto (arquitectura por capas,
// agosto 2026).

export type FilaEstimacionDocumento = {
  partidaNombre: string;
  descripcionConcepto: string;
  unidad: string;
  cantidadContratada: number;
  precioUnitario: number;
  importeContratado: number;
  cantidadAnterior: number;
  cantidadEstaSemana: number;
  cantidadAcumulada: number;
  importeEstaSemana: number;
  importeAcumulado: number;
  cantidadPorEjercer: number;
  importePorEjercer: number;
};

export type DatosDocumentoEstimacion = {
  empresaNombre: string;
  proyectoNombre: string;
  capa: CapaValorizacion;
  numero: number;
  semanaLabel: string;
  emitidoEn: string | null;
  fechaCorteDocumento: string;
  controlContractual: ControlContractual;
  historial: FilaHistorialEstimacion[];
  estimacionSemanal: {
    subtotalTrabajos: number;
    administracion: number;
    gastosCobrables: number;
    aplicaIVA: boolean;
    porcentajeIVA: number | null;
    montoIVA: number;
    total: number;
    filas: FilaEstimacionDocumento[];
    gastos: FilaGastoEstimacion[];
  };
};

function aFilaDocumento(f: FilaEstimacionCapa): FilaEstimacionDocumento {
  return {
    partidaNombre: f.partidaNombre,
    descripcionConcepto: f.descripcionConcepto,
    unidad: f.unidad,
    cantidadContratada: f.cantidadContratada,
    precioUnitario: f.precioUnitarioBase,
    importeContratado: f.importeContratado,
    cantidadAnterior: f.cantidadAnterior,
    cantidadEstaSemana: f.cantidadEstaSemana,
    cantidadAcumulada: f.cantidadAcumulada,
    importeEstaSemana: f.importeEstaSemana,
    importeAcumulado: f.importeAcumulado,
    cantidadPorEjercer: f.cantidadPorEjercer,
    importePorEjercer: f.importePorEjercer,
  };
}

export async function obtenerDatosDocumentoEstimacion(
  usuario: UsuarioSesion,
  estimacionClienteCapaId: string,
  capa: CapaValorizacion
): Promise<DatosDocumentoEstimacion> {
  // Cliente Priv. exige el permiso completo de capa privada antes de
  // calcular nada — mismo gate que la página, para que la ruta PDF nunca sea
  // una forma de evadirlo.
  if (capa === "privado" && !puedeVerContratoGeneralPrivado(usuario)) throw new SinPermisoError();

  const estimacionCorte = await obtenerOFijarCorteDocumento(usuario, estimacionClienteCapaId);
  const [proyecto, semana, congelado, controlContractual, historial] = await Promise.all([
    obtenerProyecto(usuario, estimacionCorte.proyectoId),
    db.semana.findUniqueOrThrow({
      where: { id: estimacionCorte.semanaId },
      select: { numero: true, anio: true, fechaInicio: true, fechaFin: true },
    }),
    obtenerEstimacionCliente(usuario, estimacionCorte.proyectoId, estimacionCorte.semanaId, estimacionCorte.capa),
    obtenerControlContractual(usuario, estimacionCorte.proyectoId, capa, estimacionCorte.corte),
    obtenerHistorialEstimacionesCliente(usuario, estimacionCorte.proyectoId, capa, estimacionCorte.corte),
  ]);

  // Una capa EMITIDA siempre tiene snapshot congelado — obtenerOFijarCorteDocumento
  // ya validó estatus === EMITIDA, así que esto nunca debería ser null.
  if (!congelado) throw new Error("Estimación emitida sin snapshot congelado — estado inconsistente.");

  return {
    empresaNombre: usuario.empresa?.nombre ?? "",
    proyectoNombre: proyecto.nombre,
    capa,
    numero: estimacionCorte.numero,
    semanaLabel: formatearRangoSemana(semana),
    emitidoEn: estimacionCorte.emitidoEn?.toISOString() ?? null,
    fechaCorteDocumento: estimacionCorte.corte.fechaCorte.toISOString(),
    controlContractual,
    historial,
    estimacionSemanal: {
      subtotalTrabajos: congelado.estimacion.subtotal,
      administracion: congelado.estimacion.montoAdministracionTrabajos,
      gastosCobrables: congelado.estimacion.subtotalGastosCobrables,
      aplicaIVA: congelado.estimacion.aplicaIVA,
      porcentajeIVA: congelado.estimacion.porcentajeIVA,
      montoIVA: congelado.estimacion.montoIVA,
      total: congelado.estimacion.total,
      filas: congelado.filas.map(aFilaDocumento),
      gastos: congelado.gastos,
    },
  };
}
