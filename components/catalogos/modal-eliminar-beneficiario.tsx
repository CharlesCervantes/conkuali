"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import {
  eliminarBeneficiarioAction,
  cambiarEstatusBeneficiarioAction,
  type EliminarBeneficiarioFormState,
} from "@/app/(app)/catalogos/actions";

type Ruta = "proveedores" | "contratistas" | "personal";

// Un solo modal reutilizado por las tres vistas de Catálogos — mismo patrón
// de portal/backdrop/Escape que BotonEliminarProyecto. Rama según lo que ya
// trae la fila (puedeEliminar/motivos, ya evaluado server-side en el
// listar*): si tiene historial, nunca se ofrece un botón destructivo — solo
// la explicación y, si aplica, Desactivar (eliminación en Catálogos, agosto
// 2026).
export function ModalEliminarBeneficiario({
  ruta,
  beneficiarioId,
  nombre,
  activo,
  puedeEliminar,
  motivos,
  onClose,
}: {
  ruta: Ruta;
  beneficiarioId: string;
  nombre: string;
  activo: boolean;
  puedeEliminar: boolean;
  motivos: string[];
  onClose: () => void;
}) {
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
        {puedeEliminar ? (
          <ContenidoEliminar ruta={ruta} beneficiarioId={beneficiarioId} nombre={nombre} onClose={onClose} />
        ) : (
          <ContenidoBloqueado
            ruta={ruta}
            beneficiarioId={beneficiarioId}
            nombre={nombre}
            activo={activo}
            motivos={motivos}
            onClose={onClose}
          />
        )}
      </Card>
    </div>,
    document.body
  );
}

function ContenidoEliminar({
  ruta,
  beneficiarioId,
  nombre,
  onClose,
}: {
  ruta: Ruta;
  beneficiarioId: string;
  nombre: string;
  onClose: () => void;
}) {
  const action = eliminarBeneficiarioAction.bind(null, ruta, beneficiarioId);
  const [state, formAction, pending] = useActionState<EliminarBeneficiarioFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.eliminado) onClose();
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-[var(--foreground)]">
        ¿Eliminar definitivamente a &ldquo;{nombre}&rdquo;?
      </h2>
      <p className="mt-2 text-sm text-[var(--muted)]">Esta acción no se puede deshacer.</p>

      <form action={formAction} className="mt-5 flex items-center gap-3">
        {/* Botón propio (no <Button variant="primary">) para evitar mezclar
            su bg-[var(--brand)] con el rojo destructivo — cn() en este
            proyecto no deduplica clases en conflicto. */}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,background-color] duration-150 ease-out hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
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
    </>
  );
}

function ContenidoBloqueado({
  ruta,
  beneficiarioId,
  nombre,
  activo,
  motivos,
  onClose,
}: {
  ruta: Ruta;
  beneficiarioId: string;
  nombre: string;
  activo: boolean;
  motivos: string[];
  onClose: () => void;
}) {
  const [desactivando, setDesactivando] = useState(false);

  return (
    <>
      <h2 className="text-lg font-semibold text-[var(--foreground)]">No se puede eliminar</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        &ldquo;{nombre}&rdquo; tiene historial{motivos.length > 0 ? `: ${motivos.join(", ")}` : "."}. Puedes
        desactivarlo para que deje de aparecer en nuevas operaciones.
      </p>

      <div className="mt-5 flex items-center gap-3">
        {activo && (
          <button
            type="button"
            disabled={desactivando}
            onClick={async () => {
              setDesactivando(true);
              await cambiarEstatusBeneficiarioAction(ruta, beneficiarioId, false);
              onClose();
            }}
            className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-50"
          >
            {desactivando ? "Desactivando…" : "Desactivar"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
        >
          Cerrar
        </button>
      </div>
    </>
  );
}
