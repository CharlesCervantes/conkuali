"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import {
  registrarAportacionFondoAction,
  type RegistrarAportacionFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type { FilaAportacionFondo } from "@/lib/server/control-de-obra/financiero-cliente";

export function AportacionesFondo({
  proyectoId,
  aportaciones,
  puedeRegistrar,
}: {
  proyectoId: string;
  aportaciones: FilaAportacionFondo[];
  puedeRegistrar: boolean;
}) {
  const [modalAbierto, setModalAbierto] = useState(false);

  return (
    <Card className="enter p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Aportaciones
        </p>
        {puedeRegistrar && (
          <Button onClick={() => setModalAbierto(true)}>+ Registrar aportación</Button>
        )}
      </div>

      {aportaciones.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Todavía no hay aportaciones registradas.</p>
      ) : (
        <div className="mt-3">
          <Table>
            <Thead>
              <Tr>
                <Th>Fecha</Th>
                <Th>Referencia</Th>
                <Th className="text-right">Monto</Th>
                <Th>Registró</Th>
              </Tr>
            </Thead>
            <tbody>
              {aportaciones.map((a) => (
                <Tr key={a.id}>
                  <Td>{formatearFecha(new Date(a.fecha))}</Td>
                  <Td className="text-[var(--muted)]">{a.referencia ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(a.monto)}</Td>
                  <Td className="text-[var(--muted)]">{a.registradoPorNombre}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {modalAbierto && (
        <ModalRegistrarAportacion proyectoId={proyectoId} onClose={() => setModalAbierto(false)} />
      )}
    </Card>
  );
}

function ModalRegistrarAportacion({
  proyectoId,
  onClose,
}: {
  proyectoId: string;
  onClose: () => void;
}) {
  const action = registrarAportacionFondoAction.bind(null, proyectoId);
  const [state, formAction, pending] = useActionState<RegistrarAportacionFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.registrada) onClose();
  }

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  const hoy = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Registrar aportación</h2>

        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Monto
            </label>
            <input
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Fecha
            </label>
            <input
              name="fecha"
              type="date"
              required
              defaultValue={hoy}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Referencia
            </label>
            <input
              name="referencia"
              type="text"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Notas (opcional)
            </label>
            <textarea
              name="notas"
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Registrando…" : "Registrar aportación"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
            >
              Cancelar
            </button>
          </div>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        </form>
      </Card>
    </div>,
    document.body
  );
}
