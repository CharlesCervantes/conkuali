"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { CATEGORIAS_GASTO, CATEGORIA_GASTO_LABEL } from "@/lib/control-de-obra/categorias-gasto";
import {
  generarGastoDesdeOrdenCompraAction,
  type OrdenCompraFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";
import type { FilaOrdenCompra } from "@/lib/server/control-de-obra/ordenes-compra";

const METODOS_PAGO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA_DEBITO", label: "Tarjeta débito" },
  { value: "TARJETA_CREDITO", label: "Tarjeta crédito" },
];

// Registra el gasto real de una OC ya autorizada (sección 28, opción B) — el
// monto autorizado de la OC queda congelado; esto captura lo que en verdad
// se pagó, con su propia evidencia.
export function FormularioGastoDesdeOC({
  proyectoId,
  orden,
  onClose,
}: {
  proyectoId: string;
  orden: FilaOrdenCompra;
  onClose: () => void;
}) {
  const action = generarGastoDesdeOrdenCompraAction.bind(null, proyectoId, orden.id);
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

  const hoy = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Registrar gasto real — {orden.folio}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Autorizado: {formatMoney(orden.total)}. Captura lo que en verdad se pagó.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                Monto pagado
              </label>
              <input
                name="monto"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={orden.total}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                Fecha
              </label>
              <input
                name="fecha"
                type="date"
                required
                defaultValue={hoy}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                Categoría
              </label>
              <select
                name="categoria"
                defaultValue="MATERIAL"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              >
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_GASTO_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                Método de pago
              </label>
              <select
                name="metodoPago"
                required
                defaultValue=""
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {METODOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Comprobante de pago (opcional)
            </label>
            <input
              name="comprobantePago"
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
              name="comentario"
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Registrar gasto"}
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
