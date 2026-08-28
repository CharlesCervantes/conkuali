import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClienteEstimacionLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Skeleton className="h-8 w-56 rounded-lg" />
      <Skeleton className="h-3 w-64" />

      {/* Tabla de estimación — encabezado + filas. */}
      <Card className="overflow-hidden">
        <div className="flex gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-b border-[var(--border)] px-5 py-3 last:border-0"
          >
            {Array.from({ length: 6 }).map((__, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </Card>

      {/* Resumen — total de esta semana. */}
      <Card className="p-5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-7 w-40" />
      </Card>
    </div>
  );
}
