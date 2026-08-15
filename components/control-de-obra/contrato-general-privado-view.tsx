import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import {
  calcularImportesConcepto,
  type ImportesConceptoCalculados,
} from "@/lib/control-de-obra/contrato-general";
import { TablaPrivadaEditable, type ConceptoPrivado } from "./tabla-privada-editable";
import {
  TablaAdministracionEditable,
  type ConceptoAdministracion,
} from "./tabla-administracion-editable";
import { IconoPartida } from "./icono-partida";
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
  const esAdministracion = esquemaContractual === "ADMINISTRACION";
  const mostrarIndirectosHerramienta = esquemaContractual === "PRECIO_ALZADO";

  // Nada de Decimal cruza hacia los componentes cliente (TablaPrivadaEditable
  // / TablaAdministracionEditable) — todo se convierte a number aquí, en el
  // server component, igual que se corrigió antes en Avance de obra (los
  // objetos Decimal de Prisma no son serializables de Server a Client
  // Component).
  const partidasConCalculo = partidas.map((partida) => {
    const conceptos: { concepto: ConceptoPrivado; importes: ImportesConceptoCalculados }[] =
      partida.conceptos.map((concepto) => {
        const costos = {
          precioUnitarioContratista: numOrNull(concepto.precioUnitarioContratista),
          precioUnitarioContratistaPrivado: numOrNull(concepto.precioUnitarioContratistaPrivado),
          precioUnitarioMateriales: numOrNull(concepto.precioUnitarioMateriales),
          precioUnitarioIndirectos: numOrNull(concepto.precioUnitarioIndirectos),
          precioUnitarioHerramienta: numOrNull(concepto.precioUnitarioHerramienta),
          porcentajeUtilidad: numOrNull(concepto.porcentajeUtilidad),
          porcentajeAdministracion: numOrNull(concepto.porcentajeAdministracion),
        };
        // Descripción/unidad/cantidad de Privado: nacen iguales a las de
        // Contrato General (null = todavía no se editaron aquí) y quedan
        // independientes en cuanto se editan — mismo patrón que el P.U.
        // privado (decisión de sesión, agosto 2026).
        const cantidadPrivada =
          concepto.cantidadContratadaPrivado !== null ? Number(concepto.cantidadContratadaPrivado) : null;
        const descripcionActual = concepto.descripcionPrivado ?? concepto.descripcion;
        const unidadActual = concepto.unidadPrivado ?? concepto.unidad;
        const cantidadActual = cantidadPrivada ?? Number(concepto.cantidadContratada);

        return {
          concepto: {
            id: concepto.id,
            descripcion: descripcionActual,
            unidad: unidadActual,
            cantidad: cantidadActual,
            descripcionPrivado: concepto.descripcionPrivado,
            unidadPrivado: concepto.unidadPrivado,
            cantidadContratadaPrivado: cantidadPrivada,
            ...costos,
          },
          importes: calcularImportesConcepto(
            { ...costos, cantidadContratada: cantidadActual },
            esquemaContractual,
            porcentajesDefault
          ),
        };
      });

    const totalPartida = conceptos.reduce((t, c) => t + c.importes.importeTotal, 0);
    const subtotalManoObra = conceptos.reduce((t, c) => t + c.importes.importeContratista, 0);
    const montoAdm = conceptos.reduce((t, c) => t + c.importes.importeUtilidadOAdministracion, 0);
    return { partida, conceptos, totalPartida, subtotalManoObra, montoAdm };
  });

  const totalContratoVenta = partidasConCalculo.reduce((t, p) => t + p.totalPartida, 0);
  const todosLosConceptos = partidasConCalculo.flatMap((p) => p.conceptos);
  const totales = todosLosConceptos.reduce(
    (t, c) => ({
      contratistas: t.contratistas + c.importes.importeContratista,
      materiales: t.materiales + c.importes.importeMateriales,
      indirectos: t.indirectos + c.importes.importeIndirectos,
      herramienta: t.herramienta + c.importes.importeHerramienta,
      porcentaje: t.porcentaje + c.importes.importeUtilidadOAdministracion,
    }),
    { contratistas: 0, materiales: 0, indirectos: 0, herramienta: 0, porcentaje: 0 }
  );
  const porcentajeProyecto = esAdministracion
    ? porcentajesDefault.administracion
    : porcentajesDefault.utilidad;

  return (
    <div className="space-y-3">
      {partidas.length === 0 && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay partidas en este proyecto.
        </Card>
      )}

      {partidas.length > 0 && (
        <ResumenContratoPrivado
          proyectoId={proyectoId}
          esAdministracion={esAdministracion}
          mostrarIndirectosHerramienta={mostrarIndirectosHerramienta}
          totales={totales}
          totalContratoVenta={totalContratoVenta}
          porcentajeProyecto={porcentajeProyecto}
        />
      )}

      {partidasConCalculo.map(({ partida, conceptos, totalPartida, subtotalManoObra, montoAdm }, i) => (
        <Card
          key={partida.id}
          className="enter overflow-hidden"
          style={{ transitionDelay: `${Math.min(i, 6) * 40}ms` }}
        >
          <details>
            <summary className="group flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-3">
                <IconoPartida icono={partida.icono} color={partida.color} />
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {partida.nombre}
                </span>
              </span>
              {esAdministracion && conceptos.length > 0 ? (
                <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
                  <span>
                    Subtotal{" "}
                    <span className="tabular-nums text-[var(--foreground)]">
                      {formatMoney(subtotalManoObra)}
                    </span>
                  </span>
                  <span>
                    ADM{" "}
                    <span className="tabular-nums text-[var(--foreground)]">
                      {formatMoney(montoAdm)}
                    </span>
                  </span>
                  <span className="font-semibold text-[var(--foreground)]">
                    Total <span className="tabular-nums">{formatMoney(totalPartida)}</span>
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
              {conceptos.length > 0 &&
                (esAdministracion ? (
                  <TablaAdministracionEditable
                    proyectoId={proyectoId}
                    filas={conceptos.map(({ concepto, importes }) => ({
                      concepto: concepto as ConceptoAdministracion,
                      importe: {
                        subtotal: importes.importeContratista,
                        montoAdm: importes.importeUtilidadOAdministracion,
                        total: importes.importeTotal,
                        porcentajeAplicado: importes.porcentajeAplicado,
                      },
                    }))}
                  />
                ) : (
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
                ))}
            </div>
          </details>
        </Card>
      ))}
    </div>
  );
}

// Único lugar con el desglose comercial completo (Indirectos/Herramienta si
// Precio Alzado, % Utilidad o % Administración, Total con precio comercial)
// — esto es exactamente lo que separa Contrato General Privado de Contrato
// General (sección 49.9). "Editar %" enlaza a Editar proyecto, que ya
// permite cambiar el % default; no se duplica esa edición aquí.
function ResumenContratoPrivado({
  proyectoId,
  esAdministracion,
  mostrarIndirectosHerramienta,
  totales,
  totalContratoVenta,
  porcentajeProyecto,
}: {
  proyectoId: string;
  esAdministracion: boolean;
  mostrarIndirectosHerramienta: boolean;
  totales: {
    contratistas: number;
    materiales: number;
    indirectos: number;
    herramienta: number;
    porcentaje: number;
  };
  totalContratoVenta: number;
  porcentajeProyecto: number | null;
}) {
  const etiquetaPorcentaje = esAdministracion ? "% Administración" : "% Utilidad";

  return (
    <Card className="enter p-5 ring-2 ring-emerald-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Resumen del contrato — Privado
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(totalContratoVenta)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">
            {etiquetaPorcentaje}
            {porcentajeProyecto !== null && ` (default)`}
          </p>
          <p className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
            {porcentajeProyecto !== null ? `${porcentajeProyecto.toLocaleString("es-MX")}%` : "—"}
          </p>
          <Link
            href={`/control-de-obra/${proyectoId}/editar`}
            className="text-xs font-medium text-[var(--brand)] hover:underline"
          >
            Editar %
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--border)] pt-4">
        <Metrica label="Contratistas" valor={totales.contratistas} />
        <Metrica label="Materiales" valor={totales.materiales} />
        {mostrarIndirectosHerramienta && (
          <>
            <Metrica label="Indirectos" valor={totales.indirectos} />
            <Metrica label="Herramienta" valor={totales.herramienta} />
          </>
        )}
        <Metrica label={etiquetaPorcentaje} valor={totales.porcentaje} />
      </div>
    </Card>
  );
}

function Metrica({ label, valor }: { label: string; valor: number }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-base font-semibold tabular-nums text-[var(--foreground)]">
        {formatMoney(valor)}
      </p>
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
