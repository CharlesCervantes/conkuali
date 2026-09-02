"use client";

import { useActionState, useState } from "react";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { cn } from "@/lib/cn";
import { ModalEditarConcepto } from "./modal-editar-concepto";
import {
  editarConceptoPrivadoAction,
  type EditarConceptoPrivadoFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";

// Plano y sin Decimal a propósito (igual que tabla-privada-editable.tsx).
export type ConceptoAdministracion = {
  id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  descripcionPrivado: string | null;
  unidadPrivado: string | null;
  cantidadContratadaPrivado: number | null;
  precioUnitarioContratista: number | null;
  precioUnitarioContratistaPrivado: number | null;
  porcentajeAdministracion: number | null;
};

export type ImporteFilaAdministracion = {
  subtotal: number;
  montoAdm: number;
  total: number;
  porcentajeAplicado: number | null;
};

// Compara contra precioUnitarioContratista (Contrato General) — dos valores
// reales y persistidos, no una comparación de sesión, así que el color se ve
// igual ahora, después de guardar, o en una recarga completa de la página.
function colorPU(privado: number | null, general: number | null): string {
  if (privado === null || general === null || privado === general) {
    return "text-[var(--foreground)]";
  }
  return privado > general ? "text-emerald-600" : "text-red-600";
}

export function TablaAdministracionEditable({
  proyectoId,
  filas,
}: {
  proyectoId: string;
  filas: { concepto: ConceptoAdministracion; importe: ImporteFilaAdministracion }[];
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [conceptoModalId, setConceptoModalId] = useState<string | null>(null);

  const totalAdm = filas.reduce((t, f) => t + f.importe.montoAdm, 0);
  const totalGeneral = filas.reduce((t, f) => t + f.importe.total, 0);
  const porcentajes = new Set(filas.map((f) => f.importe.porcentajeAplicado));
  const unicoPorcentaje = porcentajes.size === 1 ? filas[0]?.importe.porcentajeAplicado : null;
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
            <Th className="text-right">Subtotal</Th>
          </Tr>
        </Thead>
        <tbody>
          {filas.map(({ concepto, importe }) => {
            const puActual = concepto.precioUnitarioContratistaPrivado ?? concepto.precioUnitarioContratista;
            return (
              <Tr
                key={concepto.id}
                onClick={() => setConceptoModalId(concepto.id)}
                title="Clic para editar el concepto"
                className="cursor-pointer transition-colors duration-150 ease-out hover:bg-[var(--brand)]/[0.05]"
              >
                <Td className="font-medium">{concepto.descripcion}</Td>
                <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
                <Td className="text-right tabular-nums">
                  {concepto.cantidad.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
                </Td>
                <Td className="text-right tabular-nums" onClick={(e) => e.stopPropagation()}>
                  {editandoId === concepto.id ? (
                    <FormEditarPU
                      proyectoId={proyectoId}
                      concepto={concepto}
                      onCancelar={() => setEditandoId(null)}
                      onGuardado={() => setEditandoId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditandoId(concepto.id)}
                      title="Clic para editar"
                      className={cn(
                        "-my-1 rounded-md px-2 py-1 transition-colors duration-150 ease-out hover:bg-[var(--brand)]/[0.08]",
                        colorPU(puActual, concepto.precioUnitarioContratista)
                      )}
                    >
                      {puActual !== null ? formatMoney(puActual) : "—"}
                    </button>
                  )}
                </Td>
                <Td className="text-right font-medium tabular-nums">{formatMoney(importe.subtotal)}</Td>
              </Tr>
            );
          })}
        </tbody>
        <tfoot>
          <Tr className="bg-black/[0.015]">
            <Td colSpan={4} className="text-right text-sm text-[var(--muted)]">
              {etiquetaAdm}
            </Td>
            <Td className="text-right tabular-nums">{formatMoney(totalAdm)}</Td>
          </Tr>
          <Tr className="bg-black/[0.03]">
            <Td colSpan={4} className="text-right text-sm font-semibold text-[var(--foreground)]">
              Gran total
            </Td>
            <Td className="text-right font-bold tabular-nums">{formatMoney(totalGeneral)}</Td>
          </Tr>
        </tfoot>
      </Table>

      {conceptoModalId && (
        <ModalEditarConcepto
          proyectoId={proyectoId}
          conceptoId={conceptoModalId}
          modo="privado"
          onClose={() => setConceptoModalId(null)}
        />
      )}
    </>
  );
}

// Edita SOLO precioUnitarioContratistaPrivado — la copia editable de
// Contrato General Privado. Nunca toca precioUnitarioContratista (Contrato
// General original) ni ContratoConcepto.precioUnitarioContratista (que ya
// quedó congelado al asignar un contratista). Los demás campos privados
// viajan como hidden para no borrarlos: editarConceptoPrivado escribe lo que
// reciba (precisión de sesión, agosto 2026). Guarda en un solo paso: al
// terminar la Server Action con éxito, se cierra el editor solo.
function FormEditarPU({
  proyectoId,
  concepto,
  onCancelar,
  onGuardado,
}: {
  proyectoId: string;
  concepto: ConceptoAdministracion;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const action = editarConceptoPrivadoAction.bind(null, concepto.id, proyectoId);
  const [state, formAction, pending] = useActionState<
    EditarConceptoPrivadoFormState,
    FormData
  >(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onGuardado();
  }

  const valorInicial = concepto.precioUnitarioContratistaPrivado ?? concepto.precioUnitarioContratista;
  const [texto, setTexto] = useState(valorInicial !== null ? String(valorInicial) : "");
  const nuevo = texto === "" ? null : Number(texto);
  const color =
    nuevo === null || Number.isNaN(nuevo)
      ? "text-[var(--foreground)]"
      : colorPU(nuevo, concepto.precioUnitarioContratista);

  return (
    <form
      action={formAction}
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col items-end gap-1.5"
    >
      <input
        type="hidden"
        name="porcentajeAdministracion"
        value={concepto.porcentajeAdministracion ?? ""}
      />
      <input type="hidden" name="descripcionPrivado" value={concepto.descripcionPrivado ?? ""} />
      <input type="hidden" name="unidadPrivado" value={concepto.unidadPrivado ?? ""} />
      <input
        type="hidden"
        name="cantidadContratadaPrivado"
        value={concepto.cantidadContratadaPrivado ?? ""}
      />
      <div className="flex items-center gap-2">
        <div className="w-28">
          <Input
            name="precioUnitarioContratistaPrivado"
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={cn("text-right tabular-nums", color)}
          />
        </div>
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "…" : "Guardar"}
        </Button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-xs text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
        >
          Cancelar
        </button>
      </div>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
