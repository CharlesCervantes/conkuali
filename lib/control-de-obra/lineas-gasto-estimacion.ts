// Aplana los gastos cobrables de una estimación a filas "concepto" planas —
// una fila por cada línea de detalle (GastoObraDetalle en vivo,
// EstimacionClienteGastoDetalle congelado — mismo shape en ambos casos) en
// vez del GastoObra padre como fila con acordeón. Es puramente de
// presentación: el GastoObra/EstimacionClienteGasto padre nunca se muestra
// como una fila aparte cuando tiene detalle — solo es el contenedor
// administrativo. Un gasto SIN detalle (captura simple o histórico) sigue
// produciendo una sola fila sintética a partir de su propia
// descripción/monto, nunca desaparece.
//
// Σ importe de las líneas resultantes siempre da exactamente
// subtotalGastosCobrables — la misma cifra que ya usa
// calcularTotalesEstimacion (GastoObra.monto ya es, por construcción, la
// suma de su propio detalle — mostrar las líneas es un cambio de
// representación, nunca una segunda suma). Usado tanto por
// TablaGastosEstimacion (pantalla) como por EstimacionHistoricaDocumento
// (PDF) — una sola transformación, nunca dos (Estimación semanal:
// presentación plana de gastos cobrables, agosto 2026).

export type FilaGastoParaAplanar = {
  descripcion: string;
  monto: number;
  detalle: { descripcion: string; unidad: string; cantidad: number; precioUnitario: number }[];
};

export type LineaGastoPlana = {
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
};

export function aplanarGastosCobrables(gastos: FilaGastoParaAplanar[]): LineaGastoPlana[] {
  return gastos.flatMap((g) =>
    g.detalle.length > 0
      ? g.detalle.map((l) => ({
          descripcion: l.descripcion,
          unidad: l.unidad,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          importe: l.cantidad * l.precioUnitario,
        }))
      : [
          {
            descripcion: g.descripcion,
            unidad: "—",
            cantidad: 1,
            precioUnitario: g.monto,
            importe: g.monto,
          },
        ]
  );
}
