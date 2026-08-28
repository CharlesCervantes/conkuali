"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  materializarEstimacionHistoricaAction,
  type MaterializarEstimacionFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";

// Semana cerrada ANTES de que existiera EstimacionCliente (o que por
// cualquier otra razón nunca disparó su generación al cerrar) — no tiene
// snapshot todavía. Esto genera el BORRADOR faltante a partir del avance/
// corte ya existentes de esa semana, sin tocarlos ni reabrir nada. Acción
// explícita (no automática al consultar) para que quede auditada como
// backfill, nunca como si hubiera salido del cierre original.
export function MaterializarEstimacionHistorica({
  proyectoId,
  semanaId,
  numeroSemana,
}: {
  proyectoId: string;
  semanaId: string;
  numeroSemana: number;
}) {
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <Card className="enter p-5">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        Sin estimación generada
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Esta semana se cerró antes de que existiera Estimación Cliente. Puedes generar el borrador
        faltante a partir del avance y el corte ya registrados de esta semana.
      </p>
      <div className="mt-4">
        <Button onClick={() => setModalAbierto(true)}>Generar estimación faltante</Button>
      </div>

      {modalAbierto && (
        <ModalConfirmarMaterializacion
          proyectoId={proyectoId}
          semanaId={semanaId}
          numeroSemana={numeroSemana}
          onClose={() => setModalAbierto(false)}
        />
      )}
    </Card>
  );
}

function ModalConfirmarMaterializacion({
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
  const action = materializarEstimacionHistoricaAction.bind(null, proyectoId, semanaId);
  const [state, formAction, pending] = useActionState<MaterializarEstimacionFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.generada) onClose();
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
          Generar estimación de la semana {numeroSemana}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Se generará en estado Borrador, usando el avance aprobado ya existente de esta semana —
          no modifica cortes, pagos ni avance. Podrás revisarla y emitirla después, como cualquier
          otra estimación.
        </p>

        <form action={formAction} className="mt-5 flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Generando…" : "Sí, generar estimación"}
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
