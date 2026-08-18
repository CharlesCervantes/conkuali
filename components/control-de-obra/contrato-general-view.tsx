import { Card } from "@/components/ui/card";
import { FormNuevaPartida } from "./form-nueva-partida";
import { FormNuevoConcepto } from "./form-nuevo-concepto";
import { IconoPartida } from "./icono-partida";
import { TablaOperativaEditable, type ConceptoOperativoPlano } from "./tabla-operativa-editable";
import { formatMoney } from "@/lib/dinero";
import { calcularPrecioOperativoConcepto } from "@/lib/control-de-obra/contrato-general";
import type { obtenerPartidasProyecto } from "@/lib/server/control-de-obra/estructura-contractual";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

type Partidas = Awaited<ReturnType<typeof obtenerPartidasProyecto>>;
type Concepto = Partidas[number]["conceptos"][number];

// Nada de Decimal cruza hacia TablaOperativaEditable ("use client") — se
// convierte a number aquí, en el server component (mismo motivo que Avance
// de obra y Contrato General Privado).
function aConceptoPlano(concepto: Concepto): ConceptoOperativoPlano {
  return {
    id: concepto.id,
    descripcion: concepto.descripcion,
    unidad: concepto.unidad,
    cantidadContratada: Number(concepto.cantidadContratada),
    precioUnitarioContratista:
      concepto.precioUnitarioContratista !== null ? Number(concepto.precioUnitarioContratista) : null,
    precioUnitarioMateriales:
      concepto.precioUnitarioMateriales !== null ? Number(concepto.precioUnitarioMateriales) : null,
    porcentajeAdministracion:
      concepto.porcentajeAdministracion !== null ? Number(concepto.porcentajeAdministracion) : null,
  };
}

// Wrapper: convierte los Decimal del Concepto de Prisma y llama al motor
// operativo compartido (lib/control-de-obra/contrato-general.ts) — Cliente
// (operativo) reutiliza esa misma función, así que esta fórmula nunca se
// duplica entre las dos pantallas.
function precioOperativo(
  concepto: Concepto,
  esquema: EsquemaContractual | null,
  porcentajeAdministracionDefault: number | null
) {
  return calcularPrecioOperativoConcepto(
    {
      precioUnitarioContratista:
        concepto.precioUnitarioContratista !== null ? Number(concepto.precioUnitarioContratista) : null,
      precioUnitarioMateriales:
        concepto.precioUnitarioMateriales !== null ? Number(concepto.precioUnitarioMateriales) : null,
      porcentajeAdministracion:
        concepto.porcentajeAdministracion !== null ? Number(concepto.porcentajeAdministracion) : null,
    },
    esquema,
    porcentajeAdministracionDefault
  );
}

// Subtotal operativo = cantidad × (P.U. + Materiales si Precio Alzado). Nunca
// incluye Indirectos/Herramienta/precio comercial — eso es Contrato General
// Privado (pestaña aparte).
function subtotalOperativo(
  concepto: Concepto,
  esquema: EsquemaContractual | null
): number {
  return Number(concepto.cantidadContratada) * precioOperativo(concepto, esquema, null).subtotalPorUnidad;
}

function montoAdministracion(
  concepto: Concepto,
  esquema: EsquemaContractual | null,
  porcentajeAdministracionDefault: number | null
): number {
  return (
    Number(concepto.cantidadContratada) *
    precioOperativo(concepto, esquema, porcentajeAdministracionDefault).montoAdministracionPorUnidad
  );
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

  const todosLosConceptos = partidas.flatMap((p) => p.conceptos);
  const totalContratistas = todosLosConceptos.reduce(
    (t, c) => t + Number(c.cantidadContratada) * (c.precioUnitarioContratista ? Number(c.precioUnitarioContratista) : 0),
    0
  );
  const totalMateriales = esPrecioAlzado
    ? todosLosConceptos.reduce(
        (t, c) => t + Number(c.cantidadContratada) * (c.precioUnitarioMateriales ? Number(c.precioUnitarioMateriales) : 0),
        0
      )
    : 0;
  const subtotalGeneral = totalContratistas + totalMateriales;
  const montoAdmGeneral = esAdministracion
    ? todosLosConceptos.reduce(
        (t, c) => t + montoAdministracion(c, esquemaContractual, porcentajeAdministracionDefault),
        0
      )
    : 0;

  return (
    <div className="space-y-3">
      {partidas.length === 0 && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay partidas en este proyecto.
        </Card>
      )}

      {partidas.length > 0 && (
        <ResumenContrato
          esPrecioAlzado={esPrecioAlzado}
          esAdministracion={esAdministracion}
          totalContratistas={totalContratistas}
          totalMateriales={totalMateriales}
          subtotalGeneral={subtotalGeneral}
          montoAdmGeneral={montoAdmGeneral}
          porcentajeAdministracionDefault={porcentajeAdministracionDefault}
        />
      )}

      {partidas.map((partida, i) => {
        const subtotal = partida.conceptos.reduce(
          (t, c) => t + subtotalOperativo(c, esquemaContractual),
          0
        );
        const montoAdm = esAdministracion
          ? partida.conceptos.reduce(
              (t, c) => t + montoAdministracion(c, esquemaContractual, porcentajeAdministracionDefault),
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
                <span className="flex items-center gap-3">
                  <IconoPartida icono={partida.icono} color={partida.color} />
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {partida.nombre}
                  </span>
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
                  <TablaOperativaEditable
                    proyectoId={proyectoId}
                    conceptos={partida.conceptos.map(aConceptoPlano)}
                    esPrecioAlzado={esPrecioAlzado}
                    esAdministracion={esAdministracion}
                    porcentajeAdministracionDefault={porcentajeAdministracionDefault}
                    subtotal={subtotal}
                    montoAdm={montoAdm}
                    puedeAdministrar={puedeAdministrar}
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

// Solo componentes operativos (Contratistas/Materiales) — nunca % Utilidad,
// P.U. Cliente ni Indirectos/Herramienta (eso es Contrato General Privado).
// % Administración es la única excepción porque no es privado (ver arriba).
function ResumenContrato({
  esPrecioAlzado,
  esAdministracion,
  totalContratistas,
  totalMateriales,
  subtotalGeneral,
  montoAdmGeneral,
  porcentajeAdministracionDefault,
}: {
  esPrecioAlzado: boolean;
  esAdministracion: boolean;
  totalContratistas: number;
  totalMateriales: number;
  subtotalGeneral: number;
  montoAdmGeneral: number;
  porcentajeAdministracionDefault: number | null;
}) {
  return (
    <Card className="enter p-5 ring-2 ring-emerald-200">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Resumen del contrato
      </p>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
        <Metrica label="Contratistas" valor={totalContratistas} />
        {esPrecioAlzado && <Metrica label="Materiales" valor={totalMateriales} />}
        {esAdministracion && (
          <Metrica
            label={
              porcentajeAdministracionDefault !== null
                ? `% Administración (${porcentajeAdministracionDefault.toLocaleString("es-MX")}%)`
                : "% Administración"
            }
            valor={montoAdmGeneral}
          />
        )}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-sm font-medium text-[var(--muted)]">
          {esAdministracion ? "Total (mano de obra + administración)" : "Subtotal directo (Contratistas + Materiales)"}
        </span>
        <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
          {formatMoney(esAdministracion ? subtotalGeneral + montoAdmGeneral : subtotalGeneral)}
        </span>
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

