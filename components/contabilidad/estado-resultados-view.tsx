import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import type { EstadoResultadosComparado, LineaResultado } from "@/lib/server/contabilidad/estado-resultados";

// Presentación pura de dos columnas (Periodo actual / Acumulado del año) —
// todo el número ya viene calculado del servidor; este componente solo
// arma filas y formatea. Ningún total ni suma se recalcula aquí (Contabilidad
// — reconocimiento, septiembre 2026: "no lógica contable duplicada en
// componentes React").

function Fila({
  etiqueta,
  actual,
  acumulado,
  negrita = false,
  indent = false,
}: {
  etiqueta: string;
  actual: number;
  acumulado: number;
  negrita?: boolean;
  indent?: boolean;
}) {
  return (
    <tr className={negrita ? "font-semibold text-[var(--foreground)]" : "text-[var(--foreground)]"}>
      <td className={`py-2 text-sm ${indent ? "pl-6" : ""}`}>{etiqueta}</td>
      <td className="py-2 text-right text-sm tabular-nums">{formatMoney(actual)}</td>
      <td className="py-2 text-right text-sm tabular-nums">{formatMoney(acumulado)}</td>
    </tr>
  );
}

function FilasSeccion({ actual, acumulado }: { actual: LineaResultado[]; acumulado: LineaResultado[] }) {
  return (
    <>
      {actual.map((linea, i) => (
        <Fila
          key={linea.clave}
          etiqueta={linea.etiqueta}
          actual={linea.monto}
          acumulado={acumulado[i]?.monto ?? 0}
          indent
        />
      ))}
    </>
  );
}

export function EstadoResultadosView({ estado }: { estado: EstadoResultadosComparado }) {
  const { periodoActual: a, acumuladoAnual: b } = estado;

  return (
    <Card className="enter overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse px-5">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs font-medium text-[var(--muted)]">
              <th className="px-5 py-3 text-left">Concepto</th>
              <th className="px-5 py-3 text-right">{a.periodo.etiqueta || "Periodo actual"}</th>
              <th className="px-5 py-3 text-right">{b.periodo.etiqueta}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] [&_td]:px-5">
            <tr>
              <td colSpan={3} className="px-5 pt-4 pb-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                Ingresos
              </td>
            </tr>
            <FilasSeccion actual={a.ingresos.lineas} acumulado={b.ingresos.lineas} />
            <Fila etiqueta="Total ingresos" actual={a.ingresos.total} acumulado={b.ingresos.total} negrita />

            <tr>
              <td colSpan={3} className="px-5 pt-4 pb-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                Costos directos de obra
              </td>
            </tr>
            <FilasSeccion actual={a.costosDirectos.lineas} acumulado={b.costosDirectos.lineas} />
            <Fila etiqueta="Total costos directos" actual={a.costosDirectos.total} acumulado={b.costosDirectos.total} negrita />

            <Fila etiqueta="UTILIDAD BRUTA" actual={a.utilidadBruta.monto} acumulado={b.utilidadBruta.monto} negrita />
            <tr>
              <td className="pl-6 py-1 text-xs text-[var(--muted)]">Margen bruto %</td>
              <td className="py-1 text-right text-xs tabular-nums text-[var(--muted)]">
                {a.utilidadBruta.margenPorcentaje === null ? "—" : `${a.utilidadBruta.margenPorcentaje.toFixed(1)}%`}
              </td>
              <td className="py-1 text-right text-xs tabular-nums text-[var(--muted)]">
                {b.utilidadBruta.margenPorcentaje === null ? "—" : `${b.utilidadBruta.margenPorcentaje.toFixed(1)}%`}
              </td>
            </tr>

            <tr>
              <td colSpan={3} className="px-5 pt-4 pb-1 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
                Gastos de operación
              </td>
            </tr>
            <FilasSeccion actual={a.gastosOperacion.lineas} acumulado={b.gastosOperacion.lineas} />
            <Fila etiqueta="Total gastos de operación" actual={a.gastosOperacion.total} acumulado={b.gastosOperacion.total} negrita />

            <Fila etiqueta="UTILIDAD OPERATIVA" actual={a.utilidadOperativa} acumulado={b.utilidadOperativa} negrita />

            <Fila
              etiqueta="Otros ingresos / gastos"
              actual={a.otros.lineas.reduce((s, l) => s + l.monto, 0)}
              acumulado={b.otros.lineas.reduce((s, l) => s + l.monto, 0)}
            />
            <Fila
              etiqueta="Impuestos / contribuciones"
              actual={-a.impuestosContribuciones}
              acumulado={-b.impuestosContribuciones}
            />

            <tr className="border-t-2 border-[var(--border)]">
              <td className="py-3 text-sm font-bold">RESULTADO DEL PERIODO</td>
              <td className="py-3 text-right text-sm font-bold tabular-nums">{formatMoney(a.resultadoPeriodo)}</td>
              <td className="py-3 text-right text-sm font-bold tabular-nums">{formatMoney(b.resultadoPeriodo)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {a.privadoExcluido && (
        <p className="border-t border-[var(--border)] bg-black/[0.02] px-5 py-2.5 text-xs text-[var(--muted)]">
          Estas cifras no incluyen información de la capa Privada — no tienes Vista privada activa en este momento.
        </p>
      )}
    </Card>
  );
}
