import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { FormNuevoContrato } from "./form-nuevo-contrato";
import { FormAsignarConcepto } from "./form-asignar-concepto";
import { BarraAvance } from "./barra-avance";
import { formatMoney } from "@/lib/dinero";
import type {
  obtenerContratistasProyecto,
  listarContratistasDisponibles,
} from "@/lib/server/control-de-obra/estructura-contractual";
import type { AvanceCalculado } from "@/lib/server/control-de-obra/avance";

type Datos = Awaited<ReturnType<typeof obtenerContratistasProyecto>>;
type ContratistasDisponibles = Awaited<ReturnType<typeof listarContratistasDisponibles>>;

export function ContratistasView({
  proyectoId,
  partidas,
  contratos,
  contratistasDisponibles,
  avancePorConcepto,
  puedeAdministrar,
}: {
  proyectoId: string;
  partidas: Datos["partidas"];
  contratos: Datos["contratos"];
  contratistasDisponibles: ContratistasDisponibles;
  avancePorConcepto: Map<string, AvanceCalculado>;
  puedeAdministrar: boolean;
}) {
  // Reutiliza los conceptos ya creados en Partidas de obra — no se duplican
  // aquí, solo se relacionan con un contratista y un precio. Agrupados por
  // partida (optgroup) para que quede claro que lo seleccionable es el
  // concepto, no la partida.
  const conceptosPorPartida = partidas
    .filter((partida) => partida.conceptos.length > 0)
    .map((partida) => ({
      partidaNombre: partida.nombre,
      conceptos: partida.conceptos.map((concepto) => ({
        id: concepto.id,
        etiqueta: `${concepto.descripcion} (${concepto.unidad})`,
      })),
    }));
  const hayConceptosDisponibles = conceptosPorPartida.length > 0;

  // Cuántos contratos distintos tienen asignado cada concepto en TODO el
  // proyecto — si es más de uno, el avance físico de ese concepto no se
  // puede atribuir a ningún contratista en particular (ver sección 49).
  const contratosPorConcepto = new Map<string, number>();
  for (const contrato of contratos) {
    for (const asignacion of contrato.conceptos) {
      contratosPorConcepto.set(
        asignacion.conceptoId,
        (contratosPorConcepto.get(asignacion.conceptoId) ?? 0) + 1
      );
    }
  }

  return (
    <div className="space-y-3">
      {contratos.length === 0 && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay contratistas asignados a este proyecto.
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
                <div className="text-right">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">
                    Contrato vigente
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                    {formatMoney(montoContrato)}
                  </p>
                </div>
              </summary>

              <div className="border-t border-[var(--border)] px-5 py-4 space-y-4">
                {contrato.conceptos.length > 0 && (
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Concepto</Th>
                        <Th>Unidad</Th>
                        <Th className="text-right">Cantidad asignada</Th>
                        <Th className="text-right">P.U. contratista</Th>
                        <Th className="text-right">Importe</Th>
                        <Th className="text-right">Ejecutado</Th>
                        <Th className="text-right">Pendiente</Th>
                        <Th className="text-right">Avance</Th>
                      </Tr>
                    </Thead>
                    <tbody>
                      {contrato.conceptos.map((asignacion) => {
                        const compartido =
                          (contratosPorConcepto.get(asignacion.conceptoId) ?? 0) > 1;
                        const avance = avancePorConcepto.get(asignacion.conceptoId);

                        return (
                          <Tr key={asignacion.id}>
                            <Td className="font-medium">
                              {asignacion.concepto.descripcion}
                            </Td>
                            <Td className="text-[var(--muted)]">
                              {asignacion.concepto.unidad}
                            </Td>
                            <Td className="text-right tabular-nums">
                              {Number(asignacion.cantidad).toLocaleString("es-MX")}
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
                            {!avance ? (
                              <Td colSpan={3} className="text-xs text-[var(--muted)]">
                                —
                              </Td>
                            ) : compartido ? (
                              <Td
                                colSpan={3}
                                className="text-xs text-[var(--muted)] italic"
                              >
                                — · Concepto compartido · avance no atribuible por
                                contratista
                              </Td>
                            ) : (
                              <>
                                <Td className="text-right tabular-nums">
                                  {avance.acumulado.toLocaleString("es-MX")}
                                </Td>
                                <Td className="text-right tabular-nums">
                                  {avance.pendiente.toLocaleString("es-MX")}
                                </Td>
                                <Td>
                                  <BarraAvance porcentaje={avance.avancePorcentaje} />
                                </Td>
                              </>
                            )}
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}

                {puedeAdministrar && hayConceptosDisponibles && (
                  <details>
                    <summary className="inline-flex w-fit cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out select-none hover:bg-black/[0.03] [&::-webkit-details-marker]:hidden">
                      + Asignar concepto
                    </summary>
                    <div className="mt-3">
                      <FormAsignarConcepto
                        contratoId={contrato.id}
                        proyectoId={proyectoId}
                        conceptosPorPartida={conceptosPorPartida}
                      />
                    </div>
                  </details>
                )}
              </div>
            </details>
          </Card>
        );
      })}

      {puedeAdministrar && (
        <details>
          <summary className="inline-flex w-fit cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out select-none hover:bg-black/[0.03] [&::-webkit-details-marker]:hidden">
            + Agregar contratista
          </summary>
          <Card className="enter mt-3 p-4">
            <FormNuevoContrato proyectoId={proyectoId} contratistas={contratistasDisponibles} />
          </Card>
        </details>
      )}
    </div>
  );
}
