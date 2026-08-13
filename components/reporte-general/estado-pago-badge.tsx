import { cn } from "@/lib/cn";
import type { EstatusPago } from "@/lib/generated/prisma/enums";

// El sistema de 4 colores del Reporte General — docs/negocio/02-control-de-obra.md.
// Punto + texto (no solo color) para que también funcione sin percibir color.
const CONFIG: Record<EstatusPago, { label: string; dot: string; text: string }> = {
  SIN_MOVIMIENTO: { label: "Sin movimiento", dot: "bg-gray-300", text: "text-[var(--muted)]" },
  PENDIENTE_PAGO: { label: "Pendiente de pago", dot: "bg-red-500", text: "text-red-700" },
  PAGADO_PUENTE: { label: "Pagado (puente)", dot: "bg-orange-500", text: "text-orange-700" },
  LIQUIDADO: { label: "Liquidado", dot: "bg-emerald-500", text: "text-emerald-700" },
};

export function EstadoPagoBadge({
  estatus,
}: {
  estatus: EstatusPago | null;
}) {
  const config = CONFIG[estatus ?? "SIN_MOVIMIENTO"];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
    </span>
  );
}
