import { cn } from "@/lib/cn";
import type { EstatusProyecto } from "@/lib/generated/prisma/enums";

const CONFIG: Record<EstatusProyecto, { label: string; dot: string; text: string }> = {
  ACTIVO: { label: "Activo", dot: "bg-emerald-500", text: "text-emerald-700" },
  PAUSADO: { label: "Pausado", dot: "bg-amber-500", text: "text-amber-700" },
  CERRADO: { label: "Cerrado", dot: "bg-gray-400", text: "text-[var(--muted)]" },
  CANCELADO: { label: "Cancelado", dot: "bg-red-400", text: "text-red-700" },
};

export function EstatusProyectoBadge({ estatus }: { estatus: EstatusProyecto }) {
  const config = CONFIG[estatus];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
