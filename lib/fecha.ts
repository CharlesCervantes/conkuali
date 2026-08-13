const formato = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatearFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return "—";
  return formato.format(typeof fecha === "string" ? new Date(fecha) : fecha);
}
