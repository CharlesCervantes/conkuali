"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import { CamposFiscalesCobro } from "@/components/control-de-obra/campos-fiscales-cobro";
import {
  registrarAportacionFondoAction,
  editarAportacionFondoAction,
  editarMontoAportacionFondoAction,
  cancelarMovimientoFinancieroClienteAction,
  type RegistrarAportacionFormState,
  type EditarMovimientoFormState,
  type CancelarMovimientoFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";
import type { FilaAportacionFondo } from "@/lib/server/control-de-obra/financiero-cliente";
import type { FilaMedioFinanciero } from "@/lib/server/contabilidad/medios-financieros";

export function AportacionesFondo({
  proyectoId,
  aportaciones,
  puedeRegistrar,
  mediosFinancieros,
}: {
  proyectoId: string;
  aportaciones: FilaAportacionFondo[];
  puedeRegistrar: boolean;
  mediosFinancieros: FilaMedioFinanciero[];
}) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editarId, setEditarId] = useState<string | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const filaEditar = aportaciones.find((a) => a.id === editarId) ?? null;

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
                <Th>Estatus</Th>
                {puedeRegistrar && <Th />}
              </Tr>
            </Thead>
            <tbody>
              {aportaciones.map((a) => (
                <Tr key={a.id}>
                  <Td>{formatearFecha(new Date(a.fecha))}</Td>
                  <Td className="text-[var(--muted)]">{a.referencia ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(a.monto)}</Td>
                  <Td className="text-[var(--muted)]">{a.registradoPorNombre}</Td>
                  <Td>
                    {a.estatus === "CANCELADO" ? (
                      <span
                        className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700"
                        title={a.motivoCancelacion ?? undefined}
                      >
                        Cancelada
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        Vigente
                      </span>
                    )}
                  </Td>
                  {puedeRegistrar && (
                    <Td>
                      {a.estatus === "VIGENTE" && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditarId(a.id)}
                            className="text-xs font-medium text-[var(--brand)] hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelarId(a.id)}
                            className="text-xs font-medium text-red-700 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {modalAbierto && (
        <ModalRegistrarAportacion
          proyectoId={proyectoId}
          mediosFinancieros={mediosFinancieros}
          onClose={() => setModalAbierto(false)}
        />
      )}

      {filaEditar && (
        <ModalEditarAportacion
          proyectoId={proyectoId}
          aportacion={filaEditar}
          mediosFinancieros={mediosFinancieros}
          onClose={() => setEditarId(null)}
        />
      )}

      {cancelarId && (
        <ModalCancelarAportacion
          proyectoId={proyectoId}
          movimientoId={cancelarId}
          onClose={() => setCancelarId(null)}
        />
      )}
    </Card>
  );
}

function ModalRegistrarAportacion({
  proyectoId,
  mediosFinancieros,
  onClose,
}: {
  proyectoId: string;
  mediosFinancieros: FilaMedioFinanciero[];
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
        <p className="mt-1 text-sm text-[var(--muted)]">
          Este es el momento en que el dinero real entra a la Empresa — captura aquí la cuenta receptora y el
          comprobante si ya los tienes.
        </p>

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

          <CamposFiscalesCobro mediosFinancieros={mediosFinancieros} />

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

function ModalEditarAportacion({
  proyectoId,
  aportacion,
  mediosFinancieros,
  onClose,
}: {
  proyectoId: string;
  aportacion: FilaAportacionFondo;
  mediosFinancieros: FilaMedioFinanciero[];
  onClose: () => void;
}) {
  const accionDatos = editarAportacionFondoAction.bind(null, proyectoId, aportacion.id);
  const [estadoDatos, formActionDatos, pendingDatos] = useActionState<EditarMovimientoFormState, FormData>(
    accionDatos,
    undefined
  );
  const [estadoDatosAnterior, setEstadoDatosAnterior] = useState(estadoDatos);
  if (estadoDatos !== estadoDatosAnterior) {
    setEstadoDatosAnterior(estadoDatos);
    if (estadoDatos?.guardado) onClose();
  }

  const accionMonto = editarMontoAportacionFondoAction.bind(null, proyectoId, aportacion.id);
  const [estadoMonto, formActionMonto, pendingMonto] = useActionState<EditarMovimientoFormState, FormData>(
    accionMonto,
    undefined
  );
  const [estadoMontoAnterior, setEstadoMontoAnterior] = useState(estadoMonto);
  if (estadoMonto !== estadoMontoAnterior) {
    setEstadoMontoAnterior(estadoMonto);
    if (estadoMonto?.guardado) onClose();
  }

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Editar aportación</h2>

        <form action={formActionMonto} className="mt-4 flex items-end gap-2 border-b border-[var(--border)] pb-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Monto</label>
            <input
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={aportacion.monto}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <Button type="submit" disabled={pendingMonto}>
            {pendingMonto ? "Guardando…" : "Guardar monto"}
          </Button>
        </form>
        {estadoMonto?.error && <p className="mt-1 text-sm text-red-700">{estadoMonto.error}</p>}

        <form action={formActionDatos} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Fecha</label>
            <input
              name="fecha"
              type="date"
              defaultValue={aportacion.fecha.slice(0, 10)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Referencia</label>
            <input
              name="referencia"
              type="text"
              defaultValue={aportacion.referencia ?? ""}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Notas</label>
            <textarea
              name="notas"
              rows={2}
              defaultValue={aportacion.notas ?? ""}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>

          <CamposFiscalesCobro mediosFinancieros={mediosFinancieros} />

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pendingDatos}>
              {pendingDatos ? "Guardando…" : "Guardar cambios"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
            >
              Cerrar
            </button>
          </div>
          {estadoDatos?.error && <p className="text-sm text-red-700">{estadoDatos.error}</p>}
        </form>
      </Card>
    </div>,
    document.body
  );
}

function ModalCancelarAportacion({
  proyectoId,
  movimientoId,
  onClose,
}: {
  proyectoId: string;
  movimientoId: string;
  onClose: () => void;
}) {
  const action = cancelarMovimientoFinancieroClienteAction.bind(null, proyectoId, movimientoId);
  const [state, formAction, pending] = useActionState<CancelarMovimientoFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.cancelado) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Cancelar aportación</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Esta acción no se puede deshacer. Se bloqueará si esta aportación ya tiene aplicaciones de fondo hechas
          contra ella.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Motivo</label>
            <textarea
              name="motivo"
              rows={2}
              required
              minLength={3}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Cancelando…" : "Cancelar aportación"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
            >
              Cerrar
            </button>
          </div>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        </form>
      </Card>
    </div>,
    document.body
  );
}
