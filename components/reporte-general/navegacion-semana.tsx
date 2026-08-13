import Link from "next/link";

function construirHref(
  fechaParametro: string,
  otrosParametros: { estado?: string; q?: string }
): string {
  const params = new URLSearchParams();
  params.set("fecha", fechaParametro);
  if (otrosParametros.estado && otrosParametros.estado !== "todos") {
    params.set("estado", otrosParametros.estado);
  }
  if (otrosParametros.q) params.set("q", otrosParametros.q);
  return `/reporte-general?${params.toString()}`;
}

export function NavegacionSemana({
  etiquetaSemana,
  fechaAnteriorParametro,
  fechaSiguienteParametro,
  estado,
  q,
}: {
  etiquetaSemana: string;
  fechaAnteriorParametro: string;
  fechaSiguienteParametro: string;
  estado?: string;
  q?: string;
}) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <Link
        href={construirHref(fechaAnteriorParametro, { estado, q })}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        ← Semana anterior
      </Link>
      <span className="px-2 font-semibold text-[var(--foreground)]">
        {etiquetaSemana}
      </span>
      <Link
        href={construirHref(fechaSiguienteParametro, { estado, q })}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        Semana siguiente →
      </Link>
    </div>
  );
}
