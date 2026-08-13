import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { formatMoney } from "@/lib/dinero";
import { FormNuevaPartida } from "./form-nueva-partida";
import { FormNuevoConcepto } from "./form-nuevo-concepto";
import { FormNuevoContrato } from "./form-nuevo-contrato";
import { FormAsignarConcepto } from "./form-asignar-concepto";
import type {
  obtenerEstructuraContractual,
  listarContratistasDisponibles,
} from "@/lib/server/control-de-obra/estructura-contractual";

type Estructura = Awaited<ReturnType<typeof obtenerEstructuraContractual>>;
type Contratistas = Awaited<ReturnType<typeof listarContratistasDisponibles>>;

export function EstructuraContractualView({
  proyectoId,
  partidas,
  contratos,
  contratistas,
  puedeAdministrar,
}: {
  proyectoId: string;
  partidas: Estructura["partidas"];
  contratos: Estructura["contratos"];
  contratistas: Contratistas;
  puedeAdministrar: boolean;
}) {
  const conceptosDisponibles = partidas.flatMap((partida) =>
    partida.conceptos.map((concepto) => ({
      id: concepto.id,
      etiqueta: `${partida.nombre} — ${concepto.descripcion} (${concepto.unidad})`,
    }))
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Partidas y conceptos
        </h2>

        {partidas.length === 0 && (
          <Card className="p-6 text-sm text-[var(--muted)]">
            Todavía no hay partidas en este proyecto.
          </Card>
        )}

        {partidas.map((partida, i) => (
          <Card
            key={partida.id}
            className="enter overflow-hidden"
            style={{ transitionDelay: `${Math.min(i, 6) * 40}ms` }}
          >
            <details open={partida.conceptos.length > 0}>
              <summary className="group flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {partida.nombre}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {partida.conceptos.length} concepto
                  {partida.conceptos.length === 1 ? "" : "s"}
                </span>
              </summary>

              <div className="border-t border-[var(--border)] px-5 py-4 space-y-4">
                {partida.conceptos.length > 0 && (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Código</Th>
                        <Th>Descripción</Th>
                        <Th>Unidad</Th>
                        <Th className="text-right">Cantidad</Th>
                        <Th>Asignado a</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {partida.conceptos.map((concepto) => (
                        <Tr key={concepto.id}>
                          <Td className="text-[var(--muted)]">
                            {concepto.codigo ?? "—"}
                          </Td>
                          <Td className="font-medium">{concepto.descripcion}</Td>
                          <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
                          <Td className="text-right tabular-nums">
                            {Number(concepto.cantidadContratada)}
                          </Td>
                          <Td className="text-[var(--muted)]">
                            {concepto.asignaciones.length === 0
                              ? "—"
                              : concepto.asignaciones
                                  .map(
                                    (a) =>
                                      `${a.contratoContratista.beneficiarioProyecto.beneficiario.nombre} (${Number(a.cantidad)} × ${formatMoney(a.precioUnitarioContratista)})`
                                  )
                                  .join(", ")}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}

                {puedeAdministrar && (
                  <FormNuevoConcepto partidaId={partida.id} proyectoId={proyectoId} />
                )}
              </div>
            </details>
          </Card>
        ))}

        {puedeAdministrar && (
          <Card className="p-4">
            <FormNuevaPartida proyectoId={proyectoId} />
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Contratos de contratistas
        </h2>

        {contratos.length === 0 && (
          <Card className="p-6 text-sm text-[var(--muted)]">
            Todavía no hay contratos registrados en este proyecto.
          </Card>
        )}

        {contratos.map((contrato, i) => {
          const montoContrato = contrato.conceptos.reduce(
            (total, c) => total + Number(c.cantidad) * Number(c.precioUnitarioContratista),
            0
          );

          return (
            <Card
              key={contrato.id}
              className="enter overflow-hidden"
              style={{ transitionDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <details open>
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
                  <div>
                    <span className="text-sm font-semibold text-[var(--foreground)]">
                      {contrato.beneficiarioProyecto.beneficiario.nombre}
                    </span>
                    {(contrato.numeroContrato || contrato.descripcion) && (
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        {[contrato.numeroContrato, contrato.descripcion]
                          .filter(Boolean)
                          .join(" — ")}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                    {formatMoney(montoContrato)}
                  </span>
                </summary>

                <div className="border-t border-[var(--border)] px-5 py-4 space-y-4">
                  {contrato.conceptos.length > 0 && (
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>Concepto</Th>
                          <Th>Unidad</Th>
                          <Th className="text-right">Cantidad</Th>
                          <Th className="text-right">P.U. contratista</Th>
                          <Th className="text-right">Importe</Th>
                        </Tr>
                      </Thead>
                      <tbody>
                        {contrato.conceptos.map((asignacion) => (
                          <Tr key={asignacion.id}>
                            <Td className="font-medium">
                              {asignacion.concepto.descripcion}
                            </Td>
                            <Td className="text-[var(--muted)]">
                              {asignacion.concepto.unidad}
                            </Td>
                            <Td className="text-right tabular-nums">
                              {Number(asignacion.cantidad)}
                            </Td>
                            <Td className="text-right tabular-nums">
                              {formatMoney(asignacion.precioUnitarioContratista)}
                            </Td>
                            <Td className="text-right tabular-nums">
                              {formatMoney(
                                Number(asignacion.cantidad) *
                                  Number(asignacion.precioUnitarioContratista)
                              )}
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  )}

                  {puedeAdministrar && conceptosDisponibles.length > 0 && (
                    <FormAsignarConcepto
                      contratoId={contrato.id}
                      proyectoId={proyectoId}
                      conceptos={conceptosDisponibles}
                    />
                  )}
                </div>
              </details>
            </Card>
          );
        })}

        {puedeAdministrar && (
          <Card className="p-4">
            <FormNuevoContrato proyectoId={proyectoId} contratistas={contratistas} />
          </Card>
        )}
      </section>
    </div>
  );
}
