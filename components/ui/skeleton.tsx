import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Bloque base para loading.tsx de las pantallas más lentas del módulo
// Control de Obra (auditoría de rendimiento, agosto 2026) — solo forma
// aproximada (encabezado/indicadores/tabla), nunca texto ni cifras reales.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[var(--border)]/70", className)}
      {...props}
    />
  );
}
