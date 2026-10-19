// ---------------------------------------------------------------------------
// Estado de pago de una Reposición — fórmula pura (sin BD), única fuente para
// Reporte General, la pantalla de Reposiciones y la validación al liquidar
// (R2, octubre 2026).
//
// - Importe original = Σ gastos de la reposición (mismo criterio que
//   asignarGastoAReposicionTx).
// - Pagado = Σ abonos. Desde R2, toda liquidación de Reporte General registra
//   el abono final por el saldo, así que en una reposición nueva y pagada
//   Σ abonos = importe original.
// - El MovimientoSemanal conserva el importe original y solo marca el estado
//   de liquidación: abono final + movimiento LIQUIDADO son DOS
//   representaciones de la MISMA obligación, nunca dos pagos.
//
// Históricas (anteriores a R2), sin corregir nunca nada automáticamente:
// - Clase A: liquidada y consistente (sin abonos — pagada desde Reporte
//   General — o con abonos que suman el total) → PAGADA, pendiente 0.
// - Clase B: cualquier inconsistencia entre abonos, liquidación, cierre o
//   importe del movimiento → REQUIERE_REVISION, con sus cifras tal cual.
// ---------------------------------------------------------------------------

const EPSILON = 0.005;
const redondear = (n: number) => Math.round(n * 100) / 100;

export type EstadoReposicion = "ABIERTA" | "PAGADA" | "REQUIERE_REVISION";

export type MotivoRevisionReposicion =
  | "ABONOS_EXCEDEN_TOTAL"
  | "ABONOS_PARCIALES_Y_LIQUIDACION"
  | "CERRADA_SIN_LIQUIDAR"
  | "LIQUIDADA_SIN_CERRAR"
  | "MOVIMIENTO_DISTINTO_AL_TOTAL";

export type DatosEstadoReposicion = {
  total: number;
  abonado: number;
  cerrada: boolean;
  // Estado de pago del MovimientoSemanal de la reposición (null si aún no existe).
  estatusPago: string | null;
  // Importe del movimiento (entre semana + fin de semana); null si no existe.
  montoMovimiento: number | null;
};

export type ResultadoEstadoReposicion = {
  estado: EstadoReposicion;
  motivos: MotivoRevisionReposicion[];
  // Lo que falta pagar. 0 en una PAGADA; en REQUIERE_REVISION se informa tal
  // cual (total − abonos), sin corregir.
  saldoPendiente: number;
};

export function motivosDeRevision(d: DatosEstadoReposicion): MotivoRevisionReposicion[] {
  const liquidada = d.estatusPago === "LIQUIDADO";
  const motivos: MotivoRevisionReposicion[] = [];
  if (d.abonado > d.total + EPSILON) motivos.push("ABONOS_EXCEDEN_TOTAL");
  if (liquidada && d.abonado > EPSILON && d.abonado < d.total - EPSILON) motivos.push("ABONOS_PARCIALES_Y_LIQUIDACION");
  if (d.cerrada && !liquidada) motivos.push("CERRADA_SIN_LIQUIDAR");
  if (!d.cerrada && liquidada) motivos.push("LIQUIDADA_SIN_CERRAR");
  if (d.montoMovimiento !== null && Math.abs(d.montoMovimiento - d.total) > EPSILON) motivos.push("MOVIMIENTO_DISTINTO_AL_TOTAL");
  return motivos;
}

export function estadoDeReposicion(d: DatosEstadoReposicion): ResultadoEstadoReposicion {
  const motivos = motivosDeRevision(d);
  const saldo = redondear(d.total - d.abonado);
  if (motivos.length > 0) return { estado: "REQUIERE_REVISION", motivos, saldoPendiente: saldo };
  if (d.estatusPago === "LIQUIDADO") return { estado: "PAGADA", motivos, saldoPendiente: 0 };
  return { estado: "ABIERTA", motivos, saldoPendiente: saldo };
}
