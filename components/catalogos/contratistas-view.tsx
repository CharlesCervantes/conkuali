"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  crearContratistaAction,
  editarContratistaAction,
  cambiarEstatusBeneficiarioAction,
  type CatalogoFormState,
} from "@/app/(app)/catalogos/actions";
import type { FilaContratistaCatalogo } from "@/lib/server/catalogos";

// Solo identidad compartida (nombre, activo) y en cuántas obras participa.
// Concepto/monto contratado/avance/ContratoContratista siguen viviendo
// exclusivamente dentro de cada obra (Control de Obra → Contratistas) — no
// se duplican aquí.
export function ContratistasCatalogoView({
  contratistas,
}: {
  contratistas: FilaContratistaCatalogo[];
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  return (
    <div className="space-y-3">
      {contratistas.length === 0 && !creando && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay contratistas en el catálogo.
        </Card>
      )}

      {contratistas.map((c) => (
        <Card key={c.id} className="p-5">
          {editando === c.id ? (
            <FormularioContratista
              contratista={c}
              onGuardado={() => setEditando(null)}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-[var(--foreground)]">{c.nombre}</h3>
                  {!c.activo && (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {c.proyectosActivos === 0
                    ? "Sin obras asignadas todavía"
                    : `Participa en ${c.proyectosActivos} obra${c.proyectosActivos === 1 ? "" : "s"} activa${c.proyectosActivos === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditando(c.id)}
                  className="text-sm font-medium text-[var(--brand)] hover:underline"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => cambiarEstatusBeneficiarioAction("contratistas", c.id, !c.activo)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {c.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {creando ? (
        <Card className="enter p-5">
          <FormularioContratista onGuardado={() => setCreando(false)} onCancelar={() => setCreando(false)} />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out hover:bg-black/[0.03]"
        >
          + Nuevo contratista
        </button>
      )}
    </div>
  );
}

function FormularioContratista({
  contratista,
  onGuardado,
  onCancelar,
}: {
  contratista?: FilaContratistaCatalogo;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const action = contratista
    ? editarContratistaAction.bind(null, contratista.id)
    : crearContratistaAction;
  const [state, formAction, pending] = useActionState<CatalogoFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onGuardado();
  }

  return (
    <form action={formAction} className="space-y-3">
      <Input name="nombre" placeholder="Nombre del contratista" required defaultValue={contratista?.nombre} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : contratista ? "Guardar cambios" : "Guardar contratista"}
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
