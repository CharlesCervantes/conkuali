"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/app/(app)/control-de-obra/actions";

const TIPOS = [
  { value: "FORMAL", label: "Obra formal" },
  { value: "MOMENTANEA", label: "Obra momentánea" },
  { value: "OFICINA", label: "Oficina" },
];

const ESQUEMAS = [
  { value: "", label: "Sin definir" },
  { value: "PRECIO_ALZADO", label: "Precio alzado" },
  { value: "ADMINISTRACION", label: "Administración" },
];

const ESQUEMA_LABEL: Record<string, string> = {
  PRECIO_ALZADO: "Precio alzado",
  ADMINISTRACION: "Administración",
};

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
  esquemaContractual?: string | null;
  porcentajeUtilidadDefault?: string | null;
  porcentajeAdministracionDefault?: string | null;
};

export function ProyectoForm({
  action,
  modo,
  valoresIniciales,
  textoBoton,
  esquemaBloqueado = false,
  requiereConfirmacionEsquema = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  modo: "crear" | "editar";
  valoresIniciales?: ValoresProyecto;
  textoBoton: string;
  // Solo aplica en modo "editar" — el proyecto ya tiene información
  // contractual y ya tenía un esquema definido: no se puede volver a tocar
  // (sección 4 del rediseño, agosto 2026).
  esquemaBloqueado?: boolean;
  // Solo aplica en modo "editar" — el proyecto todavía no tiene esquema pero
  // ya tiene información contractual (ej. Mississippi, Proyecto Prueba 1):
  // asignar uno es la última oportunidad de corregirlo, así que exige
  // confirmación explícita antes de guardar (sección 3 del rediseño).
  requiereConfirmacionEsquema?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );
  const [tipo, setTipo] = useState(valoresIniciales?.tipo ?? "FORMAL");
  const [esquema, setEsquema] = useState(valoresIniciales?.esquemaContractual ?? "");
  const [confirmado, setConfirmado] = useState(false);

  const esquemaEsObligatorio = modo === "crear" && tipo === "FORMAL";
  const mostrarConfirmacion = requiereConfirmacionEsquema && esquema !== "";

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-2">
          <Campo
            label="Nombre"
            name="nombre"
            required
            defaultValue={valoresIniciales?.nombre}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Tipo
          </label>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
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

        <Campo
          label="Fecha de inicio"
          name="fechaInicio"
          type="date"
          defaultValue={valoresIniciales?.fechaInicio ?? undefined}
        />
        <CampoFechaOpcional
          label="Fecha estimada de término"
          name="fechaEstimadaTermino"
          defaultValue={valoresIniciales?.fechaEstimadaTermino ?? null}
        />

        <div className="sm:col-span-2 lg:col-span-3 border-t border-[var(--border)] pt-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Contrato General
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                Esquema contractual
                {esquemaEsObligatorio && <span className="text-red-600"> *</span>}
              </label>

              {esquemaBloqueado ? (
                <>
                  <p className="rounded-lg border border-[var(--border)] bg-black/[0.02] px-3.5 py-2.5 text-sm text-[var(--foreground)]">
                    {ESQUEMA_LABEL[esquema] ?? "Sin definir"}
                  </p>
                  <p className="mt-1.5 text-xs text-[var(--muted)]">
                    El esquema contractual no puede modificarse porque el proyecto
                    ya tiene información contractual registrada.
                  </p>
                  <input type="hidden" name="esquemaContractual" value={esquema} />
                </>
              ) : (
                <select
                  name="esquemaContractual"
                  value={esquema}
                  required={esquemaEsObligatorio}
                  onChange={(e) => {
                    setEsquema(e.target.value);
                    setConfirmado(false);
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
                >
                  {ESQUEMAS.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {!esquemaBloqueado && esquema === "PRECIO_ALZADO" && (
              <Campo
                label="% Utilidad por default"
                name="porcentajeUtilidadDefault"
                type="number"
                defaultValue={valoresIniciales?.porcentajeUtilidadDefault ?? undefined}
              />
            )}
            {!esquemaBloqueado && esquema === "ADMINISTRACION" && (
              <Campo
                label="% Administración por default"
                name="porcentajeAdministracionDefault"
                type="number"
                defaultValue={valoresIniciales?.porcentajeAdministracionDefault ?? undefined}
              />
            )}
          </div>

          {mostrarConfirmacion && (
            <div className="enter mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
              <p className="text-sm text-amber-900">
                Este proyecto ya contiene información contractual. Una vez
                definido el esquema contractual no podrá modificarse de forma
                normal. Verifica que la selección sea correcta antes de
                continuar.
              </p>
              <label className="mt-2.5 flex items-center gap-2 text-sm text-amber-900">
                <input
                  type="checkbox"
                  name="confirmarEsquemaConDatos"
                  required={mostrarConfirmacion}
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                Confirmo que la selección es correcta.
              </label>
            </div>
          )}
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
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

        {modo === "editar" && (
          <div className="sm:col-span-2 lg:col-span-3">
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
        )}
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

// Por default se ve como "Sin definir" (no un input de fecha vacío) — clic
// para capturar una fecha real; un botón aparte regresa a "Sin definir" sin
// que el texto "Sin definir" se guarde nunca (cuando no está definida se
// manda un campo vacío, que ya se convierte a null en el server action).
function CampoFechaOpcional({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string | null;
}) {
  const [definida, setDefinida] = useState(Boolean(defaultValue));
  const [valor, setValor] = useState(defaultValue ?? "");

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      {definida ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            name={name}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => {
              setDefinida(false);
              setValor("");
            }}
            className="shrink-0 text-xs text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)] hover:underline"
          >
            Sin definir
          </button>
        </div>
      ) : (
        <>
          <input type="hidden" name={name} value="" />
          <button
            type="button"
            onClick={() => setDefinida(true)}
            className="w-full rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-left text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:border-[var(--brand)] hover:text-[var(--foreground)]"
          >
            Sin definir
          </button>
        </>
      )}
    </div>
  );
}
