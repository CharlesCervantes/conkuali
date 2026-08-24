"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  liquidarMovimientoAction,
  type LiquidarFormState,
} from "@/app/(app)/reporte-general/actions";

const METODOS_PAGO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA_DEBITO", label: "Tarjeta débito" },
  { value: "TARJETA_CREDITO", label: "Tarjeta crédito" },
];

const CAMPO_CLASE =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";

// Botón discreto de texto — el modal solo se monta cuando se abre, así la
// mayoría de las filas (todas menos las PENDIENTE_PAGO con permiso) no
// pagan el costo de un modal fuera de pantalla (mismo criterio que
// FormularioGasto/FormularioOrdenCompra).
export function BotonLiquidar({ movimientoId }: { movimientoId: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-0.5 block text-[11px] font-medium text-[var(--brand)] hover:underline"
      >
        Liquidar
      </button>
      {abierto && <ModalLiquidar movimientoId={movimientoId} onClose={() => setAbierto(false)} />}
    </>
  );
}

function ModalLiquidar({
  movimientoId,
  onClose,
}: {
  movimientoId: string;
  onClose: () => void;
}) {
  const action = liquidarMovimientoAction.bind(null, movimientoId);
  const [state, formAction, pending] = useActionState<LiquidarFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onClose();
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Liquidar pago</h2>

        <form action={formAction} className="mt-4 space-y-3">
          <Campo label="Fecha de pago">
            <input
              name="fechaPago"
              type="date"
              required
              defaultValue={hoy}
              className={CAMPO_CLASE}
            />
          </Campo>

          <Campo label="Método de pago">
            <select name="metodoPago" required defaultValue="" className={CAMPO_CLASE}>
              <option value="" disabled>
                Selecciona…
              </option>
              {METODOS_PAGO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Referencia / comprobante (opcional)">
            <input name="referenciaPago" type="text" className={CAMPO_CLASE} />
          </Campo>

          <Campo label="Notas (opcional)">
            <textarea name="notasPago" rows={2} className={CAMPO_CLASE} />
          </Campo>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Liquidando…" : "Liquidar"}
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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      {children}
    </div>
  );
}
