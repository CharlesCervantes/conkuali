"use client";

import { useState } from "react";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { formatMoney } from "@/lib/dinero";
import { cn } from "@/lib/cn";
import { ModalEditarConcepto } from "./modal-editar-concepto";

// Plano y sin Decimal a propósito — cruza de Server a Client Component (ver
// contrato-general-view.tsx, que hace la conversión).
export type ConceptoOperativoPlano = {
  id: string;
  descripcion: string;
  unidad: string;
  cantidadContratada: number;
  precioUnitarioContratista: number | null;
  precioUnitarioMateriales: number | null;
  porcentajeAdministracion: number | null;
};

function cant(valor: number): string {
  return valor.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

function subtotalOperativo(concepto: ConceptoOperativoPlano, esPrecioAlzado: boolean): number {
  const puContratista = concepto.precioUnitarioContratista ?? 0;
  const puMateriales = esPrecioAlzado ? (concepto.precioUnitarioMateriales ?? 0) : 0;
  return concepto.cantidadContratada * (puContratista + puMateriales);
}

function porcentajeAdministracionEfectivo(
  concepto: ConceptoOperativoPlano,
  porcentajeAdministracionDefault: number | null
): number | null {
  return concepto.porcentajeAdministracion ?? porcentajeAdministracionDefault;
}

export function TablaOperativaEditable({
  proyectoId,
  conceptos,
  esPrecioAlzado,
  esAdministracion,
  porcentajeAdministracionDefault,
  subtotal,
  montoAdm,
  puedeAdministrar,
}: {
  proyectoId: string;
  conceptos: ConceptoOperativoPlano[];
  esPrecioAlzado: boolean;
  esAdministracion: boolean;
  porcentajeAdministracionDefault: number | null;
  subtotal: number;
  montoAdm: number;
  puedeAdministrar: boolean;
}) {
  const [conceptoEditandoId, setConceptoEditandoId] = useState<string | null>(null);

  const porcentajes = new Set(
    conceptos.map((c) => porcentajeAdministracionEfectivo(c, porcentajeAdministracionDefault))
  );
  const unicoPorcentaje = porcentajes.size === 1 ? [...porcentajes][0] : null;
  const etiquetaAdm =
    unicoPorcentaje !== null && unicoPorcentaje !== undefined
      ? `% Administración (${unicoPorcentaje.toLocaleString("es-MX")}%)`
      : "% Administración";

  return (
    <>
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
            <Tr
              key={concepto.id}
              onClick={puedeAdministrar ? () => setConceptoEditandoId(concepto.id) : undefined}
              title={puedeAdministrar ? "Clic para editar el concepto" : undefined}
              className={cn(
                puedeAdministrar &&
                  "cursor-pointer transition-colors duration-150 ease-out hover:bg-[var(--brand)]/[0.05]"
              )}
            >
              <Td className="font-medium">{concepto.descripcion}</Td>
              <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
              <Td className="text-right tabular-nums">{cant(concepto.cantidadContratada)}</Td>
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

      {conceptoEditandoId && (
        <ModalEditarConcepto
          proyectoId={proyectoId}
          conceptoId={conceptoEditandoId}
          modo="operativo"
          onClose={() => setConceptoEditandoId(null)}
        />
      )}
    </>
  );
}
