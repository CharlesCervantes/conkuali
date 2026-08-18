import { cn } from "@/lib/cn";
import { ICONOS_PARTIDA, COLORES_PARTIDA } from "@/lib/control-de-obra/iconos-partida";

export function IconoPartida({
  icono,
  color,
  className,
}: {
  icono: string | null;
  color: string | null;
  className?: string;
}) {
  if (!icono) return null;
  const Icono = ICONOS_PARTIDA[icono];
  if (!Icono) return null;
  const paleta = (color && COLORES_PARTIDA[color]) || COLORES_PARTIDA.gris;

  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        paleta.bg,
        paleta.text,
        className
      )}
    >
      <Icono className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}
