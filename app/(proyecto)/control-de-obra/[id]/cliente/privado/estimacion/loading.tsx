import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClientePrivadoEstimacionLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>

      <Skeleton className="h-8 w-56 rounded-lg" />
      <Skeleton className="h-3 w-80" />

      {/* Tabla de estimación privada — encabezado + filas. */}
      <Card className="overflow-hidden">
        <div className="flex gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-b border-[var(--border)] px-5 py-3 last:border-0"
          >
            {Array.from({ length: 7 }).map((__, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </Card>

      {/* Resumen comercial — subtotal / administración-utilidad / total. */}
      <Card className="p-5">
        <div className="flex flex-wrap gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-28" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
