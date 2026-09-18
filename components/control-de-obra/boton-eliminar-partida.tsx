"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  eliminarPartidaAction,
  type EliminarPartidaFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";

// Solo visible para quien tiene puedeEliminarEstructuraContractual (validado
// por el padre, que decide si renderiza este componente siquiera) — el
// permiso real de todos modos se vuelve a validar en eliminarPartida,
// server-side (Eliminar Partidas/Conceptos, septiembre 2026).
export function BotonEliminarPartida({
  proyectoId,
  partidaId,
  nombre,
  conceptosActivos,
}: {
  proyectoId: string;
  partidaId: string;
  nombre: string;
  conceptosActivos: number;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // La partida entera está dentro de un <summary> (abre/cierra el
          // <details>) — sin esto, el clic también expandiría/colapsaría la
          // tarjeta al querer eliminar.
          e.preventDefault();
          e.stopPropagation();
          setAbierto(true);
        }}
        title="Eliminar partida"
        className="rounded-md p-1.5 text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 className="h-4 w-4" strokeWidth={2} />
      </button>
      {abierto && (
        <ModalEliminarPartida
          proyectoId={proyectoId}
          partidaId={partidaId}
          nombre={nombre}
          conceptosActivos={conceptosActivos}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function ModalEliminarPartida({
  proyectoId,
  partidaId,
  nombre,
  conceptosActivos,
  onClose,
}: {
  proyectoId: string;
  partidaId: string;
  nombre: string;
  conceptosActivos: number;
  onClose: () => void;
}) {
  const action = eliminarPartidaAction.bind(null, partidaId, proyectoId);
  const [state, formAction, pending] = useActionState<EliminarPartidaFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.resultado) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Eliminar partida</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {conceptosActivos > 0
            ? `"${nombre}" tiene ${conceptosActivos} concepto${conceptosActivos === 1 ? "" : "s"} activo${conceptosActivos === 1 ? "" : "s"} — también se eliminarán o cancelarán (según si tienen historial). `
            : `"${nombre}" no tiene conceptos activos. `}
          Si no tiene historial, se elimina por completo; si sí lo tiene, queda cancelada. Esta acción no se puede deshacer.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Motivo</label>
            <textarea
              name="motivo"
              rows={2}
              required
              minLength={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar partida"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
            >
              Cerrar
            </button>
          </div>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        </form>
      </Card>
    </div>,
    document.body
  );
}
