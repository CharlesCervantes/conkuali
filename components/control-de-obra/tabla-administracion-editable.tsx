"use client";

import { useActionState, useState } from "react";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { cn } from "@/lib/cn";
import {
  editarConceptoPrivadoAction,
  type FormState,
} from "@/app/(app)/control-de-obra/[id]/actions";

// Plano y sin Decimal a propósito (igual que tabla-privada-editable.tsx).
export type ConceptoAdministracion = {
  id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  precioUnitarioContratista: number | null;
  precioUnitarioClienteOverride: number | null;
  porcentajeAdministracion: number | null;
};

export type ImporteFilaAdministracion = {
  subtotal: number;
  montoAdm: number;
  total: number;
  porcentajeAplicado: number | null;
};

export function TablaAdministracionEditable({
  proyectoId,
  filas,
}: {
  proyectoId: string;
  filas: { concepto: ConceptoAdministracion; importe: ImporteFilaAdministracion }[];
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const totalAdm = filas.reduce((t, f) => t + f.importe.montoAdm, 0);
  const totalGeneral = filas.reduce((t, f) => t + f.importe.total, 0);
  const porcentajes = new Set(filas.map((f) => f.importe.porcentajeAplicado));
  const unicoPorcentaje = porcentajes.size === 1 ? filas[0]?.importe.porcentajeAplicado : null;
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
          <Th className="text-right">Subtotal</Th>
        </Tr>
      </Thead>
      <tbody>
        {filas.map(({ concepto, importe }) => (
          <Tr key={concepto.id}>
            <Td className="font-medium">{concepto.descripcion}</Td>
            <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
            <Td className="text-right tabular-nums">
              {concepto.cantidad.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
            </Td>
            <Td className="text-right tabular-nums">
              {editandoId === concepto.id ? (
                <FormEditarPU
                  proyectoId={proyectoId}
                  concepto={concepto}
                  onCancelar={() => setEditandoId(null)}
                  onGuardado={() => setEditandoId(null)}
                />
              ) : (
                <div className="flex items-center justify-end gap-2">
                  <span>
                    {concepto.precioUnitarioContratista !== null
                      ? formatMoney(concepto.precioUnitarioContratista)
                      : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditandoId(concepto.id)}
                    className="text-xs font-medium text-[var(--brand)] transition-colors duration-150 ease-out hover:underline"
                  >
                    Editar
                  </button>
                </div>
              )}
            </Td>
            <Td className="text-right font-medium tabular-nums">{formatMoney(importe.subtotal)}</Td>
          </Tr>
        ))}
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
  );
}

// Edita SOLO el P.U. — es el único campo editable desde esta tabla (el resto
// de lo privado, si algún día aplica a Administración, se editaría aparte).
// Los otros campos privados del concepto viajan como hidden para no
// borrarlos: editarConceptoPrivado escribe lo que reciba, así que si este
// formulario no los mandara, se perderían (precisión de sesión, agosto 2026).
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
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (!state?.error) onGuardado();
  }

  const original = concepto.precioUnitarioContratista;
  const [texto, setTexto] = useState(original !== null ? String(original) : "");
  const nuevo = texto === "" ? null : Number(texto);
  // Comparación en vivo contra el valor que ya estaba guardado (el mismo que
  // se ve en Contrato General) — gris si es igual, verde si lo subiste, rojo
  // si lo bajaste. No es un segundo precio guardado en paralelo.
  const color =
    nuevo === null || original === null || nuevo === original || Number.isNaN(nuevo)
      ? "text-[var(--foreground)]"
      : nuevo > original
        ? "text-emerald-600"
        : "text-red-600";

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input
        type="hidden"
        name="precioUnitarioClienteOverride"
        value={concepto.precioUnitarioClienteOverride ?? ""}
      />
      <input
        type="hidden"
        name="porcentajeAdministracion"
        value={concepto.porcentajeAdministracion ?? ""}
      />
      <div className="flex items-center gap-2">
        <div className="w-28">
          <Input
            name="precioUnitarioContratista"
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
