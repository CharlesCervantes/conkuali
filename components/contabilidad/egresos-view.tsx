"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import {
  crearEgresoManualAction,
  editarEgresoManualAction,
  guardarDecoracionEgresoAction,
  cancelarEgresoAction,
  type ContabilidadFormState,
} from "@/app/(app)/contabilidad/actions";
import type { FilaEgreso } from "@/lib/server/contabilidad/egresos";
import type { FilaMedioFinanciero } from "@/lib/server/contabilidad/medios-financieros";
import type { FilaFactura } from "@/lib/server/contabilidad/facturas";

export function EgresosView({
  egresos,
  mediosFinancieros,
  facturasRecibidas,
  proyectosDisponibles,
}: {
  egresos: FilaEgreso[];
  mediosFinancieros: FilaMedioFinanciero[];
  facturasRecibidas: FilaFactura[];
  proyectosDisponibles: { id: string; nombre: string }[];
}) {
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editando, setEditando] = useState<FilaEgreso | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          {egresos.length} egreso{egresos.length === 1 ? "" : "s"} este mes
        </p>
        <Button onClick={() => setModalNuevo(true)}>+ Registrar egreso manual</Button>
      </div>

      {egresos.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay egresos fiscales este mes. Los gastos con &ldquo;Requiere factura&rdquo; activado
          aparecen aquí automáticamente al aprobarse.
        </Card>
      ) : (
        <div className="space-y-2">
          {egresos.map((e) => (
            <Card key={e.egresoId ?? e.gastoObraId} className="enter p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--foreground)]">{e.concepto}</p>
                    {e.estatus === "CANCELADO" && (
                      <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                        Cancelado
                      </span>
                    )}
                    {!e.gastoObraId && (
                      <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                        Manual
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {e.proyectoNombre ?? "—"} · {formatearFecha(new Date(e.fecha))}
                    {e.medioFinancieroNombre && ` · ${e.medioFinancieroNombre}`}
                    {e.facturaUuid && ` · Factura ${e.facturaUuid.slice(0, 8)}…`}
                  </p>
                  {e.notasContables && <p className="mt-1 text-sm text-[var(--muted)]">{e.notasContables}</p>}
                  <button
                    type="button"
                    onClick={() => setEditando(e)}
                    className="mt-2 text-xs font-medium text-[var(--brand)] hover:underline"
                  >
                    {e.facturaId || e.medioFinancieroNombre ? "Editar datos fiscales" : "Agregar datos fiscales"}
                  </button>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">
                  {formatMoney(e.monto)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(modalNuevo || editando) && (
        <ModalEgreso
          egreso={editando}
          mediosFinancieros={mediosFinancieros}
          facturasRecibidas={facturasRecibidas}
          proyectosDisponibles={proyectosDisponibles}
          onClose={() => {
            setModalNuevo(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function ModalEgreso({
  egreso,
  mediosFinancieros,
  facturasRecibidas,
  proyectosDisponibles,
  onClose,
}: {
  egreso: FilaEgreso | null;
  mediosFinancieros: FilaMedioFinanciero[];
  facturasRecibidas: FilaFactura[];
  proyectosDisponibles: { id: string; nombre: string }[];
  onClose: () => void;
}) {
  // 3 modos: nuevo manual, editar manual existente, decorar un gasto fiscal
  // ya existente (solo campos contables — nunca fecha/concepto/monto/
  // proyecto, esos se leen del GastoObra).
  const esDecoracionDeGasto = Boolean(egreso?.gastoObraId);
  const action = esDecoracionDeGasto
    ? guardarDecoracionEgresoAction.bind(null, egreso!.gastoObraId!)
    : egreso?.egresoId
      ? editarEgresoManualAction.bind(null, egreso.egresoId)
      : crearEgresoManualAction;
  const [state, formAction, pending] = useActionState<ContabilidadFormState, FormData>(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {esDecoracionDeGasto ? "Datos fiscales del gasto" : egreso ? "Editar egreso" : "Nuevo egreso manual"}
        </h2>
        {esDecoracionDeGasto && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {egreso!.concepto} · {formatearFecha(new Date(egreso!.fecha))} — monto y concepto vienen de Gastos,
            aquí solo se agrega información fiscal.
          </p>
        )}

        <form action={formAction} className="mt-4 space-y-3">
          {!esDecoracionDeGasto && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="fecha"
                  type="date"
                  required
                  defaultValue={egreso ? egreso.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
                />
                <input
                  name="monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Monto"
                  defaultValue={egreso?.monto ?? ""}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
                />
              </div>
              <input
                name="concepto"
                required
                placeholder="Concepto"
                defaultValue={egreso?.concepto ?? ""}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
              />
              <select
                name="proyectoId"
                defaultValue=""
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
              >
                <option value="">Sin proyecto (Empresa en general)</option>
                {proyectosDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </>
          )}

          <select
            name="medioFinancieroId"
            defaultValue=""
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          >
            <option value="">Medio financiero (opcional)</option>
            {mediosFinancieros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>

          <select
            name="facturaId"
            defaultValue=""
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          >
            <option value="">Sin factura vinculada</option>
            {facturasRecibidas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.razonSocialEmisor} — {formatMoney(f.total)} ({f.uuid.slice(0, 8)}…)
              </option>
            ))}
          </select>

          <textarea
            name="notasContables"
            rows={2}
            placeholder="Notas contables (opcional)"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          />

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
            >
              Cancelar
            </button>
            {egreso?.egresoId && !esDecoracionDeGasto && (
              <button
                type="button"
                onClick={() => {
                  cancelarEgresoAction(egreso.egresoId!);
                  onClose();
                }}
                className="ml-auto text-sm text-red-700 hover:underline"
              >
                Cancelar egreso
              </button>
            )}
            {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}
