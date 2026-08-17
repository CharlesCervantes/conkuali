"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import {
  reabrirSemanaAction,
  type ReabrirSemanaFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type { ResumenCierreSemana } from "@/lib/server/control-de-obra/cierre-semana";

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Bloque al final de Avance de obra — semana cerrada: resumen posterior al
// cierre (conceptos ejecutados, contratistas, monto generado, desglose por
// contratista) + acción de reabrir (con motivo obligatorio).
export function CierreSemanaCerrada({
  proyectoId,
  semanaId,
  numeroSemana,
  resumen,
  puedeReabrir,
}: {
  proyectoId: string;
  semanaId: string;
  numeroSemana: number;
  resumen: ResumenCierreSemana;
  puedeReabrir: boolean;
}) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const cortesActivos = resumen.cortes.filter((c) => c.estatus === "GENERADO");
  const totalGenerado = cortesActivos.reduce((total, c) => total + c.montoNeto, 0);

  return (
    <Card className="enter p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Cierre de semana
          </p>
          <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">
            Semana {numeroSemana} cerrada
          </h3>
        </div>
        {puedeReabrir && (
          <Button
            variant="outline"
            className="shrink-0 px-3 py-1.5 text-xs"
            onClick={() => setModalAbierto(true)}
          >
            Reabrir semana
          </Button>
        )}
      </div>

      <p className="mt-3 text-sm text-[var(--muted)]">
        {resumen.avancesAprobados} concepto{resumen.avancesAprobados === 1 ? "" : "s"} ejecutado
        {resumen.avancesAprobados === 1 ? "" : "s"} · {cortesActivos.length} contratista
        {cortesActivos.length === 1 ? "" : "s"} ·{" "}
        <span className="font-medium text-[var(--foreground)]">{formatMoney(totalGenerado)}</span>{" "}
        generado para pago
      </p>

      {cortesActivos.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
          {cortesActivos.map((c) => (
            <li key={c.beneficiarioProyectoId} className="flex justify-between text-sm">
              <span className="text-[var(--foreground)]">{c.nombreContratista}</span>
              <span className="font-medium tabular-nums text-[var(--foreground)]">
                {formatMoney(c.montoNeto)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {resumen.cerradoPorNombre && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          Cerrada por {resumen.cerradoPorNombre}
          {resumen.cerradoEn ? ` · ${formatFecha(resumen.cerradoEn)}` : ""}
        </p>
      )}

      {modalAbierto && (
        <ModalReabrir
          proyectoId={proyectoId}
          semanaId={semanaId}
          numeroSemana={numeroSemana}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </Card>
  );
}

function ModalReabrir({
  proyectoId,
  semanaId,
  numeroSemana,
  onClose,
}: {
  proyectoId: string;
  semanaId: string;
  numeroSemana: number;
  onClose: () => void;
}) {
  const action = reabrirSemanaAction.bind(null, proyectoId, semanaId);
  const [state, formAction, pending] = useActionState<ReabrirSemanaFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.reabierta) onClose();
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
          Reabrir semana {numeroSemana}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Vuelve a permitir capturar avance esta semana. Los cortes y movimientos ya generados no
          se pierden — si algún contratista ya está liquidado, sus conceptos quedan protegidos y
          no podrán modificarse.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              Motivo de la reapertura
            </label>
            <textarea
              name="motivo"
              required
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Reabriendo…" : "Reabrir semana"}
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
