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
  // Un concepto solo puede pertenecer a un contratista (la base de datos ya
  // lo impone con un único índice sobre conceptoId — sección 49.9). Este set
  // es solo para filtrar el selector de "Asignar concepto" a lo disponible;
  // no hace falta ninguna otra consulta, `contratos` ya trae todo.
  const conceptoIdsAsignados = new Set(
    contratos.flatMap((contrato) => contrato.conceptos.map((c) => c.conceptoId))
  );

  // Reutiliza los conceptos ya creados en Contrato General — no se duplican
  // aquí, solo se relacionan con un contratista. Cantidad y P.U. se heredan
  // del Contrato General al asignar, ya no se vuelven a pedir aquí. Agrupados
  // por partida (optgroup) para que quede claro que lo seleccionable es el
  // concepto, no la partida.
  const conceptosPorPartida = partidas
    .map((partida) => ({
      partidaNombre: partida.nombre,
      conceptos: partida.conceptos
        .filter((concepto) => !conceptoIdsAsignados.has(concepto.id))
        .map((concepto) => ({
          id: concepto.id,
          etiqueta: `${concepto.descripcion} (${concepto.unidad})`,
        })),
    }))
    .filter((grupo) => grupo.conceptos.length > 0);
  const hayConceptosDisponibles = conceptosPorPartida.length > 0;

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
            <details>
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
