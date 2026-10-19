// Tarifas vigentes por modelo — SOLO se usan para calcular el costo en el
// momento de registrar el consumo; una vez escrito, RegistroConsumoInteligencia
// congela la tarifa aplicada y el costo resultante, así que cambiar estos
// números después nunca altera el costo histórico ya guardado (Carga
// inteligente de documentos, V1 — octubre 2026). Verificar contra la
// tarifa vigente real del proveedor antes de confiar en proyecciones de
// presupuesto a futuro.
export const TARIFAS_POR_MILLON: Record<string, { entrada: number; salida: number }> = {
  "gpt-5-nano": { entrada: 0.05, salida: 0.4 },
  "gpt-5-mini": { entrada: 0.25, salida: 2.0 },
};

export function calcularCosto(
  modelo: string,
  tokensEntrada: number,
  tokensSalida: number
): { costoTotal: number; tarifaEntradaPorMillion: number | null; tarifaSalidaPorMillion: number | null } {
  const tarifa = TARIFAS_POR_MILLON[modelo];
  if (!tarifa) {
    return { costoTotal: 0, tarifaEntradaPorMillion: null, tarifaSalidaPorMillion: null };
  }
  const costoTotal = (tokensEntrada * tarifa.entrada + tokensSalida * tarifa.salida) / 1_000_000;
  return { costoTotal, tarifaEntradaPorMillion: tarifa.entrada, tarifaSalidaPorMillion: tarifa.salida };
}
