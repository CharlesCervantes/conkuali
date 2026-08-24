"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  crearProveedorAction,
  editarProveedorAction,
  cambiarEstatusBeneficiarioAction,
  type CatalogoFormState,
} from "@/app/(app)/catalogos/actions";
import type { FilaProveedorCatalogo } from "@/lib/server/catalogos";

export function ProveedoresView({ proveedores }: { proveedores: FilaProveedorCatalogo[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  return (
    <div className="space-y-3">
      {proveedores.length === 0 && !creando && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay proveedores en el catálogo.
        </Card>
      )}

      {proveedores.map((p) => (
        <Card key={p.id} className="p-5">
          {editando === p.id ? (
            <FormularioProveedor
              proveedor={p}
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
                  {[p.giro, p.vendedor, p.telefono, p.rfc && `RFC ${p.rfc}`]
                    .filter(Boolean)
                    .join(" · ") || "Sin información adicional"}
                </p>
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
                  onClick={() => cambiarEstatusBeneficiarioAction("proveedores", p.id, !p.activo)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {p.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {creando ? (
        <Card className="enter p-5">
          <FormularioProveedor onGuardado={() => setCreando(false)} onCancelar={() => setCreando(false)} />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out hover:bg-black/[0.03]"
        >
          + Nuevo proveedor
        </button>
      )}
    </div>
  );
}

function FormularioProveedor({
  proveedor,
  onGuardado,
  onCancelar,
}: {
  proveedor?: FilaProveedorCatalogo;
  onGuardado: () => void;
  onCancelar: () => void;
}) {
  const action = proveedor
    ? editarProveedorAction.bind(null, proveedor.id)
    : crearProveedorAction;
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
        <Input name="nombre" placeholder="Nombre / razón social" required defaultValue={proveedor?.nombre} />
        <Input name="giro" placeholder="Giro (opcional)" defaultValue={proveedor?.giro ?? ""} />
        <Input name="vendedor" placeholder="Vendedor / contacto (opcional)" defaultValue={proveedor?.vendedor ?? ""} />
        <Input name="telefono" placeholder="Teléfono (opcional)" defaultValue={proveedor?.telefono ?? ""} />
        <Input name="credito" placeholder="Crédito (opcional, informativo)" defaultValue={proveedor?.credito ?? ""} />
        <Input name="cuentaBancaria" placeholder="Cuenta bancaria (opcional, informativo)" defaultValue={proveedor?.cuentaBancaria ?? ""} />
        <Input name="rfc" placeholder="RFC (opcional)" defaultValue={proveedor?.rfc ?? ""} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : proveedor ? "Guardar cambios" : "Guardar proveedor"}
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
