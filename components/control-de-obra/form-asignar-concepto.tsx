"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asignarConceptoAction, type FormState } from "@/app/(app)/control-de-obra/[id]/actions";

export function FormAsignarConcepto({
  contratoId,
  proyectoId,
  conceptos,
}: {
  contratoId: string;
  proyectoId: string;
  conceptos: { id: string; etiqueta: string }[];
}) {
  const action = asignarConceptoAction.bind(null, contratoId, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <select
        name="conceptoId"
        required
        defaultValue=""
        className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      >
        <option value="" disabled>
          Selecciona un concepto
        </option>
        {conceptos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.etiqueta}
          </option>
        ))}
      </select>
      <Input
        name="cantidad"
        required
        type="number"
        step="0.001"
        min="0"
        placeholder="Cantidad"
      />
      <Input
        name="precioUnitarioContratista"
        required
        type="number"
        step="0.01"
        min="0"
        placeholder="P.U. contratista"
      />
      <div className="col-span-2 sm:col-span-1 flex items-center gap-3">
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Asignando…" : "Asignar"}
        </Button>
      </div>
      {state?.error && (
        <p className="col-span-2 sm:col-span-5 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
