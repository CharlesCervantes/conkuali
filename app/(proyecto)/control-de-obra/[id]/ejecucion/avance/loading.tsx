import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AvanceObraLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Indicadores — misma forma que ResumenAvance (4 tarjetas). */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-12" />
          </Card>
        ))}
      </div>

      <Skeleton className="h-8 w-56 rounded-lg" />

      {/* Tabla/contenido — un par de tarjetas de partida con filas de captura. */}
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="space-y-2 border-t border-[var(--border)] px-5 py-4">
              {Array.from({ length: 3 }).map((__, j) => (
                <Skeleton key={j} className="h-6 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
