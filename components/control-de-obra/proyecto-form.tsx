"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/app/(app)/control-de-obra/actions";

const TIPOS = [
  { value: "FORMAL", label: "Obra formal" },
  { value: "MOMENTANEA", label: "Obra momentánea" },
  { value: "OFICINA", label: "Oficina" },
];

type ValoresProyecto = {
  nombre: string;
  tipo: string;
  cliente: string | null;
  ubicacion: string | null;
  numeroContrato: string | null;
  descripcion: string | null;
  notas: string | null;
  fechaInicio: string | null;
  fechaEstimadaTermino: string | null;
};

export function ProyectoForm({
  action,
  valoresIniciales,
  textoBoton,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  valoresIniciales?: ValoresProyecto;
  textoBoton: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <Campo
        label="Nombre"
        name="nombre"
        required
        defaultValue={valoresIniciales?.nombre}
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
          Tipo
        </label>
        <select
          name="tipo"
          defaultValue={valoresIniciales?.tipo ?? "FORMAL"}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <Campo
        label="Cliente"
        name="cliente"
        defaultValue={valoresIniciales?.cliente ?? undefined}
      />
      <Campo
        label="Ubicación"
        name="ubicacion"
        defaultValue={valoresIniciales?.ubicacion ?? undefined}
      />
      <Campo
        label="Número de contrato"
        name="numeroContrato"
        defaultValue={valoresIniciales?.numeroContrato ?? undefined}
      />

      <div className="grid grid-cols-2 gap-4">
        <Campo
          label="Fecha de inicio"
          name="fechaInicio"
          type="date"
          defaultValue={valoresIniciales?.fechaInicio ?? undefined}
        />
        <Campo
          label="Fecha estimada de término"
          name="fechaEstimadaTermino"
          type="date"
          defaultValue={valoresIniciales?.fechaEstimadaTermino ?? undefined}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
          Descripción
        </label>
        <textarea
          name="descripcion"
          rows={3}
          defaultValue={valoresIniciales?.descripcion ?? undefined}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
          Notas
        </label>
        <textarea
          name="notas"
          rows={2}
          defaultValue={valoresIniciales?.notas ?? undefined}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        />
      </div>

      {state?.error && (
        <p className="enter rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : textoBoton}
      </Button>
    </form>
  );
}

function Campo({
  label,
  name,
  defaultValue,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <Input name={name} defaultValue={defaultValue} required={required} type={type} />
    </div>
  );
}
