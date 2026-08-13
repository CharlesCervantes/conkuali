import type { ReporteObra } from "@/lib/server/reporte-general/queries";
import type { EstatusPago } from "@/lib/generated/prisma/enums";

function filasDe(obra: ReporteObra) {
  return [...obra.contratistas, ...obra.proveedores, ...obra.administracion];
}

// Un solo indicador de estado por proyecto: el caso más urgente manda
// (pendiente de pago > cubierto por puente > liquidado > sin movimiento).
export function calcularEstadoProyecto(obra: ReporteObra): EstatusPago | null {
  const filas = filasDe(obra);
  if (filas.some((f) => f.estatusPago === "PENDIENTE_PAGO")) return "PENDIENTE_PAGO";
  if (filas.some((f) => f.estatusPago === "PAGADO_PUENTE")) return "PAGADO_PUENTE";
  if (filas.some((f) => f.estatusPago === "LIQUIDADO")) return "LIQUIDADO";
  return null;
}

// Para los filtros (Pendientes/Puente/Liquidados): un proyecto aparece si
// tiene AL MENOS una fila en ese estatus, aunque el badge de arriba (rollup)
// esté mostrando otro por prioridad.
export function obraTieneEstado(obra: ReporteObra, estatus: EstatusPago): boolean {
  return filasDe(obra).some((f) => f.estatusPago === estatus);
}

// Quita acentos para que la búsqueda no dependa de escribirlos exactamente.
const DIACRITICOS = /[̀-ͯ]/g;

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase();
}

export function obraCoincideBusqueda(obra: ReporteObra, q: string): boolean {
  const query = normalizar(q);
  if (normalizar(obra.proyecto.nombre).includes(query)) return true;
  return filasDe(obra).some((f) => normalizar(f.nombre).includes(query));
}
