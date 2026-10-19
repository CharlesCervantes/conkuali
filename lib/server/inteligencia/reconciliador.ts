import "server-only";

// Motor de reconciliación GENÉRICO — combina un valor de una fuente
// determinística y uno de una fuente de IA, y produce exactamente un estado
// de los cuatro posibles. Nunca conoce qué campo está reconciliando ni para
// qué módulo — eso lo decide quien lo llama (ej.
// lib/server/contabilidad/documentos/reconciliar-egreso.ts). Ningún valor
// llega a CONFIRMADO por una puntuación de confianza global: siempre pasa
// por el validador de formato de ESTE campo y, si ambas fuentes tienen un
// valor, deben coincidir después de normalizar — nunca se elige una fuente
// silenciosamente (Carga inteligente de documentos, V1 — octubre 2026).

export type Fuente = "DETERMINISTICO" | "IA" | "AMBOS" | "NINGUNA";
export type Estado = "CONFIRMADO" | "PROPUESTO" | "CONFLICTO" | "NO_DETECTADO";

export type CampoReconciliado<T> = {
  campo: string;
  valor: T | null;
  fuente: Fuente;
  estado: Estado;
  requiereRevision: boolean;
  nota?: string;
};

export function reconciliarCampo<T>(args: {
  campo: string;
  detValor: T | null;
  iaValor: T | null;
  formatoValido: (v: T) => boolean;
  normalizar: (v: T) => string;
}): CampoReconciliado<T> {
  const detOk = args.detValor !== null && args.formatoValido(args.detValor);
  const iaOk = args.iaValor !== null && args.formatoValido(args.iaValor);

  if (!detOk && !iaOk) {
    const descartado = (args.detValor !== null && !detOk) || (args.iaValor !== null && !iaOk);
    return {
      campo: args.campo,
      valor: null,
      fuente: "NINGUNA",
      estado: "NO_DETECTADO",
      requiereRevision: false,
      nota: descartado ? "un valor existía pero no pasó la validación de formato — se descartó, no se usó" : undefined,
    };
  }

  if (detOk && iaOk) {
    const dn = args.normalizar(args.detValor as T);
    const inn = args.normalizar(args.iaValor as T);
    if (dn === inn) {
      return { campo: args.campo, valor: args.detValor, fuente: "AMBOS", estado: "CONFIRMADO", requiereRevision: false };
    }
    return {
      campo: args.campo,
      valor: null,
      fuente: "AMBOS",
      estado: "CONFLICTO",
      requiereRevision: true,
      nota: `determinístico=${JSON.stringify(args.detValor)} vs IA=${JSON.stringify(args.iaValor)} — nunca se elige uno silenciosamente`,
    };
  }

  // Una sola fuente válida — SIEMPRE PROPUESTO, nunca CONFIRMADO. Ninguna
  // fuente única es verdad por sí sola (el propio parser determinístico
  // también se ha equivocado en benchmarks reales de esta sesión).
  const valor = detOk ? args.detValor : args.iaValor;
  const fuente: Fuente = detOk ? "DETERMINISTICO" : "IA";
  return { campo: args.campo, valor, fuente, estado: "PROPUESTO", requiereRevision: true };
}

// Degrada a CONFLICTO cualquier campo de la lista que haya llegado a
// CONFIRMADO si una validación externa (ej. subtotal+IVA=total) resultó
// inconsistente — la coincidencia entre dos fuentes nunca es suficiente por
// sí sola si el propio dato es matemáticamente imposible.
export function degradarSiInconsistente<T>(
  campos: CampoReconciliado<T>[],
  consistente: boolean | null,
  nota: string
): void {
  if (consistente !== false) return;
  for (const c of campos) {
    if (c.estado === "CONFIRMADO") {
      c.estado = "CONFLICTO";
      c.requiereRevision = true;
      c.nota = nota;
    }
  }
}
