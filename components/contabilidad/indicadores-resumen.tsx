import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import type { EstadoResultados } from "@/lib/server/contabilidad/estado-resultados";

// Presentación pura — todo el cálculo (incluido el margen neto) ya viene
// resuelto del servidor en `estado`, este componente solo formatea.
export function IndicadoresResumen({ estado }: { estado: EstadoResultados }) {
  const totalCostosGastos = estado.costosDirectos.total + estado.gastosOperacion.total + estado.impuestosContribuciones;
  const margenNeto = estado.ingresos.total !== 0 ? (estado.resultadoPeriodo / estado.ingresos.total) * 100 : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="enter p-5">
        <p className="text-xs font-medium text-[var(--muted)]">Ingresos reconocidos</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{formatMoney(estado.ingresos.total)}</p>
      </Card>
      <Card className="enter p-5">
        <p className="text-xs font-medium text-[var(--muted)]">Costos + gastos</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-red-700">{formatMoney(totalCostosGastos)}</p>
      </Card>
      <Card className="enter p-5">
        <p className="text-xs font-medium text-[var(--muted)]">Resultado del periodo</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--brand)]">{formatMoney(estado.resultadoPeriodo)}</p>
      </Card>
      <Card className="enter p-5">
        <p className="text-xs font-medium text-[var(--muted)]">Margen %</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
          {margenNeto === null ? "—" : `${margenNeto.toFixed(1)}%`}
        </p>
      </Card>
    </div>
  );
}
