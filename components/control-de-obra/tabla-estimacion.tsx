import { Card } from "@/components/ui/card";
import { formatMoney, formatMoneyOrDash } from "@/lib/dinero";

// Fila normalizada, ya elegida a la capa correspondiente (operativo o
// privado) por quien llama — este componente no sabe ni le importa de qué
// capa vienen los números, solo los pinta. Así se reutiliza tal cual para
// Cliente y Cliente Priv. sin duplicar la tabla (sección 6/8 del diseño de
// Cliente, agosto 2026).
export type FilaTablaEstimacion = {
  conceptoId: string;
  descripcionConcepto: string;
  unidad: string;
  cantidadContratada: number;
  precioUnitario: number;
  importeContratado: number;
  cantidadAnterior: number;
  cantidadEstaSemana: number;
  cantidadAcumulada: number;
  importeEstaSemana: number;
  importeAcumulado: number;
  cantidadPorEjercer: number;
  importePorEjercer: number;
  avancePorcentaje: number;
  porcentajeAplicado?: number | null;
};

export function TablaEstimacion({
  partidas,
  mostrarPorcentajeAplicado,
}: {
  partidas: { partidaNombre: string; conceptos: FilaTablaEstimacion[] }[];
  mostrarPorcentajeAplicado?: boolean;
}) {
  if (partidas.length === 0) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Ningún concepto tuvo avance registrado en esta semana.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {partidas.map((partida) => {
        const subtotalContratado = partida.conceptos.reduce((t, c) => t + c.importeContratado, 0);
        const subtotalEstaSemana = partida.conceptos.reduce((t, c) => t + c.importeEstaSemana, 0);
        const subtotalAcumulado = partida.conceptos.reduce((t, c) => t + c.importeAcumulado, 0);
        const subtotalPorEjercer = partida.conceptos.reduce((t, c) => t + c.importePorEjercer, 0);

        return (
          <Card key={partida.partidaNombre} className="enter overflow-hidden">
            <details open>
              <summary className="group flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {partida.partidaNombre}
                </span>
                <span className="flex items-center gap-4 text-xs text-[var(--muted)]">
                  <span>
                    Esta semana{" "}
                    <span className="tabular-nums text-[var(--foreground)]">
                      {formatMoney(subtotalEstaSemana)}
                    </span>
                  </span>
                  <span>
                    Acumulado{" "}
                    <span className="tabular-nums text-[var(--foreground)]">
                      {formatMoney(subtotalAcumulado)}
                    </span>
                  </span>
                </span>
              </summary>

              <div className="overflow-x-auto border-t border-[var(--border)]">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted)]">
                      <th className="px-4 py-2 font-medium" rowSpan={2}>
                        Concepto
                      </th>
                      <th className="px-3 py-2 text-center font-medium" colSpan={3}>
                        Contrato
                      </th>
                      <th className="px-3 py-2 text-center font-medium" colSpan={2}>
                        Esta semana
                      </th>
                      <th className="px-3 py-2 text-center font-medium" colSpan={3}>
                        Acumulado
                      </th>
                      <th className="px-3 py-2 text-center font-medium" colSpan={2}>
                        Por ejercer
                      </th>
                    </tr>
                    <tr className="border-b border-[var(--border)] text-right text-xs text-[var(--muted)]">
                      <th className="px-3 py-1.5 font-medium">Cant.</th>
                      <th className="px-3 py-1.5 font-medium">P.U.</th>
                      <th className="px-3 py-1.5 font-medium">Importe</th>
                      <th className="px-3 py-1.5 font-medium">Cant.</th>
                      <th className="px-3 py-1.5 font-medium">Importe</th>
                      <th className="px-3 py-1.5 font-medium">Anterior</th>
                      <th className="px-3 py-1.5 font-medium">Nuevo</th>
                      <th className="px-3 py-1.5 font-medium">Importe</th>
                      <th className="px-3 py-1.5 font-medium">Importe</th>
                      <th className="px-3 py-1.5 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partida.conceptos.map((c) => (
                      <tr
                        key={c.conceptoId}
                        className="border-b border-[var(--border)]/60 last:border-0"
                      >
                        <td className="px-4 py-2">
                          <p className="text-[var(--foreground)]">{c.descripcionConcepto}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {c.unidad}
                            {mostrarPorcentajeAplicado && c.porcentajeAplicado !== null && c.porcentajeAplicado !== undefined
                              ? ` · ${c.porcentajeAplicado.toLocaleString("es-MX")}%`
                              : ""}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.cantidadContratada.toLocaleString("es-MX")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoneyOrDash(c.precioUnitario)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoneyOrDash(c.importeContratado)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.cantidadEstaSemana.toLocaleString("es-MX")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--foreground)]">
                          {formatMoneyOrDash(c.importeEstaSemana)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.cantidadAnterior.toLocaleString("es-MX")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.cantidadAcumulada.toLocaleString("es-MX")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoneyOrDash(c.importeAcumulado)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoneyOrDash(c.importePorEjercer)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.avancePorcentaje.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-xs font-semibold text-[var(--foreground)]">
                      <td className="px-4 py-2">Subtotal de partida</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyOrDash(subtotalContratado)}
                      </td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyOrDash(subtotalEstaSemana)}
                      </td>
                      <td className="px-3 py-2" colSpan={2} />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyOrDash(subtotalAcumulado)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoneyOrDash(subtotalPorEjercer)}
                      </td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
