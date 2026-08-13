import { cn } from "@/lib/cn";
import type { EstadoAvanceConcepto } from "@/lib/server/control-de-obra/avance";

const CONFIG: Record<EstadoAvanceConcepto, { label: string; dot: string; text: string }> = {
  SIN_INICIAR: { label: "Sin iniciar", dot: "bg-gray-300", text: "text-[var(--muted)]" },
  EN_PROCESO: { label: "En proceso", dot: "bg-amber-500", text: "text-amber-700" },
  TERMINADO: { label: "Terminado", dot: "bg-emerald-500", text: "text-emerald-700" },
};

export function EstadoAvanceBadge({ estado }: { estado: EstadoAvanceConcepto }) {
  const config = CONFIG[estado];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
