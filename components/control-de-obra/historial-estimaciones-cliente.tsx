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
  registrarPagoEstimacionAction,
  aplicarFondoEstimacionAction,
  editarPagoEstimacionAction,
  editarMontoPagoEstimacionAction,
  cancelarMovimientoFinancieroClienteAction,
  obtenerMovimientosCapaAction,
  type RegistrarPagoFormState,
  type AplicarFondoFormState,
  type EditarMovimientoFormState,
  type CancelarMovimientoFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";
import type {
  FilaHistorialEstimacion,
  EstadoPagoEstimacion,
  CapaValorizacion,
  FilaMovimientoCapa,
} from "@/lib/server/control-de-obra/financiero-cliente";
import type { FilaMedioFinanciero } from "@/lib/server/contabilidad/medios-financieros";

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

const TIPO_LABEL: Record<FilaMovimientoCapa["tipo"], string> = {
  PAGO_ESTIMACION: "Pago directo",
  APLICACION_ESTIMACION: "Aplicación de fondo",
};

// Toda obra se cobra por Estimación — una sola tabla, sin ramas por esquema
// (rediseño del modelo financiero del cliente, agosto 2026). El "Importe"
// por fila varía según la capa de la pantalla (operativo en Cliente, privado
// en Cliente Priv.); las columnas financieras (Aplicado fondo/Pago
// directo/Pendiente/Estado) y las acciones son siempre la MISMA realidad
// (ancladas al total privado real) y solo se pintan si el servidor las
// incluyó (`f.financiero !== null` — nunca se decide aquí ocultar un dato
// que sí llegó, el servidor ya lo podó según puedeVerFinancieroCliente).
export function HistorialEstimacionesCliente({
  proyectoId,
  capa,
  fondoDisponible,
  filas,
  puedeRegistrar,
  mediosFinancieros,
}: {
  proyectoId: string;
  capa: CapaValorizacion;
  fondoDisponible: number;
  filas: FilaHistorialEstimacion[];
  puedeRegistrar: boolean;
  mediosFinancieros: FilaMedioFinanciero[];
}) {
  const [pagoParaId, setPagoParaId] = useState<string | null>(null);
  const [fondoParaId, setFondoParaId] = useState<string | null>(null);
  const [verPagosParaId, setVerPagosParaId] = useState<string | null>(null);
  const filaPago = filas.find((f) => f.id === pagoParaId) ?? null;
  const filaFondo = filas.find((f) => f.id === fondoParaId) ?? null;
  const filaVerPagos = filas.find((f) => f.id === verPagosParaId) ?? null;
  const mostrarFinanciero = filas.some((f) => f.financiero !== null);

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
                {mostrarFinanciero && (
                  <>
                    <Th className="text-right">Aplicado fondo</Th>
                    <Th className="text-right">Pago directo</Th>
                    <Th className="text-right">Pendiente</Th>
                    <Th>Estado</Th>
                  </>
                )}
                {puedeRegistrar && <Th />}
                <Th>Documento</Th>
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
                  {mostrarFinanciero && f.financiero && (
                    <>
                      <Td className="text-right tabular-nums">{formatMoney(f.financiero.aplicadoFondo)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(f.financiero.pagoDirecto)}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(f.financiero.pendiente)}</Td>
                      <Td>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[f.financiero.estado]}`}
                        >
                          {ESTADO_LABEL[f.financiero.estado]}
                        </span>
                      </Td>
                    </>
                  )}
                  {puedeRegistrar && f.financiero && (
                    <Td>
                      <div className="flex flex-col items-start gap-0.5">
                        {f.financiero.pendiente > 0 && (
                          <>
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
                          </>
                        )}
                        {(f.financiero.aplicadoFondo > 0 || f.financiero.pagoDirecto > 0) && (
                          <button
                            type="button"
                            onClick={() => setVerPagosParaId(f.id)}
                            className="text-xs font-medium text-[var(--muted)] hover:underline"
                          >
                            Ver pagos
                          </button>
                        )}
                      </div>
                    </Td>
                  )}
                  <Td>
                    <a
                      href={`/api/control-de-obra/proyectos/${proyectoId}/estimaciones/${f.id}${capa === "privado" ? "/privado" : ""}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-[var(--brand)] hover:underline"
                    >
                      Descargar
                    </a>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {filaPago && filaPago.financiero && (
        <ModalRegistrarPago
          proyectoId={proyectoId}
          estimacionId={filaPago.id}
          numero={filaPago.numero}
          pendiente={filaPago.financiero.pendiente}
          mediosFinancieros={mediosFinancieros}
          onClose={() => setPagoParaId(null)}
        />
      )}

      {filaFondo && filaFondo.financiero && (
        <ModalAplicarFondo
          proyectoId={proyectoId}
          estimacionId={filaFondo.id}
          numero={filaFondo.numero}
          pendiente={filaFondo.financiero.pendiente}
          fondoDisponible={fondoDisponible}
          onClose={() => setFondoParaId(null)}
        />
      )}

      {filaVerPagos && (
        <ModalPagosEstimacion
          proyectoId={proyectoId}
          estimacionClienteCapaId={filaVerPagos.id}
          numero={filaVerPagos.numero}
          mediosFinancieros={mediosFinancieros}
          onClose={() => setVerPagosParaId(null)}
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
  mediosFinancieros,
  onClose,
}: {
  proyectoId: string;
  estimacionId: string;
  numero: number;
  pendiente: number;
  mediosFinancieros: FilaMedioFinanciero[];
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

          <CamposFiscalesCobro mediosFinancieros={mediosFinancieros} />

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

// ---------------------------------------------------------------------------
// Ver / editar / cancelar pagos y aplicaciones individuales de una capa —
// nunca DELETE (Cobros de cliente, septiembre 2026).
// ---------------------------------------------------------------------------

function ModalPagosEstimacion({
  proyectoId,
  estimacionClienteCapaId,
  numero,
  mediosFinancieros,
  onClose,
}: {
  proyectoId: string;
  estimacionClienteCapaId: string;
  numero: number;
  mediosFinancieros: FilaMedioFinanciero[];
  onClose: () => void;
}) {
  const [filas, setFilas] = useState<FilaMovimientoCapa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editarId, setEditarId] = useState<string | null>(null);
  const [cancelarId, setCancelarId] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    // No se limpia `filas` antes de pedir — al recargar tras editar/cancelar
    // (recarga++) la tabla se queda con los datos anteriores hasta que
    // llegan los nuevos, sin parpadeo a "Cargando…".
    obtenerMovimientosCapaAction(estimacionClienteCapaId).then((resultado) => {
      if (!vigente) return;
      if ("error" in resultado) setError(resultado.error);
      else setFilas(resultado.filas);
    });
    return () => {
      vigente = false;
    };
  }, [estimacionClienteCapaId, recarga]);

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  const filaEditar = filas?.find((f) => f.id === editarId) ?? null;
  const filaCancelar = filas?.find((f) => f.id === cancelarId) ?? null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Pagos — Estimación {numero}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
          >
            Cerrar
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        {!error && !filas && <p className="mt-4 text-sm text-[var(--muted)]">Cargando…</p>}
        {!error && filas && filas.length === 0 && (
          <p className="mt-4 text-sm text-[var(--muted)]">Sin movimientos registrados.</p>
        )}

        {!error && filas && filas.length > 0 && (
          <div className="mt-4">
            <Table>
              <Thead>
                <Tr>
                  <Th>Tipo</Th>
                  <Th>Fecha</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Referencia</Th>
                  <Th>Estatus</Th>
                  <Th>Registró</Th>
                  <Th />
                </Tr>
              </Thead>
              <tbody>
                {filas.map((m) => (
                  <Tr key={m.id}>
                    <Td>{TIPO_LABEL[m.tipo]}</Td>
                    <Td className="text-[var(--muted)]">{formatearFecha(new Date(m.fecha))}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(m.monto)}</Td>
                    <Td className="text-[var(--muted)]">{m.referencia ?? "—"}</Td>
                    <Td>
                      {m.estatus === "CANCELADO" ? (
                        <span
                          className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700"
                          title={m.motivoCancelacion ?? undefined}
                        >
                          Cancelado
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          Vigente
                        </span>
                      )}
                    </Td>
                    <Td className="text-[var(--muted)]">{m.registradoPorNombre}</Td>
                    <Td>
                      {m.estatus === "VIGENTE" && (
                        <div className="flex items-center gap-2">
                          {m.tipo === "PAGO_ESTIMACION" && (
                            <button
                              type="button"
                              onClick={() => setEditarId(m.id)}
                              className="text-xs font-medium text-[var(--brand)] hover:underline"
                            >
                              Editar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCancelarId(m.id)}
                            className="text-xs font-medium text-red-700 hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {filaEditar && (
        <ModalEditarPago
          proyectoId={proyectoId}
          movimiento={filaEditar}
          mediosFinancieros={mediosFinancieros}
          onClose={() => setEditarId(null)}
          onGuardado={() => {
            setEditarId(null);
            setRecarga((r) => r + 1);
          }}
        />
      )}

      {filaCancelar && (
        <ModalCancelarMovimiento
          proyectoId={proyectoId}
          movimientoId={filaCancelar.id}
          onClose={() => setCancelarId(null)}
          onCancelado={() => {
            setCancelarId(null);
            setRecarga((r) => r + 1);
          }}
        />
      )}
    </div>,
    document.body
  );
}

function ModalEditarPago({
  proyectoId,
  movimiento,
  mediosFinancieros,
  onClose,
  onGuardado,
}: {
  proyectoId: string;
  movimiento: FilaMovimientoCapa;
  mediosFinancieros: FilaMedioFinanciero[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const accionDatos = editarPagoEstimacionAction.bind(null, proyectoId, movimiento.id);
  const [estadoDatos, formActionDatos, pendingDatos] = useActionState<EditarMovimientoFormState, FormData>(
    accionDatos,
    undefined
  );
  const [estadoDatosAnterior, setEstadoDatosAnterior] = useState(estadoDatos);
  if (estadoDatos !== estadoDatosAnterior) {
    setEstadoDatosAnterior(estadoDatos);
    if (estadoDatos?.guardado) onGuardado();
  }

  const accionMonto = editarMontoPagoEstimacionAction.bind(null, proyectoId, movimiento.id);
  const [estadoMonto, formActionMonto, pendingMonto] = useActionState<EditarMovimientoFormState, FormData>(
    accionMonto,
    undefined
  );
  const [estadoMontoAnterior, setEstadoMontoAnterior] = useState(estadoMonto);
  if (estadoMonto !== estadoMontoAnterior) {
    setEstadoMontoAnterior(estadoMonto);
    if (estadoMonto?.guardado) onGuardado();
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Editar pago</h2>

        <form action={formActionMonto} className="mt-4 flex items-end gap-2 border-b border-[var(--border)] pb-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Monto</label>
            <input
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={movimiento.monto}
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
              defaultValue={movimiento.fecha.slice(0, 10)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Referencia</label>
            <input
              name="referencia"
              type="text"
              defaultValue={movimiento.referencia ?? ""}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Notas</label>
            <textarea
              name="notas"
              rows={2}
              defaultValue={movimiento.notas ?? ""}
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

function ModalCancelarMovimiento({
  proyectoId,
  movimientoId,
  onClose,
  onCancelado,
}: {
  proyectoId: string;
  movimientoId: string;
  onClose: () => void;
  onCancelado: () => void;
}) {
  const action = cancelarMovimientoFinancieroClienteAction.bind(null, proyectoId, movimientoId);
  const [state, formAction, pending] = useActionState<CancelarMovimientoFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.cancelado) onCancelado();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Cancelar movimiento</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Esta acción no se puede deshacer. El movimiento queda marcado como cancelado (nunca se elimina) y deja
          de contar en cualquier saldo o reporte.
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
              {pending ? "Cancelando…" : "Cancelar movimiento"}
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
