import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import { CATEGORIA_GASTO_LABEL, type CategoriaGasto } from "@/lib/control-de-obra/categorias-gasto";
import type { ResumenGastosEmpresa } from "@/lib/server/control-de-obra/gastos";

// "Proyectos" vs "Gastos de Empresa" — deliberadamente separado de las
// tarjetas de ResumenSemana (que desglosan por momento de pago, un eje
// distinto). Nunca mezcla el Proyecto(tipo=OFICINA) como si fuera una obra
// más — su etiqueta para el usuario es siempre "Empresa" (Gastos
// transversal, septiembre 2026).
export function GastosEmpresaCard({
  totalProyectos,
  resumen,
  totalGeneral,
}: {
  totalProyectos: number;
  resumen: ResumenGastosEmpresa;
  totalGeneral: number;
}) {
  return (
    <Card className="enter p-5">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        Resumen semanal
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[var(--muted)]">Proyectos</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(totalProyectos)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Gastos de Empresa</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(resumen.total)}
          </dd>
        </div>
        <div className="border-t border-[var(--border)] pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
          <dt className="text-xs text-[var(--muted)]">Salida total prevista</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--brand)]">
            {formatMoney(totalGeneral)}
          </dd>
        </div>
      </dl>

      {resumen.categorias.length > 0 && (
        <details className="mt-4 border-t border-[var(--border)] pt-3">
          <summary className="cursor-pointer text-xs font-medium text-[var(--brand)] select-none hover:underline">
            Ver desglose por categoría
          </summary>
          <div className="mt-2 space-y-1.5">
            {resumen.categorias.map((c) => (
              <div key={c.categoria} className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">
                  {CATEGORIA_GASTO_LABEL[c.categoria as CategoriaGasto] ?? c.categoria}
                </span>
                <span className="tabular-nums text-[var(--foreground)]">{formatMoney(c.monto)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
