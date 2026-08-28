"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  crearPersonalAction,
  editarPersonalAction,
  cambiarEstatusBeneficiarioAction,
  type CatalogoFormState,
} from "@/app/(app)/catalogos/actions";
import type { FilaPersonalAdministrativo } from "@/lib/server/catalogos";
import { ModalEliminarBeneficiario } from "@/components/catalogos/modal-eliminar-beneficiario";

const ROL_LABEL: Record<string, string> = {
  MASTER: "Master",
  DIRECTOR: "Director",
  ADMINISTRADOR: "Administrador",
  SUPERVISOR: "Supervisor",
};

export function PersonalView({
  personal,
  usuariosActivos,
  beneficiariosParaVincular,
  puedeEliminar,
}: {
  personal: FilaPersonalAdministrativo[];
  usuariosActivos: { id: string; nombre: string; rol: string }[];
  beneficiariosParaVincular: { id: string; nombre: string; tipo: string }[];
  puedeEliminar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const personaEliminando = personal.find((p) => p.id === eliminando) ?? null;

  // Un Usuario ya vinculado a OTRO beneficiario no debe ofrecerse en el
  // selector de una fila distinta (la unicidad real la garantiza la base de
  // datos, esto solo evita un intento que de todas formas sería rechazado).
  const vinculadosAOtros = (beneficiarioId: string) =>
    new Set(
      personal
        .filter((p) => p.id !== beneficiarioId && p.usuarioVinculado)
        .map((p) => p.usuarioVinculado!.id)
    );

  return (
    <div className="space-y-3">
      {personal.length === 0 && !creando && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay personal en el catálogo.
        </Card>
      )}

      {personal.map((p) => (
        <Card key={p.id} className="p-5">
          {editando === p.id ? (
            <FormularioPersonal
              persona={p}
              usuariosDisponibles={usuariosActivos.filter((u) => !vinculadosAOtros(p.id).has(u.id))}
              beneficiariosDisponibles={beneficiariosParaVincular.filter((b) => b.id !== p.id)}
              onGuardado={() => setEditando(null)}
              onCancelar={() => setEditando(null)}
            />
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-[var(--foreground)]">{p.nombre}</h3>
                  {!p.activo && (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {p.usuarioVinculado
                    ? `Relacionado con usuario ${p.usuarioVinculado.nombre} (${ROL_LABEL[p.usuarioVinculado.rol] ?? p.usuarioVinculado.rol})`
                    : "Sin usuario relacionado"}
                </p>
                {p.mismaPersonaQue && (
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Misma persona que: <span className="font-medium">{p.mismaPersonaQue.nombre}</span>
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditando(p.id)}
                  className="text-sm font-medium text-[var(--brand)] hover:underline"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => cambiarEstatusBeneficiarioAction("personal", p.id, !p.activo)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {p.activo ? "Desactivar" : "Activar"}
                </button>
                {puedeEliminar && (
                  <button
                    type="button"
                    onClick={() => setEliminando(p.id)}
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

      {personaEliminando && (
        <ModalEliminarBeneficiario
          ruta="personal"
          beneficiarioId={personaEliminando.id}
          nombre={personaEliminando.nombre}
          activo={personaEliminando.activo}
          puedeEliminar={personaEliminando.puedeEliminar}
          motivos={personaEliminando.motivosBloqueoEliminacion}
          onClose={() => setEliminando(null)}
        />
      )}

      {creando ? (
        <Card className="enter p-5">
          <FormularioPersonal
            usuariosDisponibles={usuariosActivos.filter((u) => !vinculadosAOtros("").has(u.id))}
            beneficiariosDisponibles={beneficiariosParaVincular}
            onGuardado={() => setCreando(false)}
            onCancelar={() => setCreando(false)}
          />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out hover:bg-black/[0.03]"
        >
          + Nueva persona
        </button>
      )}
    </div>
  );
}

function FormularioPersonal({
  persona,
  usuariosDisponibles,
  beneficiariosDisponibles,
  onGuardado,
  onCancelar,
}: {
  persona?: FilaPersonalAdministrativo;
  usuariosDisponibles: { id: string; nombre: string; rol: string }[];
  beneficiariosDisponibles: { id: string; nombre: string; tipo: string }[];
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const action = persona ? editarPersonalAction.bind(null, persona.id) : crearPersonalAction;
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input name="nombre" placeholder="Nombre completo" required defaultValue={persona?.nombre} />
        <Input name="nss" placeholder="NSS (opcional)" defaultValue={persona?.nss ?? ""} />
        <Input
          name="fechaNacimiento"
          type="date"
          placeholder="Fecha de nacimiento (opcional)"
          defaultValue={persona?.fechaNacimiento?.slice(0, 10) ?? ""}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Usuario relacionado (opcional)
          </label>
          <select
            name="usuarioVinculadoId"
            defaultValue={persona?.usuarioVinculado?.id ?? ""}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          >
            <option value="">Sin vínculo</option>
            {usuariosDisponibles.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({ROL_LABEL[u.rol] ?? u.rol})
              </option>
            ))}
          </select>
        </div>
        {persona && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              ¿Es la misma persona que... (opcional)
            </label>
            <select
              name="mismaPersonaQueId"
              defaultValue={persona.mismaPersonaQue?.id ?? ""}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            >
              <option value="">No es duplicado de nadie</option>
              {beneficiariosDisponibles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre} ({b.tipo})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : persona ? "Guardar cambios" : "Guardar persona"}
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
