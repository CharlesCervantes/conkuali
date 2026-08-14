"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { asignarConceptoAction, type FormState } from "@/app/(app)/control-de-obra/[id]/actions";

export function FormAsignarConcepto({
  contratoId,
  proyectoId,
  conceptosPorPartida,
}: {
  contratoId: string;
  proyectoId: string;
  conceptosPorPartida: { partidaNombre: string; conceptos: { id: string; etiqueta: string }[] }[];
}) {
  const action = asignarConceptoAction.bind(null, contratoId, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <select
        name="conceptoId"
        required
        defaultValue=""
        className="min-w-[260px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      >
        <option value="" disabled>
          Selecciona un concepto disponible
        </option>
        {conceptosPorPartida.map((grupo) => (
          <optgroup key={grupo.partidaNombre} label={grupo.partidaNombre}>
            {grupo.conceptos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Button type="submit" disabled={pending} className="shrink-0">
        {pending ? "Asignando…" : "Asignar"}
      </Button>
      {state?.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
