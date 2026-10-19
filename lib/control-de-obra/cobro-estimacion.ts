// ---------------------------------------------------------------------------
// Cobro de una estimación de cliente — fórmulas puras (sin BD), única fuente
// de verdad para Control de Obra (Cliente / Cliente Priv.), las validaciones
// de saldo y el Dashboard Inicio (E1 + Por cobrar, octubre 2026).
//
// Cobro real de una estimación = Σ movimientos VIGENTES de tipo
// PAGO_ESTIMACION / APLICACION_ESTIMACION de AMBAS capas. No duplica dinero:
// una vez emitida la capa Privado, Operativo deja de aceptar movimientos
// ("una sola realidad de dinero", financiero-cliente.ts), así que cada
// depósito vive en una sola capa. Los cobros de Operativo registrados ANTES
// de emitir Privado se reconocen tal cual, sin moverlos ni modificarlos.
// Ver design/prototypes/dashboard-inicio/diseno-e1-por-cobrar.md.
// ---------------------------------------------------------------------------

export type CapaCobro = "OPERATIVO" | "PRIVADO";
export type EstadoCobro = "PENDIENTE" | "PARCIAL" | "CUBIERTA";

export type MovimientoCobro = {
  id: string;
  tipo: string;
  monto: number | { toString(): string };
  fecha: Date;
  createdAt: Date;
  // Si viene, solo "VIGENTE" cuenta (un movimiento CANCELADO nunca participa).
  estatus?: string;
};

export type CapaDeEstimacion = {
  capa: CapaCobro;
  estatus: string;
  total: number | { toString(): string };
  movimientos: MovimientoCobro[];
};

const TIPOS_COBRO = new Set(["PAGO_ESTIMACION", "APLICACION_ESTIMACION"]);

// Redondeo a centavos — solo para cifras derivadas de un tope/proporción, que
// pueden dejar residuos de punto flotante.
export function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

const monto = (m: MovimientoCobro) => Number(m.monto);

function esCobroVigente(m: MovimientoCobro): boolean {
  return TIPOS_COBRO.has(m.tipo) && (m.estatus === undefined || m.estatus === "VIGENTE");
}

// Orden cronológico determinista: fecha, luego hora de registro, luego id.
export function ordenarCobros(movimientos: MovimientoCobro[]): MovimientoCobro[] {
  return movimientos
    .filter(esCobroVigente)
    .sort(
      (a, b) =>
        a.fecha.getTime() - b.fecha.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
}

export function cobroReal(movimientos: MovimientoCobro[], excluirId?: string): number {
  return movimientos.filter((m) => esCobroVigente(m) && m.id !== excluirId).reduce((t, m) => t + monto(m), 0);
}

// Saldo que todavía puede cobrarse de una estimación contra su total real
// (Privado emitido si existe, si no Operativo). Negativo = sobrecobro previo.
export function saldoDisponible(totalReal: number, movimientos: MovimientoCobro[], excluirId?: string): number {
  return redondear(totalReal - cobroReal(movimientos, excluirId));
}

// Situación de cobro contra un importe (el de la capa que se consulta):
// cubierto = min(cobro real, importe). La composición fondo / pago directo
// se reparte en la misma proporción real cuando hay tope — nunca inventa una
// composición distinta. Sin tope, los montos son las sumas reales tal cual
// (mismo resultado que antes de este cambio).
export function calcularCobroEstimacion(
  importe: number,
  movimientos: MovimientoCobro[]
): { aplicadoFondo: number; pagoDirecto: number; pendiente: number; estado: EstadoCobro; excedente: number } {
  const vigentes = movimientos.filter(esCobroVigente);
  const aplicadoReal = vigentes.filter((m) => m.tipo === "APLICACION_ESTIMACION").reduce((t, m) => t + monto(m), 0);
  const pagoReal = vigentes.filter((m) => m.tipo === "PAGO_ESTIMACION").reduce((t, m) => t + monto(m), 0);
  const real = aplicadoReal + pagoReal;

  let aplicadoFondo = aplicadoReal;
  let pagoDirecto = pagoReal;
  if (real > importe) {
    const factor = real > 0 ? importe / real : 0;
    aplicadoFondo = redondear(aplicadoReal * factor);
    pagoDirecto = redondear(pagoReal * factor);
  }
  const pendiente = redondear(importe - aplicadoFondo - pagoDirecto);
  const estado: EstadoCobro = pendiente <= 0 ? "CUBIERTA" : aplicadoFondo > 0 || pagoDirecto > 0 ? "PARCIAL" : "PENDIENTE";
  return { aplicadoFondo, pagoDirecto, pendiente, estado, excedente: Math.max(0, redondear(real - importe)) };
}

// Capa "real" de una estimación — la única que puede recibir cobros nuevos y
// contra cuyo total se mide el saldo: Privado si está emitida, si no Operativo.
export function capaRealDeEstimacion(capas: Pick<CapaDeEstimacion, "capa" | "estatus">[]): CapaCobro {
  return capas.some((c) => c.capa === "PRIVADO" && c.estatus === "EMITIDA") ? "PRIVADO" : "OPERATIVO";
}

// Situación de UNA capa emitida, con el cobro real de toda su estimación.
// `sobrecobro` solo se informa en la capa real (en Operativo con Privado
// emitida, cobrar más que el importe Operativo es normal — el excedente es
// información privada y nunca se expone ahí).
export function situacionCobroCapa(
  capa: CapaCobro,
  importe: number,
  capasDeLaEstimacion: CapaDeEstimacion[]
): { aplicadoFondo: number; pagoDirecto: number; pendiente: number; estado: EstadoCobro; sobrecobro: number } {
  const movimientos = capasDeLaEstimacion.flatMap((c) => c.movimientos);
  const { excedente, ...resto } = calcularCobroEstimacion(importe, movimientos);
  const esCapaReal = capaRealDeEstimacion(capasDeLaEstimacion) === capa;
  return { ...resto, sobrecobro: esCapaReal ? excedente : 0 };
}

// ---------------------------------------------------------------------------
// E1 — Flujo General: tope cronológico por estimación
// ---------------------------------------------------------------------------

export type CobroAtribuido = {
  id: string;
  tipo: string;
  fecha: Date;
  montoReal: number;
  // Parte del cobro que cabe dentro del importe General (consume el tope,
  // sea pago o aplicación de fondo).
  avanceGeneral: number;
  // Entrada de dinero a valores General: avanceGeneral si es pago; 0 si es
  // aplicación de fondo (ese dinero ya entró como aportación).
  entradaGeneral: number;
};

// Recorre los cobros vigentes de UNA estimación en orden cronológico y
// atribuye a cada uno lo que cabe dentro de su importe General:
// avance_k = min(R_k, importeGeneral) − min(R_{k−1}, importeGeneral).
// Pagos y aplicaciones consumen el tope en conjunto.
export function atribuirCobrosGeneral(importeGeneral: number, movimientos: MovimientoCobro[]): CobroAtribuido[] {
  let acumulado = 0;
  let reconocido = 0;
  return ordenarCobros(movimientos).map((m) => {
    acumulado += monto(m);
    const hasta = Math.min(acumulado, importeGeneral);
    const avanceGeneral = redondear(Math.max(0, hasta - reconocido));
    reconocido = Math.max(reconocido, hasta);
    return {
      id: m.id,
      tipo: m.tipo,
      fecha: m.fecha,
      montoReal: monto(m),
      avanceGeneral,
      entradaGeneral: m.tipo === "PAGO_ESTIMACION" ? avanceGeneral : 0,
    };
  });
}
