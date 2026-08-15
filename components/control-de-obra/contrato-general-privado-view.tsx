import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import {
  calcularImportesConcepto,
  type ImportesConceptoCalculados,
} from "@/lib/control-de-obra/contrato-general";
import { TablaPrivadaEditable, type ConceptoPrivado } from "./tabla-privada-editable";
import type { obtenerPartidasProyectoPrivado } from "@/lib/server/control-de-obra/estructura-contractual";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

type Partidas = Awaited<ReturnType<typeof obtenerPartidasProyectoPrivado>>;

function numOrNull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : n;
}

export function ContratoGeneralPrivadoView({
  proyectoId,
  partidas,
  esquemaContractual,
  porcentajesDefault,
}: {
  proyectoId: string;
  partidas: Partidas;
  esquemaContractual: EsquemaContractual | null;
  porcentajesDefault: { utilidad: number | null; administracion: number | null };
}) {
  const mostrarIndirectosHerramienta = esquemaContractual === "PRECIO_ALZADO";

  // Nada de Decimal cruza hacia el componente cliente (TablaPrivadaEditable)
  // — todo se convierte a number aquí, en el server component, igual que se
  // corrigió antes en Avance de obra (los objetos Decimal de Prisma no son
  // serializables de Server a Client Component).
  const partidasConCalculo = partidas.map((partida) => {
    const conceptos: { concepto: ConceptoPrivado; importes: ImportesConceptoCalculados }[] =
      partida.conceptos.map((concepto) => {
        const costos = {
          precioUnitarioContratista: numOrNull(concepto.precioUnitarioContratista),
          precioUnitarioMateriales: numOrNull(concepto.precioUnitarioMateriales),
          precioUnitarioIndirectos: numOrNull(concepto.precioUnitarioIndirectos),
          precioUnitarioHerramienta: numOrNull(concepto.precioUnitarioHerramienta),
          porcentajeUtilidad: numOrNull(concepto.porcentajeUtilidad),
          porcentajeAdministracion: numOrNull(concepto.porcentajeAdministracion),
          precioUnitarioClienteOverride: numOrNull(concepto.precioUnitarioClienteOverride),
        };
        return {
          concepto: {
            id: concepto.id,
            descripcion: concepto.descripcion,
            ...costos,
          },
          importes: calcularImportesConcepto(
            { ...costos, cantidadContratada: Number(concepto.cantidadContratada) },
            esquemaContractual,
            porcentajesDefault
          ),
        };
      });

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

      {partidasConCalculo.map(({ partida, conceptos, totalPartida }, i) => (
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
              {conceptos.length > 0 && (
                <>
                  <TablaPrivadaEditable
                    proyectoId={proyectoId}
                    conceptos={conceptos}
                    esquemaContractual={esquemaContractual}
                    mostrarIndirectosHerramienta={mostrarIndirectosHerramienta}
                  />
                  <ResumenPartida
                    conceptos={conceptos}
                    totalPartida={totalPartida}
                    mostrarIndirectosHerramienta={mostrarIndirectosHerramienta}
                  />
                </>
              )}
            </div>
          </details>
        </Card>
      ))}

      {partidas.length > 0 && (
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

function ResumenPartida({
  conceptos,
  totalPartida,
  mostrarIndirectosHerramienta,
}: {
  conceptos: { concepto: ConceptoPrivado; importes: ImportesConceptoCalculados }[];
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
    <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
      <span>
        Contratistas{" "}
        <span className="tabular-nums text-[var(--foreground)]">
          {formatMoney(totales.contratistas)}
        </span>
      </span>
      <span>
        Materiales{" "}
        <span className="tabular-nums text-[var(--foreground)]">
          {formatMoney(totales.materiales)}
        </span>
      </span>
      {mostrarIndirectosHerramienta && (
        <>
          <span>
            Indirectos{" "}
            <span className="tabular-nums text-[var(--foreground)]">
              {formatMoney(totales.indirectos)}
            </span>
          </span>
          <span>
            Herramienta{" "}
            <span className="tabular-nums text-[var(--foreground)]">
              {formatMoney(totales.herramienta)}
            </span>
          </span>
        </>
      )}
      <span>
        Utilidad/Administración{" "}
        <span className="tabular-nums text-[var(--foreground)]">
          {formatMoney(totales.utilidad)}
        </span>
      </span>
      <span className="text-sm font-semibold text-[var(--foreground)]">
        Total venta de partida <span className="tabular-nums">{formatMoney(totalPartida)}</span>
      </span>
    </div>
  );
}
