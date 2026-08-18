"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import {
  emitirEstimacionAction,
  type EmitirEstimacionFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";

// Bloque de estado/emisión de Cliente Priv. para una semana cerrada — mismo
// patrón de modal propio (no window.confirm()) que CierreSemanaAbierta, ya
// que es una acción irreversible (congela la estimación para siempre).
export function EmitirEstimacion({
  proyectoId,
  estimacionId,
  numero,
  estatus,
  total,
  generadoPorNombre,
  emitidoPorNombre,
  emitidoEn,
  puedeEmitir,
}: {
  proyectoId: string;
  estimacionId: string;
  numero: number;
  estatus: "BORRADOR" | "EMITIDA";
  total: number;
  generadoPorNombre: string;
  emitidoPorNombre: string | null;
  emitidoEn: string | null;
  puedeEmitir: boolean;
}) {
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <Card className="enter p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Estimación {numero}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {estatus === "EMITIDA"
              ? `Emitida por ${emitidoPorNombre} · ${emitidoEn ? new Date(emitidoEn).toLocaleDateString("es-MX") : ""}`
              : `Borrador, generada al cerrar la semana por ${generadoPorNombre}`}
          </p>
        </div>
        <span
          className={
            estatus === "EMITIDA"
              ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"
              : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
          }
        >
          {estatus === "EMITIDA" ? "Emitida" : "Borrador"}
        </span>
      </div>

      {estatus === "BORRADOR" && puedeEmitir && (
        <div className="mt-4">
          <Button disabled={total <= 0} onClick={() => setModalAbierto(true)}>
            Emitir estimación
          </Button>
          {total <= 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              No hay importe en esta estimación todavía.
            </p>
          )}
        </div>
      )}

      {modalAbierto && (
        <ModalConfirmarEmision
          proyectoId={proyectoId}
          estimacionId={estimacionId}
          numero={numero}
          total={total}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </Card>
  );
}

function ModalConfirmarEmision({
  proyectoId,
  estimacionId,
  numero,
  total,
  onClose,
}: {
  proyectoId: string;
  estimacionId: string;
  numero: number;
  total: number;
  onClose: () => void;
}) {
  const action = emitirEstimacionAction.bind(null, proyectoId, estimacionId);
  const [state, formAction, pending] = useActionState<EmitirEstimacionFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.emitida) onClose();
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
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Emitir estimación {numero}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Esto congela la estimación por {formatMoney(total)} para siempre — ninguna edición
          posterior de precios ni una reapertura de la semana volverá a modificarla. Cualquier
          corrección después de emitida se maneja aparte.
        </p>

        <form action={formAction} className="mt-5 flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Emitiendo…" : "Sí, emitir estimación"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
          >
            Cancelar
          </button>
        </form>
        {state?.error && <p className="mt-3 text-sm text-red-700">{state.error}</p>}
      </Card>
    </div>,
    document.body
  );
}
