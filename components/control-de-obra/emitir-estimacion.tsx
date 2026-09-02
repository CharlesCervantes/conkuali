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
} from "@/app/(proyecto)/control-de-obra/[id]/actions";

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
  fondoDisponible,
}: {
  proyectoId: string;
  estimacionId: string;
  numero: number | null;
  estatus: "BORRADOR" | "EMITIDA";
  total: number;
  generadoPorNombre: string;
  emitidoPorNombre: string | null;
  emitidoEn: string | null;
  puedeEmitir: boolean;
  fondoDisponible: number;
}) {
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <Card className="enter p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            {numero !== null ? `Estimación ${numero}` : "Estimación · borrador"}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {estatus === "EMITIDA"
              ? `Emitida por ${emitidoPorNombre} · ${emitidoEn ? new Date(emitidoEn).toLocaleDateString("es-MX") : ""}`
              : `Borrador, generada al cerrar la semana por ${generadoPorNombre} — el folio se asigna al emitir`}
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
          fondoDisponible={fondoDisponible}
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
  fondoDisponible,
  onClose,
}: {
  proyectoId: string;
  estimacionId: string;
  numero: number | null;
  total: number;
  fondoDisponible: number;
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

  // Activada por default cuando hay fondo disponible — normalmente sí se
  // usa (ajuste de sesión, agosto 2026: Administrador/Director decide en
  // este momento, no automático).
  const [aplicarFondo, setAplicarFondo] = useState(fondoDisponible > 0);
  const fondoQueSeAplicara = aplicarFondo ? Math.min(fondoDisponible, total) : 0;
  const pendienteDespues = total - fondoQueSeAplicara;

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
          {numero !== null ? `Emitir estimación ${numero}` : "Emitir estimación"}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Esto congela la estimación por {formatMoney(total)} para siempre — ninguna edición
          posterior de precios ni una reapertura de la semana volverá a modificarla. Cualquier
          corrección después de emitida se maneja aparte.
        </p>

        {fondoDisponible > 0 && (
          <div className="mt-4 rounded-lg border border-[var(--border)] bg-black/[0.02] p-3.5">
            <p className="text-sm text-[var(--foreground)]">
              Fondo disponible: <strong>{formatMoney(fondoDisponible)}</strong>
            </p>
            <label className="mt-2 flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={aplicarFondo}
                onChange={(e) => setAplicarFondo(e.target.checked)}
              />
              Aplicar fondo disponible a esta estimación
            </label>

            <dl className="mt-3 space-y-1 border-t border-[var(--border)] pt-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">Total estimación</dt>
                <dd className="tabular-nums text-[var(--foreground)]">{formatMoney(total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--muted)]">Fondo que se aplicará</dt>
                <dd className="tabular-nums text-[var(--foreground)]">
                  {formatMoney(fondoQueSeAplicara)}
                </dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt className="text-[var(--foreground)]">Pendiente después de aplicar fondo</dt>
                <dd className="tabular-nums text-[var(--foreground)]">
                  {formatMoney(pendienteDespues)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <form action={formAction} className="mt-5 flex items-center gap-3">
          {aplicarFondo && <input type="hidden" name="aplicarFondo" value="on" />}
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
