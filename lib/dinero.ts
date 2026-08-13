// Acepta Prisma.Decimal, number o string — Prisma siempre regresa Decimal
// para columnas @db.Decimal, nunca debe tratarse como float en cálculos,
// pero para *mostrarlo* basta convertirlo a number.
type ValorMonetario = { toNumber: () => number } | number | string | null | undefined;

function aNumero(valor: ValorMonetario): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === "number") return valor;
  if (typeof valor === "string") return Number(valor);
  return valor.toNumber();
}

const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function formatMoney(valor: ValorMonetario): string {
  return formatoMXN.format(aNumero(valor));
}

// Los importes en cero se muestran en blanco para mantener limpia la tabla
// (regla explícita del negocio — ver docs/negocio/03-modulo-reporte-general.md).
export function formatMoneyOrDash(valor: ValorMonetario): string {
  const n = aNumero(valor);
  return n === 0 ? "—" : formatMoney(n);
}

export function sumarMontos(...valores: ValorMonetario[]): number {
  return valores.reduce((total: number, v) => total + aNumero(v), 0);
}
