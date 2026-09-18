"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  marcarRecepcionOrdenCompraAction,
  type OrdenCompraFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";
import type { FilaOrdenCompra } from "@/lib/server/control-de-obra/ordenes-compra";

// Recepción — INDEPENDIENTE del pago (Compras, septiembre 2026): puede
// marcarse en cualquier momento después de autorizada, sin importar si ya se
// generó el gasto o si ya se pagó.
export function FormularioRecepcionOC({
  proyectoId,
  orden,
  onClose,
}: {
  proyectoId: string;
  orden: FilaOrdenCompra;
  onClose: () => void;
}) {
  const action = marcarRecepcionOrdenCompraAction.bind(null, proyectoId, orden.id);
  const [state, formAction, pending] = useActionState<OrdenCompraFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardada) onClose();
  }

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Marcar recepción — {orden.folio}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Confirma que el material/servicio de esta compra fue recibido — independiente de si ya se pagó.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Estatus</label>
            <select
              name="estatusRecepcion"
              defaultValue="COMPLETA"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            >
              <option value="PARCIAL">Recibido parcial</option>
              <option value="COMPLETA">Recibido completo</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Evidencia (opcional)
            </label>
            <input
              name="evidenciaRecepcion"
              type="file"
              accept="image/*,application/pdf"
              className="w-full text-sm text-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Comentario (opcional)
            </label>
            <textarea
              name="comentarioRecepcion"
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Marcar recepción"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
            >
              Cancelar
            </button>
          </div>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        </form>
      </Card>
    </div>,
    document.body
  );
}
