"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  crearMedioFinancieroAction,
  editarMedioFinancieroAction,
  cambiarEstatusMedioFinancieroAction,
  type ContabilidadFormState,
} from "@/app/(app)/contabilidad/actions";
import type { FilaMedioFinanciero } from "@/lib/server/contabilidad/medios-financieros";

const TIPO_LABEL: Record<string, string> = {
  BANCO: "Banco",
  TARJETA: "Tarjeta",
  EFECTIVO: "Efectivo",
};

export function MediosFinancierosView({ medios }: { medios: FilaMedioFinanciero[] }) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<FilaMedioFinanciero | null>(null);

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-[var(--border)] p-0">
        {medios.length === 0 ? (
          <p className="p-5 text-sm text-[var(--muted)]">Todavía no hay cuentas/medios configurados.</p>
        ) : (
          medios.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">{m.nombre}</p>
                  {!m.activo && (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">{TIPO_LABEL[m.tipo] ?? m.tipo}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditando(m)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => cambiarEstatusMedioFinancieroAction(m.id, !m.activo)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {m.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      {creando || editando ? (
        <Card className="enter p-5">
          <FormularioMedioFinanciero
            medio={editando}
            onCancelar={() => {
              setCreando(false);
              setEditando(null);
            }}
          />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out hover:bg-black/[0.03]"
        >
          + Nueva cuenta / medio
        </button>
      )}
    </div>
  );
}

function FormularioMedioFinanciero({
  medio,
  onCancelar,
}: {
  medio: FilaMedioFinanciero | null;
  onCancelar: () => void;
}) {
  const action = medio ? editarMedioFinancieroAction.bind(null, medio.id) : crearMedioFinancieroAction;
  const [state, formAction, pending] = useActionState<ContabilidadFormState, FormData>(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onCancelar();
  }

  return (
    <form action={formAction} className="space-y-3">
      <input
        name="nombre"
        placeholder="Nombre (ej. BBVA — Cuenta fiscal)"
        required
        defaultValue={medio?.nombre ?? ""}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      />
      <select
        name="tipo"
        required
        defaultValue={medio?.tipo ?? ""}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      >
        <option value="" disabled>
          Tipo…
        </option>
        <option value="BANCO">Banco</option>
        <option value="TARJETA">Tarjeta</option>
        <option value="EFECTIVO">Efectivo</option>
      </select>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : medio ? "Guardar cambios" : "Crear"}
        </Button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
        >
          Cancelar
        </button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
