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
// incluye Indirectos/Herramienta/precio comercial — eso es Contrato General
// Privado (pestaña aparte). En Administración no es "el costo total de la
// partida" (todavía falta materiales reales y otros gastos reales) — por eso
// la etiqueta en el pie de tabla es distinta según esquema (precisión de
// sesión, agosto 2026).
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

// % Administración NO es privado (a diferencia de % Utilidad en Precio
// Alzado) — Supervisor sí lo ve en Contrato General, igual que el monto que
// representa (sección 49.9 de la documentación de negocio). Se calcula
// siempre sobre precioUnitarioContratista (nunca sobre el P.U. de Contrato
// General Privado, que es un valor aparte).
function porcentajeAdministracionEfectivo(
  concepto: Concepto,
  porcentajeAdministracionDefault: number | null
): number | null {
  const propio = concepto.porcentajeAdministracion;
  return propio !== null && propio !== undefined
    ? Number(propio)
    : porcentajeAdministracionDefault;
}

function montoAdministracion(concepto: Concepto, porcentajeAdministracionDefault: number | null): number {
  const porcentaje = porcentajeAdministracionEfectivo(concepto, porcentajeAdministracionDefault);
  return subtotalOperativo(concepto, false) * ((porcentaje ?? 0) / 100);
}

export function ContratoGeneralView({
  proyectoId,
  partidas,
  esquemaContractual,
  porcentajeAdministracionDefault,
  puedeAdministrar,
}: {
  proyectoId: string;
  partidas: Partidas;
  esquemaContractual: EsquemaContractual | null;
  porcentajeAdministracionDefault: number | null;
  puedeAdministrar: boolean;
}) {
  const esPrecioAlzado = esquemaContractual === "PRECIO_ALZADO";
  const esAdministracion = esquemaContractual === "ADMINISTRACION";

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
        const montoAdm = esAdministracion
          ? partida.conceptos.reduce(
              (t, c) => t + montoAdministracion(c, porcentajeAdministracionDefault),
              0
            )
          : 0;

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
                {esAdministracion && partida.conceptos.length > 0 ? (
                  <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                    <span>
                      Subtotal{" "}
                      <span className="tabular-nums text-[var(--foreground)]">
                        {formatMoney(subtotal)}
                      </span>
                    </span>
                    <span>
                      ADM{" "}
                      <span className="tabular-nums text-[var(--foreground)]">
                        {formatMoney(montoAdm)}
                      </span>
                    </span>
                    <span className="font-semibold text-[var(--foreground)]">
                      Total <span className="tabular-nums">{formatMoney(subtotal + montoAdm)}</span>
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-[var(--muted)]">
                    {partida.conceptos.length} concepto
                    {partida.conceptos.length === 1 ? "" : "s"}
                  </span>
                )}
              </summary>

              <div className="border-t border-[var(--border)] px-5 py-4 space-y-5">
                {partida.conceptos.length > 0 && (
                  <TablaOperativa
                    conceptos={partida.conceptos}
                    esPrecioAlzado={esPrecioAlzado}
                    esAdministracion={esAdministracion}
                    porcentajeAdministracionDefault={porcentajeAdministracionDefault}
                    subtotal={subtotal}
                    montoAdm={montoAdm}
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
  esAdministracion,
  porcentajeAdministracionDefault,
  subtotal,
  montoAdm,
}: {
  conceptos: Concepto[];
  esPrecioAlzado: boolean;
  esAdministracion: boolean;
  porcentajeAdministracionDefault: number | null;
  subtotal: number;
  montoAdm: number;
}) {
  const porcentajes = new Set(
    conceptos.map((c) => porcentajeAdministracionEfectivo(c, porcentajeAdministracionDefault))
  );
  const unicoPorcentaje = porcentajes.size === 1 ? [...porcentajes][0] : null;
  const etiquetaAdm =
    unicoPorcentaje !== null && unicoPorcentaje !== undefined
      ? `% Administración (${unicoPorcentaje.toLocaleString("es-MX")}%)`
      : "% Administración";

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
        {esAdministracion && (
          <>
            <Tr className="bg-black/[0.015]">
              <Td colSpan={4} className="text-right text-sm text-[var(--muted)]">
                {etiquetaAdm}
              </Td>
              <Td className="text-right tabular-nums">{formatMoney(montoAdm)}</Td>
            </Tr>
            <Tr className="bg-black/[0.03]">
              <Td colSpan={4} className="text-right text-sm font-semibold text-[var(--foreground)]">
                Total
              </Td>
              <Td className="text-right font-bold tabular-nums">
                {formatMoney(subtotal + montoAdm)}
              </Td>
            </Tr>
          </>
        )}
      </tfoot>
    </Table>
  );
}
