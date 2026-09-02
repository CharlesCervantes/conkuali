"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearContratoAction, type FormState } from "@/app/(proyecto)/control-de-obra/[id]/actions";

export function FormNuevoContrato({
  proyectoId,
  contratistas,
}: {
  proyectoId: string;
  contratistas: { id: string; nombre: string; contratista: { descripcion: string | null } | null }[];
}) {
  const action = crearContratoAction.bind(null, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  // Al elegir un contratista existente, la Descripción se precarga con su
  // especialidad general del catálogo (Contratista.descripcion) — sigue
  // siendo editable aquí, para ESTE contrato en particular, sin tocar el
  // catálogo (Catálogos: Contratistas, agosto 2026).
  const [descripcion, setDescripcion] = useState("");

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
            onChange={(e) => {
              const seleccionado = contratistas.find((c) => c.id === e.target.value);
              setDescripcion(seleccionado?.contratista?.descripcion ?? "");
            }}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input name="numeroContrato" placeholder="N° de contrato (opcional)" />
        <Input
          name="descripcion"
          placeholder="Descripción (ej. Obra Civil)"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
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
