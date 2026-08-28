"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  configurarIvaEstimacionAction,
  type ConfigurarIvaFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";

// Solo visible mientras la estimación sigue BORRADOR — parte de "preparar"
// la estimación, antes de emitir (sección 7 del rediseño de Estimación
// semanal, agosto 2026). IVA no es una propiedad fija del proyecto: cada
// estimación decide si aplica y a qué porcentaje.
//
// Dos estados claros y separados (nunca un solo checkbox genérico): con IVA
// ya guardado, la acción visible es "Quitar IVA" (un clic, sin formulario);
// sin IVA, la acción visible es "Aplicar IVA" (abre el formulario del %).
// Después de guardar, el estado mostrado siempre es el que quedó en el
// servidor — nunca el valor que el usuario venía tecleando (corrección de
// sesión, agosto 2026).
export function ConfigurarIvaEstimacion({
  proyectoId,
  estimacionId,
  aplicaIVA,
  porcentajeIVA,
}: {
  proyectoId: string;
  estimacionId: string;
  aplicaIVA: boolean;
  porcentajeIVA: number | null;
}) {
  const action = configurarIvaEstimacionAction.bind(null, proyectoId, estimacionId);
  const [state, formAction, pending] = useActionState<ConfigurarIvaFormState, FormData>(
    action,
    undefined
  );
  const [editando, setEditando] = useState(false);

  // En cuanto el servidor confirma el guardado, se cierra el formulario y se
  // vuelve a la vista de estado — que ya refleja el nuevo aplicaIVA/
  // porcentajeIVA porque vienen como props frescas del Server Component
  // padre (revalidatePath ya corrió). Mismo patrón "derivar durante el
  // render" que ya usa emitir-estimacion.tsx, en vez de useEffect.
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) setEditando(false);
  }

  return (
    <Card className="enter p-5">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">IVA</p>

      {!editando ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {aplicaIVA ? (
            <>
              <span className="text-sm text-[var(--foreground)]">
                IVA aplicado ·{" "}
                <span className="font-semibold tabular-nums">{porcentajeIVA ?? 16}%</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="text-sm font-medium text-[var(--brand)] hover:underline"
                >
                  Cambiar porcentaje
                </button>
                <form action={formAction}>
                  {/* Sin campo aplicaIVA -> la acción lo interpreta como false */}
                  <button
                    type="submit"
                    disabled={pending}
                    className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                  >
                    {pending ? "Quitando…" : "Quitar IVA"}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <span className="text-sm text-[var(--muted)]">Sin IVA</span>
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="text-sm font-medium text-[var(--brand)] hover:underline"
              >
                Aplicar IVA
              </button>
            </>
          )}
        </div>
      ) : (
        <form action={formAction} className="mt-3 flex flex-wrap items-center gap-4">
          <input type="hidden" name="aplicaIVA" value="on" />
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            Porcentaje
            <input
              name="porcentajeIVA"
              type="number"
              step="0.01"
              min="0"
              defaultValue={porcentajeIVA ?? 16}
              autoFocus
              className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
            %
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
          >
            Cancelar
          </button>
        </form>
      )}

      {state?.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
    </Card>
  );
}
