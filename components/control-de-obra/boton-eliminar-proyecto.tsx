"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import {
  eliminarProyectoAction,
  type EliminarProyectoFormState,
} from "@/app/(app)/control-de-obra/actions";

// Disparador del menú de acciones (⋯) + modal de confirmación. Es su propio
// Client Component porque necesita estado local (abierto/cerrado) — el resto
// de la fila (FilaProyecto en page.tsx) es Server Component.
export function BotonEliminarProyecto({
  proyectoId,
  proyectoNombre,
}: {
  proyectoId: string;
  proyectoNombre: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="block w-full px-3.5 py-2 text-left text-sm text-red-700 transition-colors duration-150 ease-out hover:bg-red-50"
      >
        Eliminar
      </button>
      {abierto && (
        <ModalConfirmarEliminar
          proyectoId={proyectoId}
          proyectoNombre={proyectoNombre}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function ModalConfirmarEliminar({
  proyectoId,
  proyectoNombre,
  onClose,
}: {
  proyectoId: string;
  proyectoNombre: string;
  onClose: () => void;
}) {
  const action = eliminarProyectoAction.bind(null, proyectoId);
  const [state, formAction, pending] = useActionState<EliminarProyectoFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.eliminado) onClose();
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
      <Card className="enter w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Eliminar proyecto</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Vas a eliminar <span className="font-medium text-[var(--foreground)]">{proyectoNombre}</span>.
          Esta acción borra el proyecto y todo lo relacionado (partidas, conceptos,
          contratistas, avances y bitácora) de forma permanente. No se puede deshacer.
        </p>

        <form action={formAction} className="mt-5 flex items-center gap-3">
          {/* Botón propio (no <Button variant="primary">) para evitar mezclar
              su bg-[var(--brand)] con el rojo destructivo — cn() en este
              proyecto no deduplica clases en conflicto. */}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            {pending ? "Eliminando…" : "Sí, eliminar"}
          </button>
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
