import { cn } from "@/lib/cn";

// Apoyo visual, no protagonista — barra angosta + porcentaje, sin colores de
// estado (esos ya los da EstatusAprobacionAvanceBadge aparte).
export function BarraAvance({
  porcentaje,
  className,
}: {
  porcentaje: number;
  className?: string;
}) {
  const acotado = Math.min(Math.max(porcentaje, 0), 100);

  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-black/[0.06]">
        <div
          className="h-full rounded-full bg-[var(--brand)]"
          style={{ width: `${acotado}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-sm tabular-nums text-[var(--foreground)]">
        {porcentaje.toFixed(1)}%
      </span>
    </div>
  );
}
