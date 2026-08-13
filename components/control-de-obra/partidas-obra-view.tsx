import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { FormNuevaPartida } from "./form-nueva-partida";
import { FormNuevoConcepto } from "./form-nuevo-concepto";
import type { obtenerPartidasProyecto } from "@/lib/server/control-de-obra/estructura-contractual";

type Partidas = Awaited<ReturnType<typeof obtenerPartidasProyecto>>;

export function PartidasObraView({
  proyectoId,
  partidas,
  puedeAdministrar,
}: {
  proyectoId: string;
  partidas: Partidas;
  puedeAdministrar: boolean;
}) {
  return (
    <div className="space-y-3">
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
                      <Th>Concepto</Th>
                      <Th>Unidad</Th>
                      <Th className="text-right">Cantidad</Th>
                    </Tr>
                  </Thead>
                  <tbody>
                    {partida.conceptos.map((concepto) => (
                      <Tr key={concepto.id}>
                        <Td className="font-medium">{concepto.descripcion}</Td>
                        <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
                        <Td className="text-right tabular-nums">
                          {Number(concepto.cantidadContratada).toLocaleString("es-MX")}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}

              {puedeAdministrar && (
                <details>
                  <summary className="inline-flex w-fit cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out select-none hover:bg-black/[0.03] [&::-webkit-details-marker]:hidden">
                    + Agregar concepto
                  </summary>
                  <div className="mt-3">
                    <FormNuevoConcepto partidaId={partida.id} proyectoId={proyectoId} />
                  </div>
                </details>
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
    </div>
  );
}
