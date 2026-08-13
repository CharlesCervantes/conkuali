"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearPartidaAction, type FormState } from "@/app/(app)/control-de-obra/[id]/actions";

export function FormNuevaPartida({ proyectoId }: { proyectoId: string }) {
  const action = crearPartidaAction.bind(null, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="flex items-end gap-3">
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
          Nombre de la partida
        </label>
        <Input name="nombre" required placeholder="Ej. Obra Civil" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Agregando…" : "+ Agregar partida"}
      </Button>
      {state?.error && (
        <p className="text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
