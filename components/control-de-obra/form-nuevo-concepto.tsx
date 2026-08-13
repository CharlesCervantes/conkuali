"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearConceptoAction, type FormState } from "@/app/(app)/control-de-obra/[id]/actions";

export function FormNuevoConcepto({
  partidaId,
  proyectoId,
}: {
  partidaId: string;
  proyectoId: string;
}) {
  const action = crearConceptoAction.bind(null, partidaId, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
      <Input name="descripcion" required placeholder="Descripción" />
      <Input name="unidad" required placeholder="Unidad (m², ml…)" />
      <Input
        name="cantidadContratada"
        required
        type="number"
        step="0.001"
        min="0"
        placeholder="Cantidad total"
      />
      <div className="sm:col-span-3 flex items-center gap-3">
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Guardando…" : "Guardar concepto"}
        </Button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
