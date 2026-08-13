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
    <form action={formAction} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Input name="codigo" placeholder="Código (opcional)" />
      <Input
        name="descripcion"
        required
        placeholder="Descripción"
        className="col-span-2"
      />
      <Input name="unidad" required placeholder="Unidad (m², ml…)" />
      <Input
        name="cantidadContratada"
        required
        type="number"
        step="0.001"
        min="0"
        placeholder="Cantidad"
      />
      <div className="col-span-2 sm:col-span-5 flex items-center gap-3">
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Agregando…" : "+ Agregar concepto"}
        </Button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
