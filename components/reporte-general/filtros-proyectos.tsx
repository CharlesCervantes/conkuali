import Link from "next/link";
import { cn } from "@/lib/cn";
import { BuscadorProyectos } from "./buscador-proyectos";

const OPCIONES: { valor: string; label: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "pendientes", label: "Pendientes" },
  { valor: "puente", label: "Puente" },
  { valor: "liquidados", label: "Liquidados" },
];

function construirHref(
  estado: string,
  otrosParametros: { fecha?: string; q?: string }
): string {
  const params = new URLSearchParams();
  if (otrosParametros.fecha) params.set("fecha", otrosParametros.fecha);
  if (estado !== "todos") params.set("estado", estado);
  if (otrosParametros.q) params.set("q", otrosParametros.q);
  const query = params.toString();
  return query ? `/reporte-general?${query}` : "/reporte-general";
}

export function FiltrosProyectos({
  estadoActivo,
  fecha,
  q,
}: {
  estadoActivo: string;
  fecha?: string;
  q?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        {OPCIONES.map((opcion) => {
          const activo = opcion.valor === estadoActivo;
          return (
            <Link
              key={opcion.valor}
              href={construirHref(opcion.valor, { fecha, q })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out",
                activo
                  ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                  : "text-[var(--muted)] hover:bg-black/[0.04] hover:text-[var(--foreground)]"
              )}
            >
              {opcion.label}
            </Link>
          );
        })}
      </div>

      <BuscadorProyectos valorInicial={q ?? ""} />
    </div>
  );
}
