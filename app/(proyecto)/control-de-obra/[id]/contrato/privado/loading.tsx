import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ContratoGeneralPrivadoLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-64" />

      {/* Resumen del contrato — mismo layout que ResumenContratoPrivado. */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-7 w-36" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="ml-auto h-3 w-24" />
            <Skeleton className="ml-auto h-5 w-16" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-8 border-t border-[var(--border)] pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>

      {/* Tarjetas de partida, cerradas por default. */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
