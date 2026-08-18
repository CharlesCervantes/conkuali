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
  type RegistrarPagoFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type {
  EsquemaFinanciamientoCliente,
} from "@/lib/generated/prisma/enums";
import type {
  FilaHistorialEstimacion,
  EstadoPagoEstimacion,
} from "@/lib/server/control-de-obra/financiero-cliente";

const ESTADO_ESTILO: Record<EstadoPagoEstimacion, string> = {
  PENDIENTE: "bg-red-100 text-red-700",
  PARCIAL: "bg-amber-100 text-amber-800",
  PAGADA: "bg-emerald-100 text-emerald-700",
};

const ESTADO_LABEL: Record<EstadoPagoEstimacion, string> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Parcial",
  PAGADA: "Pagada",
};

export function HistorialEstimacionesCliente({
  proyectoId,
  esquemaFinanciamientoCliente,
  filas,
  puedeRegistrarPago,
}: {
  proyectoId: string;
  esquemaFinanciamientoCliente: EsquemaFinanciamientoCliente | null;
  filas: FilaHistorialEstimacion[];
  puedeRegistrarPago: boolean;
}) {
  const [pagoParaId, setPagoParaId] = useState<string | null>(null);
  const filaSeleccionada = filas.find((f) => f.id === pagoParaId) ?? null;

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
                {esquemaFinanciamientoCliente === "FONDO" && (
                  <Th className="text-right">Aplicado al fondo</Th>
                )}
                {esquemaFinanciamientoCliente === "PAGO_POR_ESTIMACION" && (
                  <>
                    <Th className="text-right">Cobrado</Th>
                    <Th className="text-right">Pendiente</Th>
                    <Th>Estado</Th>
                    {puedeRegistrarPago && <Th />}
                  </>
                )}
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
                  {esquemaFinanciamientoCliente === "FONDO" && (
                    <Td className="text-right tabular-nums">
                      {formatMoney(f.aplicadoAlFondo ?? 0)}
                    </Td>
                  )}
                  {esquemaFinanciamientoCliente === "PAGO_POR_ESTIMACION" && (
                    <>
                      <Td className="text-right tabular-nums">{formatMoney(f.cobrado ?? 0)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(f.pendiente ?? 0)}</Td>
                      <Td>
                        {f.estado && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[f.estado]}`}
                          >
                            {ESTADO_LABEL[f.estado]}
                          </span>
                        )}
                      </Td>
                      {puedeRegistrarPago && (
                        <Td>
                          {(f.pendiente ?? 0) > 0 && (
                            <button
                              type="button"
                              onClick={() => setPagoParaId(f.id)}
                              className="text-xs font-medium text-[var(--brand)] hover:underline"
                            >
                              Registrar pago
                            </button>
                          )}
                        </Td>
                      )}
                    </>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {filaSeleccionada && (
        <ModalRegistrarPago
          proyectoId={proyectoId}
          estimacionId={filaSeleccionada.id}
          numero={filaSeleccionada.numero}
          pendiente={filaSeleccionada.pendiente ?? 0}
          onClose={() => setPagoParaId(null)}
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
