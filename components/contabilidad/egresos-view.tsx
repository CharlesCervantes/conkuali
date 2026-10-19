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
  confirmarComoEgresoManualDesdeDocumentoAction,
  cancelarEgresoAction,
  type ContabilidadFormState,
} from "@/app/(app)/contabilidad/actions";
import { NuevoEgresoDocumentos } from "./nuevo-egreso-documentos";
import type { FilaEgreso } from "@/lib/server/contabilidad/egresos";
import { CAMPOS_FORMULARIO_DECORACION, prefijoOriginal } from "@/lib/contabilidad/formulario-egreso";
import type { FilaMedioFinanciero } from "@/lib/server/contabilidad/medios-financieros";
import type { FilaFactura } from "@/lib/server/contabilidad/facturas";

type PrellenadoDesdeDocumento = {
  documentoEgresoId: string;
  fecha: string | null;
  monto: number | null;
  concepto: string | null;
  fechaPago: string | null;
  referenciaPago: string | null;
  proyectoId: string | null;
};

export function EgresosView({
  egresos,
  mediosFinancieros,
  facturasRecibidas,
  proyectosDisponibles,
  capturaInteligenteHabilitada,
}: {
  egresos: FilaEgreso[];
  mediosFinancieros: FilaMedioFinanciero[];
  facturasRecibidas: FilaFactura[];
  proyectosDisponibles: { id: string; nombre: string }[];
  // ARQENTO IA habilitada para la Empresa (Master). Apagada: no se ofrece
  // subir documentos y "Registrar egreso" va directo a la captura manual —
  // el servidor también rechaza cualquier operación del módulo.
  capturaInteligenteHabilitada: boolean;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [subiendoDocumentos, setSubiendoDocumentos] = useState(false);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editando, setEditando] = useState<FilaEgreso | null>(null);
  const [prellenado, setPrellenado] = useState<PrellenadoDesdeDocumento | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          {egresos.length} egreso{egresos.length === 1 ? "" : "s"} este mes
        </p>
        <Button onClick={() => (capturaInteligenteHabilitada ? setEligiendo(true) : setModalNuevo(true))}>+ Registrar egreso</Button>
      </div>

      {capturaInteligenteHabilitada && eligiendo && (
        <Card className="enter p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Nuevo egreso</h2>
          <div className="mt-4 flex gap-3">
            <Button
              onClick={() => {
                setEligiendo(false);
                setSubiendoDocumentos(true);
              }}
            >
              Subir documentos
            </Button>
            <button
              type="button"
              onClick={() => {
                setEligiendo(false);
                setModalNuevo(true);
              }}
              className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-black/[0.03]"
            >
              Capturar manualmente
            </button>
            <button
              type="button"
              onClick={() => setEligiendo(false)}
              className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Cancelar
            </button>
          </div>
        </Card>
      )}

      {capturaInteligenteHabilitada && subiendoDocumentos && (
        <Card className="enter p-6">
          <NuevoEgresoDocumentos
            onCancelar={() => setSubiendoDocumentos(false)}
            onUsarPropuesta={({ documentoEgresoId, propuesta }) => {
              const campo = (clave: string) => propuesta.campos.find((c) => c.campo === clave)?.valor ?? null;
              const partes = propuesta.partes.map((p) => p.nombre).filter(Boolean).join(" / ");
              setPrellenado({
                documentoEgresoId,
                fecha: (propuesta.fecha ?? new Date().toISOString()).slice(0, 10),
                monto: Number(campo("total") ?? 0),
                concepto: partes || propuesta.conceptoBancario || "Egreso desde documento",
                fechaPago: propuesta.tipoDocumento === "COMPROBANTE_PAGO" && propuesta.fecha ? propuesta.fecha.slice(0, 10) : null,
                referenciaPago: (campo("referenciaBancaria") as string | null) ?? null,
                // Solo un id REAL ya resuelto contra los proyectos de esta
                // Empresa (ver reconciliar-egreso.ts) — nunca uno que la IA
                // pudiera inventar; si no hubo coincidencia clara, queda
                // null y el usuario elige a mano.
                proyectoId: propuesta.proyectoSugerido?.proyectoId ?? null,
              });
              setSubiendoDocumentos(false);
              setModalNuevo(true);
            }}
            onRegistrarManual={(documentoEgresoId) => {
              setPrellenado({
                documentoEgresoId,
                fecha: null,
                monto: null,
                concepto: null,
                fechaPago: null,
                referenciaPago: null,
                proyectoId: null,
              });
              setSubiendoDocumentos(false);
              setModalNuevo(true);
            }}
          />
        </Card>
      )}

      {egresos.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay egresos incluidos en Contabilidad este mes. Un gasto aparece aquí una vez
          aprobado y marcado como incluido en Contabilidad.
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        e.cobroPago === "PAGADO" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {e.cobroPago === "PAGADO" ? "Pagado" : "Por pagar"}
                    </span>
                    {/* R1 — registro histórico a revisar: el gasto se paga por otra vía
                        y aun así tiene datos de pago bancario. Solo se señala. */}
                    {e.pagoRegistradoIndebido && (
                      <span
                        className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                        title={
                          e.pagoPorOtraVia === "ORDEN_COMPRA"
                            ? "Este gasto proviene de una orden de compra y ya se paga desde Reporte General. Revisa si el pago bancario está duplicado."
                            : "Este gasto lo pagó una persona y se le repone desde Reporte General. Revisa si el pago bancario está duplicado."
                        }
                      >
                        Revisar pago
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
          prellenado={prellenado}
          mediosFinancieros={mediosFinancieros}
          facturasRecibidas={facturasRecibidas}
          proyectosDisponibles={proyectosDisponibles}
          onClose={() => {
            setModalNuevo(false);
            setEditando(null);
            setPrellenado(null);
          }}
        />
      )}
    </div>
  );
}

function ModalEgreso({
  egreso,
  prellenado,
  mediosFinancieros,
  facturasRecibidas,
  proyectosDisponibles,
  onClose,
}: {
  egreso: FilaEgreso | null;
  prellenado: PrellenadoDesdeDocumento | null;
  mediosFinancieros: FilaMedioFinanciero[];
  facturasRecibidas: FilaFactura[];
  proyectosDisponibles: { id: string; nombre: string }[];
  onClose: () => void;
}) {
  // 4 modos: nuevo manual, editar manual existente, decorar un gasto fiscal
  // ya existente (solo campos contables — nunca fecha/concepto/monto/
  // proyecto, esos se leen del GastoObra), o confirmar la propuesta de un
  // documento subido (Carga inteligente de documentos, V1 — octubre 2026) —
  // este último nunca reutiliza crearEgresoManualAction: pasa por
  // confirmar-propuesta.ts para que el documento quede ligado al Egreso
  // resultante.
  const esDecoracionDeGasto = Boolean(egreso?.gastoObraId);
  const esDesdeDocumento = Boolean(prellenado) && !egreso;
  const action = esDecoracionDeGasto
    ? guardarDecoracionEgresoAction.bind(null, egreso!.gastoObraId!)
    : esDesdeDocumento
      ? confirmarComoEgresoManualDesdeDocumentoAction.bind(null, prellenado!.documentoEgresoId)
      : egreso?.egresoId
        ? editarEgresoManualAction.bind(null, egreso.egresoId)
        : crearEgresoManualAction;
  const [state, formAction, pending] = useActionState<ContabilidadFormState, FormData>(action, undefined);

  // Valores actuales del registro — se precargan siempre, para que guardar
  // un campo nunca borre los demás. En "Datos fiscales del gasto" además se
  // envían como originales ocultos: el servidor solo recibe lo que cambió.
  const actuales = {
    medioFinancieroId: egreso?.medioFinancieroId ?? "",
    facturaId: egreso?.facturaId ?? "",
    notasContables: egreso?.notasContables ?? "",
    fechaPago: egreso?.fechaPago ? egreso.fechaPago.slice(0, 10) : "",
    referenciaPago: egreso?.referenciaPago ?? "",
  };
  // Una cuenta inactiva o una factura que ya no aparece en la lista de
  // disponibles se agrega como opción, para no perderla al guardar.
  const medioActualFueraDeLista =
    egreso?.medioFinancieroId && !mediosFinancieros.some((m) => m.id === egreso.medioFinancieroId) ? egreso : null;
  const facturaActualFueraDeLista =
    egreso?.facturaId && !facturasRecibidas.some((f) => f.id === egreso.facturaId) ? egreso : null;
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
          {esDecoracionDeGasto
            ? "Datos fiscales del gasto"
            : esDesdeDocumento
              ? "Revisar y confirmar"
              : egreso
                ? "Editar egreso"
                : "Nuevo egreso manual"}
        </h2>
        {esDecoracionDeGasto && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {egreso!.concepto} · {formatearFecha(new Date(egreso!.fecha))} — monto y concepto vienen de Gastos,
            aquí solo se agrega información fiscal.
          </p>
        )}
        {esDesdeDocumento && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            Prellenado desde el documento — revisa y corrige lo que haga falta antes de confirmar.
          </p>
        )}

        <form action={formAction} className="mt-4 space-y-3">
          {esDecoracionDeGasto &&
            CAMPOS_FORMULARIO_DECORACION.map((campo) => (
              <input key={campo} type="hidden" name={prefijoOriginal(campo)} value={actuales[campo]} />
            ))}
          {!esDecoracionDeGasto && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="fecha"
                  type="date"
                  required
                  defaultValue={prellenado?.fecha ?? (egreso ? egreso.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
                />
                <input
                  name="monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Monto"
                  defaultValue={prellenado?.monto ?? egreso?.monto ?? ""}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
                />
              </div>
              <input
                name="concepto"
                required
                placeholder="Concepto"
                defaultValue={prellenado?.concepto ?? egreso?.concepto ?? ""}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
              />
              <select
                name="proyectoId"
                defaultValue={prellenado?.proyectoId ?? ""}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
              >
                <option value="">Sin proyecto (Empresa en general)</option>
                {proyectosDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>

              <select
                name="clasificacionManual"
                required
                defaultValue=""
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
              >
                <option value="" disabled>
                  ¿A qué línea del Estado de Resultados pertenece?
                </option>
                <option value="COSTO_DIRECTO_OBRA">Costo directo de obra</option>
                <option value="GASTO_OPERACION">Gasto de operación</option>
                <option value="IMPUESTOS_CONTRIBUCIONES">Impuestos y contribuciones</option>
                <option value="OTRO_NO_OPERATIVO">Otro (no operativo)</option>
              </select>
            </>
          )}

          {egreso?.pagoPorOtraVia && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {egreso.pagoPorOtraVia === "ORDEN_COMPRA"
                ? "Este gasto proviene de una orden de compra: su pago se registra al liquidarla en Reporte General, no aquí."
                : "Este gasto lo pagó una persona: su pago se registra al liquidar la reposición en Reporte General, no aquí."}{" "}
              Puedes agregar factura y notas.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)]">Fecha de pago (vacío = por pagar)</label>
              <input
                name="fechaPago"
                type="date"
                defaultValue={prellenado?.fechaPago ?? actuales.fechaPago}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
              />
            </div>
            <input
              name="referenciaPago"
              placeholder="Referencia de pago (opcional)"
              defaultValue={prellenado?.referenciaPago ?? actuales.referenciaPago}
              className="mt-5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
            />
          </div>

          <select
            name="medioFinancieroId"
            defaultValue={actuales.medioFinancieroId}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          >
            <option value="">Medio financiero (opcional)</option>
            {medioActualFueraDeLista && (
              <option value={medioActualFueraDeLista.medioFinancieroId!}>
                {medioActualFueraDeLista.medioFinancieroNombre ?? "Cuenta actual"} (actual)
              </option>
            )}
            {mediosFinancieros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>

          <select
            name="facturaId"
            defaultValue={actuales.facturaId}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          >
            <option value="">Sin factura vinculada</option>
            {facturaActualFueraDeLista && (
              <option value={facturaActualFueraDeLista.facturaId!}>
                Factura {facturaActualFueraDeLista.facturaUuid ? `${facturaActualFueraDeLista.facturaUuid.slice(0, 8)}…` : ""} (actual)
              </option>
            )}
            {facturasRecibidas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.razonSocialEmisor} — {formatMoney(f.total)} ({f.uuid.slice(0, 8)}…)
              </option>
            ))}
          </select>

          <textarea
            name="notasContables"
            rows={2}
            defaultValue={actuales.notasContables}
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
