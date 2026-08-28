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
import { ModalEliminarBeneficiario } from "@/components/catalogos/modal-eliminar-beneficiario";

// Solo identidad compartida (nombre, activo) y en cuántas obras participa.
// Concepto/monto contratado/avance/ContratoContratista siguen viviendo
// exclusivamente dentro de cada obra (Control de Obra → Contratistas) — no
// se duplican aquí.
export function ContratistasCatalogoView({
  contratistas,
  beneficiariosParaVincular,
  puedeEliminar,
}: {
  contratistas: FilaContratistaCatalogo[];
  beneficiariosParaVincular: { id: string; nombre: string; tipo: string }[];
  puedeEliminar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const contratistaEliminando = contratistas.find((c) => c.id === eliminando) ?? null;

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
              beneficiariosDisponibles={beneficiariosParaVincular.filter((b) => b.id !== c.id)}
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
                {c.descripcion && (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">{c.descripcion}</p>
                )}
                {c.mismaPersonaQue && (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Misma persona que: <span className="font-medium">{c.mismaPersonaQue.nombre}</span>
                  </p>
                )}
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
                {puedeEliminar && (
                  <button
                    type="button"
                    onClick={() => setEliminando(c.id)}
                    className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>
      ))}

      {contratistaEliminando && (
        <ModalEliminarBeneficiario
          ruta="contratistas"
          beneficiarioId={contratistaEliminando.id}
          nombre={contratistaEliminando.nombre}
          activo={contratistaEliminando.activo}
          puedeEliminar={contratistaEliminando.puedeEliminar}
          motivos={contratistaEliminando.motivosBloqueoEliminacion}
          onClose={() => setEliminando(null)}
        />
      )}

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
  beneficiariosDisponibles,
  onGuardado,
  onCancelar,
}: {
  contratista?: FilaContratistaCatalogo;
  beneficiariosDisponibles?: { id: string; nombre: string; tipo: string }[];
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
      <Input
        name="descripcion"
        placeholder="Especialidad (ej. Obra civil, Herrería)"
        defaultValue={contratista?.descripcion ?? ""}
      />
      {contratista && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            ¿Es la misma persona que... (opcional)
          </label>
          <select
            name="mismaPersonaQueId"
            defaultValue={contratista.mismaPersonaQue?.id ?? ""}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          >
            <option value="">No es duplicado de nadie</option>
            {(beneficiariosDisponibles ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre} ({b.tipo})
              </option>
            ))}
          </select>
        </div>
      )}
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
