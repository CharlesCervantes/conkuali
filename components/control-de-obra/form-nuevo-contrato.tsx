"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearContratoAction, type FormState } from "@/app/(app)/control-de-obra/[id]/actions";

export function FormNuevoContrato({
  proyectoId,
  contratistas,
}: {
  proyectoId: string;
  contratistas: { id: string; nombre: string }[];
}) {
  const action = crearContratoAction.bind(null, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Contratista existente
          </label>
          <select
            name="beneficiarioId"
            defaultValue=""
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          >
            <option value="">— Nuevo contratista (usa el campo de al lado) —</option>
            {contratistas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            O nombre de contratista nuevo
          </label>
          <Input name="nombreNuevoContratista" placeholder="Ej. Juan Pérez" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input name="numeroContrato" placeholder="N° de contrato (opcional)" />
        <Input name="descripcion" placeholder="Descripción (ej. Obra Civil)" />
        <Input name="fecha" type="date" />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "+ Nuevo contrato"}
        </Button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
