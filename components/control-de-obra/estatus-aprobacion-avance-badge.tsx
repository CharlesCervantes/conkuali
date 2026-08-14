import { cn } from "@/lib/cn";
import type { EstatusAprobacionAvance } from "@/lib/generated/prisma/enums";

const CONFIG: Record<EstatusAprobacionAvance, { label: string; dot: string; text: string }> = {
  PENDIENTE: { label: "Pendiente", dot: "bg-amber-500", text: "text-amber-700" },
  APROBADO: { label: "Aprobado", dot: "bg-emerald-500", text: "text-emerald-700" },
  RECHAZADO: { label: "Rechazado", dot: "bg-red-500", text: "text-red-700" },
};

export function EstatusAprobacionAvanceBadge({
  estatus,
}: {
  estatus: EstatusAprobacionAvance | null;
}) {
  if (!estatus) {
    return <span className="text-sm text-[var(--muted)]">—</span>;
  }

  const config = CONFIG[estatus];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
