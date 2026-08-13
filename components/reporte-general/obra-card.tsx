import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { EstadoPagoBadge } from "./estado-pago-badge";
import { formatMoney, formatMoneyOrDash } from "@/lib/dinero";
import type { ReporteObra } from "@/lib/server/reporte-general/queries";

const TIPO_LABEL: Record<string, string> = {
  FORMAL: "Obra",
  MOMENTANEA: "Obra momentánea",
  OFICINA: "Oficina",
};

export function ObraCard({ obra, index }: { obra: ReporteObra; index: number }) {
  const sinParticipantes =
    obra.contratistas.length === 0 &&
    obra.proveedores.length === 0 &&
    obra.administracion.length === 0;

  return (
    <Card
      className="enter overflow-hidden"
      style={{ transitionDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <details open={obra.totalSemana > 0} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <svg
              viewBox="0 0 20 20"
              className="h-3.5 w-3.5 shrink-0 text-[var(--muted)] transition-transform duration-200 ease-out group-open:rotate-90"
              fill="currentColor"
            >
              <path d="M7 4l6 6-6 6V4z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                {obra.proyecto.nombre}
              </h3>
              <p className="text-xs text-[var(--muted)]">
                {TIPO_LABEL[obra.proyecto.tipo] ?? obra.proyecto.tipo}
                {obra.proyecto.estatus === "PAUSADO" && " · Pausada"}
              </p>
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(obra.totalSemana)}
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
                        <Th className="text-right">Contrato</Th>
                        <Th className="text-right">Aditivas</Th>
                        <Th className="text-right">Pagado</Th>
                        <Th className="text-right">Saldo</Th>
                        <Th className="text-right">Entre semana</Th>
                        <Th className="text-right">Fin de semana</Th>
                        <Th>Estado</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {obra.contratistas.map((fila) => (
                        <Tr key={fila.id}>
                          <Td className="font-medium">{fila.nombre}</Td>
                          <Td className="text-[var(--muted)]">
                            {fila.concepto ?? "—"}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoney(fila.montoContrato)}
                          </Td>
                          <Td className="text-right tabular-nums">
                            {formatMoneyOrDash(fila.aditivasAutorizadas)}
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
                        <Tr key={fila.id}>
                          <Td className="font-medium">{fila.nombre}</Td>
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
                        <Tr key={fila.id}>
                          <Td className="font-medium">{fila.nombre}</Td>
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

          <div className="mt-4 flex items-center justify-end gap-6 border-t border-[var(--border)] pt-3 text-sm">
            <span className="text-[var(--muted)]">
              Entre semana{" "}
              <span className="font-medium tabular-nums text-[var(--foreground)]">
                {formatMoney(obra.totalEntreSemana)}
              </span>
            </span>
            <span className="text-[var(--muted)]">
              Fin de semana{" "}
              <span className="font-medium tabular-nums text-[var(--foreground)]">
                {formatMoney(obra.totalFinSemana)}
              </span>
            </span>
            <span className="text-[var(--foreground)]">
              Total{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(obra.totalSemana)}
              </span>
            </span>
          </div>
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
