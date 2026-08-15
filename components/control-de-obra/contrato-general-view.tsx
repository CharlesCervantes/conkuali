import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { FormNuevaPartida } from "./form-nueva-partida";
import { FormNuevoConcepto } from "./form-nuevo-concepto";
import { formatMoney } from "@/lib/dinero";
import type { obtenerPartidasProyecto } from "@/lib/server/control-de-obra/estructura-contractual";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

type Partidas = Awaited<ReturnType<typeof obtenerPartidasProyecto>>;
type Concepto = Partidas[number]["conceptos"][number];

function cant(valor: number): string {
  return valor.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

// Subtotal operativo = cantidad × (P.U. + Materiales si Precio Alzado). Nunca
// incluye Indirectos/Herramienta/%/precio comercial — eso es Contrato General
// Privado (pestaña aparte). En Administración no es "el costo total de la
// partida" (todavía falta materiales reales, otros gastos reales y %
// administración) — por eso la etiqueta en el pie de tabla es distinta según
// esquema (precisión de sesión, agosto 2026).
function subtotalOperativo(concepto: Concepto, esPrecioAlzado: boolean): number {
  const puContratista = concepto.precioUnitarioContratista
    ? Number(concepto.precioUnitarioContratista)
    : 0;
  const puMateriales =
    esPrecioAlzado && concepto.precioUnitarioMateriales
      ? Number(concepto.precioUnitarioMateriales)
      : 0;
  return Number(concepto.cantidadContratada) * (puContratista + puMateriales);
}

export function ContratoGeneralView({
  proyectoId,
  partidas,
  esquemaContractual,
  puedeAdministrar,
}: {
  proyectoId: string;
  partidas: Partidas;
  esquemaContractual: EsquemaContractual | null;
  puedeAdministrar: boolean;
}) {
  const esPrecioAlzado = esquemaContractual === "PRECIO_ALZADO";

  return (
    <div className="space-y-3">
      {partidas.length === 0 && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay partidas en este proyecto.
        </Card>
      )}

      {partidas.map((partida, i) => {
        const subtotal = partida.conceptos.reduce(
          (t, c) => t + subtotalOperativo(c, esPrecioAlzado),
          0
        );

        return (
          <Card
            key={partida.id}
            className="enter overflow-hidden"
            style={{ transitionDelay: `${Math.min(i, 6) * 40}ms` }}
          >
            <details>
              <summary className="group flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {partida.nombre}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {partida.conceptos.length} concepto
                  {partida.conceptos.length === 1 ? "" : "s"}
                </span>
              </summary>

              <div className="border-t border-[var(--border)] px-5 py-4 space-y-5">
                {partida.conceptos.length > 0 && (
                  <TablaOperativa
                    conceptos={partida.conceptos}
                    esPrecioAlzado={esPrecioAlzado}
                    subtotal={subtotal}
                  />
                )}

                {puedeAdministrar && (
                  <details>
                    <summary className="inline-flex w-fit cursor-pointer list-none items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out select-none hover:bg-black/[0.03] [&::-webkit-details-marker]:hidden">
                      + Agregar concepto
                    </summary>
                    <div className="mt-3">
                      <FormNuevoConcepto
                        partidaId={partida.id}
                        proyectoId={proyectoId}
                        esquemaContractual={esquemaContractual}
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
        <Card className="p-4">
          <FormNuevaPartida proyectoId={proyectoId} />
        </Card>
      )}
    </div>
  );
}

function TablaOperativa({
  conceptos,
  esPrecioAlzado,
  subtotal,
}: {
  conceptos: Concepto[];
  esPrecioAlzado: boolean;
  subtotal: number;
}) {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Concepto</Th>
          <Th>Unidad</Th>
          <Th className="text-right">Cantidad</Th>
          <Th className="text-right">P.U.</Th>
          {esPrecioAlzado && <Th className="text-right">P.U. materiales</Th>}
          <Th className="text-right">Subtotal</Th>
        </Tr>
      </Thead>
      <tbody>
        {conceptos.map((concepto) => (
          <Tr key={concepto.id}>
            <Td className="font-medium">{concepto.descripcion}</Td>
            <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
            <Td className="text-right tabular-nums">{cant(Number(concepto.cantidadContratada))}</Td>
            <Td className="text-right tabular-nums text-[var(--muted)]">
              {concepto.precioUnitarioContratista !== null
                ? formatMoney(concepto.precioUnitarioContratista)
                : "—"}
            </Td>
            {esPrecioAlzado && (
              <Td className="text-right tabular-nums text-[var(--muted)]">
                {concepto.precioUnitarioMateriales !== null
                  ? formatMoney(concepto.precioUnitarioMateriales)
                  : "—"}
              </Td>
            )}
            <Td className="text-right font-medium tabular-nums">
              {formatMoney(subtotalOperativo(concepto, esPrecioAlzado))}
            </Td>
          </Tr>
        ))}
      </tbody>
      <tfoot>
        <Tr className="bg-black/[0.015]">
          <Td
            colSpan={esPrecioAlzado ? 5 : 4}
            className="text-right text-sm font-medium text-[var(--muted)]"
          >
            {esPrecioAlzado
              ? "Presupuesto de partida (contratista + materiales)"
              : "Importe contratado (mano de obra)"}
          </Td>
          <Td className="text-right font-semibold tabular-nums">{formatMoney(subtotal)}</Td>
        </Tr>
      </tfoot>
    </Table>
  );
}
