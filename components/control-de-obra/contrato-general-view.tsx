import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { FormNuevaPartida } from "./form-nueva-partida";
import { FormNuevoConcepto } from "./form-nuevo-concepto";
import { formatMoney } from "@/lib/dinero";
import {
  calcularImportesConcepto,
  type ImportesConceptoCalculados,
} from "@/lib/control-de-obra/contrato-general";
import type { obtenerPartidasProyecto } from "@/lib/server/control-de-obra/estructura-contractual";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

type Partidas = Awaited<ReturnType<typeof obtenerPartidasProyecto>>;
type Concepto = Partidas[number]["conceptos"][number];

function cant(valor: number): string {
  return valor.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

export function ContratoGeneralView({
  proyectoId,
  partidas,
  esquemaContractual,
  porcentajesDefault,
  puedeAdministrar,
  puedeVerPrivado,
}: {
  proyectoId: string;
  partidas: Partidas;
  esquemaContractual: EsquemaContractual | null;
  porcentajesDefault: { utilidad: number | null; administracion: number | null };
  puedeAdministrar: boolean;
  puedeVerPrivado: boolean;
}) {
  const mostrarIndirectosHerramienta = esquemaContractual !== "ADMINISTRACION";

  const partidasConCalculo = partidas.map((partida) => {
    const conceptos = partida.conceptos.map((concepto) => ({
      concepto,
      importes: calcularImportesConcepto(
        {
          precioUnitarioContratista: numOrNull(concepto.precioUnitarioContratista),
          precioUnitarioMateriales: numOrNull(concepto.precioUnitarioMateriales),
          precioUnitarioIndirectos: numOrNull(concepto.precioUnitarioIndirectos),
          precioUnitarioHerramienta: numOrNull(concepto.precioUnitarioHerramienta),
          porcentajeUtilidad: numOrNull(concepto.porcentajeUtilidad),
          porcentajeAdministracion: numOrNull(concepto.porcentajeAdministracion),
          precioUnitarioClienteOverride: numOrNull(concepto.precioUnitarioClienteOverride),
          cantidadContratada: Number(concepto.cantidadContratada),
        },
        esquemaContractual,
        porcentajesDefault
      ),
    }));

    const totalPartida = conceptos.reduce((t, c) => t + c.importes.importeTotal, 0);

    return { partida, conceptos, totalPartida };
  });

  const totalContratoVenta = partidasConCalculo.reduce((t, p) => t + p.totalPartida, 0);

  return (
    <div className="space-y-3">
      {partidas.length === 0 && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay partidas en este proyecto.
        </Card>
      )}

      {partidasConCalculo.map(({ partida, conceptos, totalPartida }, i) => {
        const subtotalOperativo = conceptos.reduce(
          (t, c) => t + c.importes.subtotalOperativo,
          0
        );

        return (
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

              <div className="border-t border-[var(--border)] px-5 py-4 space-y-5">
                {conceptos.length > 0 && (
                  <TablaOperativa conceptos={conceptos} subtotal={subtotalOperativo} />
                )}

                {puedeVerPrivado && conceptos.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Contrato General Privado
                    </p>
                    <TablaPrivada
                      conceptos={conceptos}
                      mostrarIndirectosHerramienta={mostrarIndirectosHerramienta}
                    />
                    <ResumenPartida
                      conceptos={conceptos}
                      totalPartida={totalPartida}
                      mostrarIndirectosHerramienta={mostrarIndirectosHerramienta}
                    />
                  </div>
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
                        puedeVerPrivado={puedeVerPrivado}
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

      {puedeVerPrivado && partidas.length > 0 && (
        <Card className="enter flex items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold text-[var(--foreground)]">
            TOTAL CONTRATO
          </span>
          <span className="text-base font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(totalContratoVenta)}
          </span>
        </Card>
      )}
    </div>
  );
}

function numOrNull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : n;
}

function TablaOperativa({
  conceptos,
  subtotal,
}: {
  conceptos: { concepto: Concepto; importes: ImportesConceptoCalculados }[];
  subtotal: number;
}) {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Concepto</Th>
          <Th>Unidad</Th>
          <Th className="text-right">Cantidad</Th>
          <Th className="text-right">P.U. contratista</Th>
          <Th className="text-right">P.U. materiales</Th>
          <Th className="text-right">Subtotal</Th>
        </Tr>
      </Thead>
      <tbody>
        {conceptos.map(({ concepto, importes }) => (
          <Tr key={concepto.id}>
            <Td className="font-medium">{concepto.descripcion}</Td>
            <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
            <Td className="text-right tabular-nums">{cant(importes.cantidad)}</Td>
            <Td className="text-right tabular-nums text-[var(--muted)]">
              {concepto.precioUnitarioContratista !== null
                ? formatMoney(concepto.precioUnitarioContratista)
                : "—"}
            </Td>
            <Td className="text-right tabular-nums text-[var(--muted)]">
              {concepto.precioUnitarioMateriales !== null
                ? formatMoney(concepto.precioUnitarioMateriales)
                : "—"}
            </Td>
            <Td className="text-right font-medium tabular-nums">
              {formatMoney(importes.subtotalOperativo)}
            </Td>
          </Tr>
        ))}
      </tbody>
      <tfoot>
        <Tr className="bg-black/[0.015]">
          <Td colSpan={5} className="text-right text-sm font-medium text-[var(--muted)]">
            Presupuesto de partida (contratista + materiales)
          </Td>
          <Td className="text-right font-semibold tabular-nums">{formatMoney(subtotal)}</Td>
        </Tr>
      </tfoot>
    </Table>
  );
}

function TablaPrivada({
  conceptos,
  mostrarIndirectosHerramienta,
}: {
  conceptos: { concepto: Concepto; importes: ImportesConceptoCalculados }[];
  mostrarIndirectosHerramienta: boolean;
}) {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Concepto</Th>
          {mostrarIndirectosHerramienta && <Th className="text-right">Indirectos</Th>}
          {mostrarIndirectosHerramienta && <Th className="text-right">Herramienta</Th>}
          <Th className="text-right">%</Th>
          <Th className="text-right">P.U. recomendado</Th>
          <Th className="text-right">P.U. cliente</Th>
          <Th className="text-right">Importe</Th>
        </Tr>
      </Thead>
      <tbody>
        {conceptos.map(({ concepto, importes }) => (
          <Tr key={concepto.id}>
            <Td className="font-medium">{concepto.descripcion}</Td>
            {mostrarIndirectosHerramienta && (
              <Td className="text-right tabular-nums text-[var(--muted)]">
                {formatMoney(importes.costoIndirectos)}
              </Td>
            )}
            {mostrarIndirectosHerramienta && (
              <Td className="text-right tabular-nums text-[var(--muted)]">
                {formatMoney(importes.costoHerramienta)}
              </Td>
            )}
            <Td className="text-right tabular-nums text-[var(--muted)]">
              {importes.porcentajeAplicado !== null
                ? `${importes.porcentajeAplicado.toLocaleString("es-MX")}%`
                : "—"}
            </Td>
            <Td className="text-right tabular-nums text-[var(--muted)]">
              {formatMoney(importes.precioUnitarioRecomendado)}
            </Td>
            <Td className="text-right tabular-nums">
              <span className={importes.tieneOverride ? "font-semibold" : ""}>
                {formatMoney(importes.precioUnitarioCliente)}
              </span>
              {importes.tieneOverride && (
                <span className="ml-1.5 text-xs text-[var(--muted)]">(comercial)</span>
              )}
            </Td>
            <Td className="text-right font-medium tabular-nums">
              {formatMoney(importes.importeTotal)}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function ResumenPartida({
  conceptos,
  totalPartida,
  mostrarIndirectosHerramienta,
}: {
  conceptos: { concepto: Concepto; importes: ImportesConceptoCalculados }[];
  totalPartida: number;
  mostrarIndirectosHerramienta: boolean;
}) {
  const totales = conceptos.reduce(
    (t, c) => ({
      contratistas: t.contratistas + c.importes.importeContratista,
      materiales: t.materiales + c.importes.importeMateriales,
      indirectos: t.indirectos + c.importes.importeIndirectos,
      herramienta: t.herramienta + c.importes.importeHerramienta,
      utilidad: t.utilidad + c.importes.importeUtilidadOAdministracion,
    }),
    { contratistas: 0, materiales: 0, indirectos: 0, herramienta: 0, utilidad: 0 }
  );

  return (
    <div className="mt-3 flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
      <span>
        Contratistas <span className="tabular-nums text-[var(--foreground)]">{formatMoney(totales.contratistas)}</span>
      </span>
      <span>
        Materiales <span className="tabular-nums text-[var(--foreground)]">{formatMoney(totales.materiales)}</span>
      </span>
      {mostrarIndirectosHerramienta && (
        <>
          <span>
            Indirectos <span className="tabular-nums text-[var(--foreground)]">{formatMoney(totales.indirectos)}</span>
          </span>
          <span>
            Herramienta <span className="tabular-nums text-[var(--foreground)]">{formatMoney(totales.herramienta)}</span>
          </span>
        </>
      )}
      <span>
        Utilidad/Administración <span className="tabular-nums text-[var(--foreground)]">{formatMoney(totales.utilidad)}</span>
      </span>
      <span className="text-sm font-semibold text-[var(--foreground)]">
        Total venta de partida <span className="tabular-nums">{formatMoney(totalPartida)}</span>
      </span>
    </div>
  );
}
