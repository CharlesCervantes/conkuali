"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import {
  registrarPagoEstimacionAction,
  aplicarFondoEstimacionAction,
  type RegistrarPagoFormState,
  type AplicarFondoFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type {
  FilaHistorialEstimacion,
  EstadoPagoEstimacion,
} from "@/lib/server/control-de-obra/financiero-cliente";

const ESTADO_ESTILO: Record<EstadoPagoEstimacion, string> = {
  PENDIENTE: "bg-red-100 text-red-700",
  PARCIAL: "bg-amber-100 text-amber-800",
  CUBIERTA: "bg-emerald-100 text-emerald-700",
};

const ESTADO_LABEL: Record<EstadoPagoEstimacion, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  CUBIERTA: "Cubierta",
};

// Toda obra se cobra por Estimación — una sola tabla, sin ramas por esquema
// (rediseño del modelo financiero del cliente, agosto 2026). "Aplicar fondo"
// es una decisión explícita de Administrador/Director, nunca automática al
// registrar una aportación — solo aparece si hay fondo disponible y la fila
// todavía tiene saldo pendiente.
export function HistorialEstimacionesCliente({
  proyectoId,
  fondoDisponible,
  filas,
  puedeRegistrar,
}: {
  proyectoId: string;
  fondoDisponible: number;
  filas: FilaHistorialEstimacion[];
  puedeRegistrar: boolean;
}) {
  const [pagoParaId, setPagoParaId] = useState<string | null>(null);
  const [fondoParaId, setFondoParaId] = useState<string | null>(null);
  const filaPago = filas.find((f) => f.id === pagoParaId) ?? null;
  const filaFondo = filas.find((f) => f.id === fondoParaId) ?? null;

  return (
    <Card className="enter p-5">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        Historial de estimaciones
      </p>

      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Todavía no hay estimaciones emitidas.</p>
      ) : (
        <div className="mt-3">
          <Table>
            <Thead>
              <Tr>
                <Th>Estimación</Th>
                <Th>Semana</Th>
                <Th className="text-right">Importe</Th>
                <Th className="text-right">Aplicado fondo</Th>
                <Th className="text-right">Pago directo</Th>
                <Th className="text-right">Pendiente</Th>
                <Th>Estado</Th>
                {puedeRegistrar && <Th />}
              </Tr>
            </Thead>
            <tbody>
              {filas.map((f) => (
                <Tr key={f.id}>
                  <Td className="font-medium">Estimación {f.numero}</Td>
                  <Td className="text-[var(--muted)]">
                    Semana {f.semanaNumero}/{f.semanaAnio}
                  </Td>
                  <Td className="text-right tabular-nums">{formatMoney(f.importe)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(f.aplicadoFondo)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(f.pagoDirecto)}</Td>
                  <Td className="text-right tabular-nums">{formatMoney(f.pendiente)}</Td>
                  <Td>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[f.estado]}`}
                    >
                      {ESTADO_LABEL[f.estado]}
                    </span>
                  </Td>
                  {puedeRegistrar && (
                    <Td>
                      {f.pendiente > 0 && (
                        <div className="flex flex-col items-start gap-0.5">
                          {fondoDisponible > 0 && (
                            <button
                              type="button"
                              onClick={() => setFondoParaId(f.id)}
                              className="text-xs font-medium text-[var(--brand)] hover:underline"
                            >
                              Aplicar fondo
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPagoParaId(f.id)}
                            className="text-xs font-medium text-[var(--brand)] hover:underline"
                          >
                            Registrar pago
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

      {filaPago && (
        <ModalRegistrarPago
          proyectoId={proyectoId}
          estimacionId={filaPago.id}
          numero={filaPago.numero}
          pendiente={filaPago.pendiente}
          onClose={() => setPagoParaId(null)}
        />
      )}

      {filaFondo && (
        <ModalAplicarFondo
          proyectoId={proyectoId}
          estimacionId={filaFondo.id}
          numero={filaFondo.numero}
          pendiente={filaFondo.pendiente}
          fondoDisponible={fondoDisponible}
          onClose={() => setFondoParaId(null)}
        />
      )}
    </Card>
  );
}

function ModalRegistrarPago({
  proyectoId,
  estimacionId,
  numero,
  pendiente,
  onClose,
}: {
  proyectoId: string;
  estimacionId: string;
  numero: number;
  pendiente: number;
  onClose: () => void;
}) {
  const action = registrarPagoEstimacionAction.bind(null, proyectoId, estimacionId);
  const [state, formAction, pending] = useActionState<RegistrarPagoFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.registrado) onClose();
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
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Registrar pago — Estimación {numero}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Saldo pendiente: {formatMoney(pendiente)}. Puedes registrar un pago parcial.
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
              max={pendiente}
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
              {pending ? "Registrando…" : "Registrar pago"}
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

function ModalAplicarFondo({
  proyectoId,
  estimacionId,
  numero,
  pendiente,
  fondoDisponible,
  onClose,
}: {
  proyectoId: string;
  estimacionId: string;
  numero: number;
  pendiente: number;
  fondoDisponible: number;
  onClose: () => void;
}) {
  const action = aplicarFondoEstimacionAction.bind(null, proyectoId, estimacionId);
  const [state, formAction, pending] = useActionState<AplicarFondoFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.aplicado) onClose();
  }

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  const tope = Math.min(fondoDisponible, pendiente);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Aplicar fondo — Estimación {numero}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Fondo disponible: {formatMoney(fondoDisponible)}. Saldo pendiente: {formatMoney(pendiente)}.
        </p>

        <form action={formAction} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
              Monto a aplicar
            </label>
            <input
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              max={tope}
              defaultValue={tope}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Aplicando…" : "Aplicar fondo"}
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
