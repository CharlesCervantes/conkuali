import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { EstadoPagoBadge } from "./estado-pago-badge";
import { GRID_PROYECTOS } from "./grid-proyectos";
import { cn } from "@/lib/cn";
import { formatMoney, formatMoneyOrDash } from "@/lib/dinero";
import { calcularEstadoProyecto } from "@/lib/reporte-general/estado";
import type { ReporteObra } from "@/lib/server/reporte-general/queries";

const TIPO_LABEL: Record<string, string> = {
  FORMAL: "Obra",
  MOMENTANEA: "Obra momentánea",
  OFICINA: "Oficina",
};

// Solo se muestra cuando el origen NO es el corte de contratista de siempre
// — la fila normal (95%+ de los casos) no cambia visualmente en nada; esto
// solo aparece cuando un beneficiario tiene más de un movimiento la misma
// semana (p. ej. corte + reposición de gastos).
const ORIGEN_LABEL: Record<string, string> = {
  REPOSICION_GASTOS: "Reposición",
  ORDEN_COMPRA: "Orden de compra",
  MANUAL: "Manual",
};

function EtiquetaOrigen({ origen }: { origen: string | null }) {
  if (!origen || origen === "CORTE_CONTRATISTA") return null;
  return (
    <span className="ml-1.5 rounded-full bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
      {ORIGEN_LABEL[origen] ?? origen}
    </span>
  );
}

export function ObraCard({ obra, index }: { obra: ReporteObra; index: number }) {
  const sinParticipantes =
    obra.contratistas.length === 0 &&
    obra.proveedores.length === 0 &&
    obra.administracion.length === 0;
  const estadoProyecto = calcularEstadoProyecto(obra);

  return (
    <Card
      className="enter overflow-hidden"
      style={{ transitionDelay: `${Math.min(index, 6) * 30}ms` }}
    >
      <details className="group">
        <summary
          className={cn(
            GRID_PROYECTOS,
            "cursor-pointer list-none px-5 py-3.5 select-none [&::-webkit-details-marker]:hidden"
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <svg
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform duration-200 ease-out group-open:rotate-90"
              fill="currentColor"
            >
              <path d="M7 4l6 6-6 6V4z" />
            </svg>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[var(--foreground)]">
                {obra.proyecto.nombre}
              </h3>
              <p className="truncate text-xs text-[var(--muted)]">
                {TIPO_LABEL[obra.proyecto.tipo] ?? obra.proyecto.tipo}
                {obra.proyecto.estatus === "PAUSADO" && " · Pausada"}
              </p>
            </div>
          </div>
          <span className="text-right text-sm tabular-nums text-[var(--foreground)]">
            {formatMoneyOrDash(obra.totalEntreSemana)}
          </span>
          <span className="text-right text-sm tabular-nums text-[var(--foreground)]">
            {formatMoneyOrDash(obra.totalFinSemana)}
          </span>
          <span className="text-right text-base font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(obra.totalSemana)}
          </span>
          <span
            className={cn(
              "text-right text-sm tabular-nums",
              obra.pendienteSemana > 0
                ? "font-medium text-red-700"
                : "text-[var(--muted)]"
            )}
          >
            {formatMoneyOrDash(obra.pendienteSemana)}
          </span>
          <span className="flex justify-end">
            <EstadoPagoBadge estatus={estadoProyecto} />
          </span>
        </summary>

        <div className="border-t border-[var(--border)] px-5 py-4">
          {sinParticipantes ? (
            <p className="py-2 text-sm text-[var(--muted)]">
              Todavía no hay contratistas, proveedores ni personal asignado a
              esta obra.
            </p>
          ) : (
            <div className="space-y-5">
              {obra.contratistas.length > 0 && (
                <Seccion titulo="Contratistas">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Contratista</Th>
                        <Th>Concepto</Th>
                        <Th className="text-right">Contrato vigente</Th>
                        <Th className="text-right">Pagado acumulado</Th>
                        <Th className="text-right">Saldo</Th>
                        <Th className="text-right">Entre semana</Th>
                        <Th className="text-right">Fin de semana</Th>
                        <Th>Estado</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {obra.contratistas.map((fila) => (
                        <Tr key={fila.movimientoId ?? fila.id}>
                          <Td className="font-medium">
                            {fila.nombre}
                            <EtiquetaOrigen origen={fila.origen} />
                          </Td>
                          <Td className="text-[var(--muted)]">
                            {fila.concepto ?? "—"}
                          </Td>
                          <Td className="text-right tabular-nums">
                            <details className="group/vigente relative inline-block text-left">
                              <summary className="cursor-pointer list-none underline decoration-dotted underline-offset-4 [&::-webkit-details-marker]:hidden">
                                {formatMoney(fila.montoContractualVigente)}
                              </summary>
                              <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.16)]">
                                <div className="flex items-center justify-between gap-4 text-[var(--muted)]">
                                  <span>Contrato base</span>
                                  <span className="tabular-nums text-[var(--foreground)]">
                                    {formatMoney(fila.montoContrato)}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-4 text-[var(--muted)]">
                                  <span>Aditivas autorizadas</span>
                                  <span className="tabular-nums text-[var(--foreground)]">
                                    {formatMoneyOrDash(fila.aditivasAutorizadas)}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-1.5 font-semibold text-[var(--foreground)]">
                                  <span>Total vigente</span>
                                  <span className="tabular-nums">
                                    {formatMoney(fila.montoContractualVigente)}
                                  </span>
                                </div>
                              </div>
                            </details>
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.pagadoHistorico)}
                          </Td>
                          <Td className="text-right font-medium tabular-nums">
                            {formatMoney(fila.saldo)}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.montoEntreSemana)}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.montoFinSemana)}
                          </Td>
                          <Td>
                            <EstadoPagoBadge estatus={fila.estatusPago} />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Seccion>
              )}

              {obra.proveedores.length > 0 && (
                <Seccion titulo="Proveedores y servicios">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Proveedor</Th>
                        <Th>Giro</Th>
                        <Th className="text-right">Entre semana</Th>
                        <Th className="text-right">Fin de semana</Th>
                        <Th>Estado</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {obra.proveedores.map((fila) => (
                        <Tr key={fila.movimientoId ?? fila.id}>
                          <Td className="font-medium">
                            {fila.nombre}
                            <EtiquetaOrigen origen={fila.origen} />
                          </Td>
                          <Td className="text-[var(--muted)]">
                            {fila.giro ?? "—"}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.montoEntreSemana)}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.montoFinSemana)}
                          </Td>
                          <Td>
                            <EstadoPagoBadge estatus={fila.estatusPago} />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Seccion>
              )}

              {obra.administracion.length > 0 && (
                <Seccion titulo="Administración">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Persona</Th>
                        <Th>Puesto</Th>
                        <Th className="text-right">Entre semana</Th>
                        <Th className="text-right">Fin de semana</Th>
                        <Th>Estado</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {obra.administracion.map((fila) => (
                        <Tr key={fila.movimientoId ?? fila.id}>
                          <Td className="font-medium">
                            {fila.nombre}
                            <EtiquetaOrigen origen={fila.origen} />
                          </Td>
                          <Td className="text-[var(--muted)]">
                            {fila.puesto ?? "—"}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.montoEntreSemana)}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.montoFinSemana)}
                          </Td>
                          <Td>
                            <EstadoPagoBadge estatus={fila.estatusPago} />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </Seccion>
              )}
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {titulo}
      </h4>
      {children}
    </div>
  );
}
