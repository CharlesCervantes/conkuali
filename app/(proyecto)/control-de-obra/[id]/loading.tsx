import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Solo cubre esta página (Resumen) — coexiste dentro del layout del
// proyecto, que sigue montado y estable (sidebar, encabezado de obra) porque
// loading.tsx nunca envuelve su propio layout.tsx (auditoría de rendimiento,
// agosto 2026).
export default function ResumenLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>

      <Card className="p-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
