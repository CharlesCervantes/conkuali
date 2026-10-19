"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import {
  crearIngresoManualAction,
  editarIngresoManualAction,
  guardarDecoracionIngresoAction,
  cancelarIngresoAction,
  type ContabilidadFormState,
} from "@/app/(app)/contabilidad/actions";
import type { FilaIngreso } from "@/lib/server/contabilidad/ingresos";
import type { FilaMedioFinanciero } from "@/lib/server/contabilidad/medios-financieros";
import type { FilaFactura } from "@/lib/server/contabilidad/facturas";
import { CAMPOS_DECORACION_INGRESO, CAMPOS_INGRESO_MANUAL, prefijoOriginal } from "@/lib/contabilidad/formulario-ingreso";

const METODO_INGRESO_LABEL: Record<string, string> = {
  TRANSFERENCIA: "Transferencia",
  DEPOSITO: "Depósito",
  CHEQUE: "Cheque",
  OTRO: "Otro",
};

export function IngresosView({
  ingresos,
  mediosFinancieros,
  facturasEmitidas,
  proyectosDisponibles,
}: {
  ingresos: FilaIngreso[];
  mediosFinancieros: FilaMedioFinanciero[];
  facturasEmitidas: FilaFactura[];
  proyectosDisponibles: { id: string; nombre: string }[];
}) {
  const [modalNuevo, setModalNuevo] = useState(false);
  const [editando, setEditando] = useState<FilaIngreso | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          {ingresos.length} ingreso{ingresos.length === 1 ? "" : "s"} este mes
        </p>
        <Button onClick={() => setModalNuevo(true)}>+ Registrar ingreso manual</Button>
      </div>

      {ingresos.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay ingresos incluidos en Contabilidad este mes. Los pagos de cliente marcados como
          incluidos en Contabilidad aparecen aquí automáticamente.
        </Card>
      ) : (
        <div className="space-y-2">
          {ingresos.map((i) => (
            <Card key={i.ingresoId ?? i.movimientoFinancieroClienteId} className="enter p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--foreground)]">{i.concepto}</p>
                    {i.estatus === "CANCELADO" && (
                      <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                        Cancelado
                      </span>
                    )}
                    {!i.movimientoFinancieroClienteId && (
                      <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                        Manual
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        i.cobroPago === "COBRADO" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {i.cobroPago === "COBRADO" ? "Cobrado" : "Por cobrar"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {i.proyectoNombre ?? "—"} · {formatearFecha(new Date(i.fecha))}
                    {i.clienteNombre && ` · ${i.clienteNombre}`}
                    {i.medioIngreso && ` · ${METODO_INGRESO_LABEL[i.medioIngreso] ?? i.medioIngreso}`}
                    {i.cuentaReceptoraNombre && ` · ${i.cuentaReceptoraNombre}`}
                    {i.facturaUuid && ` · Factura ${i.facturaUuid.slice(0, 8)}…`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditando(i)}
                    className="mt-2 text-xs font-medium text-[var(--brand)] hover:underline"
                  >
                    {i.facturaId || i.cuentaReceptoraNombre ? "Editar datos fiscales" : "Agregar datos fiscales"}
                  </button>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">
                  {formatMoney(i.monto)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(modalNuevo || editando) && (
        <ModalIngreso
          ingreso={editando}
          mediosFinancieros={mediosFinancieros}
          facturasEmitidas={facturasEmitidas}
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

const CAMPO_CLASE =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]";

// Valores actuales del registro, tal como los muestra el formulario — se
// envían también como `original:<campo>` para que el servidor solo reciba
// lo que el usuario cambió (contrato parcial, lib/contabilidad/formulario-ingreso.ts).
function valoresActuales(ingreso: FilaIngreso): Record<string, string> {
  return {
    clienteNombre: ingreso.clienteNombre ?? "",
    metodoIngreso: ingreso.medioIngreso ?? "",
    cuentaReceptoraId: ingreso.cuentaReceptoraId ?? "",
    facturaId: ingreso.facturaId ?? "",
    comentarios: ingreso.comentarios ?? "",
    fecha: ingreso.fecha.slice(0, 10),
    concepto: ingreso.concepto,
    monto: String(ingreso.monto),
    proyectoId: ingreso.proyectoId ?? "",
    clasificacionManual: ingreso.clasificacionManual ?? "",
    fechaCobro: ingreso.fechaCobro ? ingreso.fechaCobro.slice(0, 10) : "",
    referencia: ingreso.referencia ?? "",
  };
}

function ModalIngreso({
  ingreso,
  mediosFinancieros,
  facturasEmitidas,
  proyectosDisponibles,
  onClose,
}: {
  ingreso: FilaIngreso | null;
  mediosFinancieros: FilaMedioFinanciero[];
  facturasEmitidas: FilaFactura[];
  proyectosDisponibles: { id: string; nombre: string }[];
  onClose: () => void;
}) {
  const esDecoracionDePago = Boolean(ingreso?.movimientoFinancieroClienteId);
  const action = esDecoracionDePago
    ? guardarDecoracionIngresoAction.bind(null, ingreso!.movimientoFinancieroClienteId!)
    : ingreso?.ingresoId
      ? editarIngresoManualAction.bind(null, ingreso.ingresoId)
      : crearIngresoManualAction;
  const [state, formAction, pending] = useActionState<ContabilidadFormState, FormData>(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onClose();
  }

  // Registro existente: precarga + originales. Registro nuevo: vacío, sin
  // originales (se envía todo, con las validaciones obligatorias de siempre).
  const actuales = ingreso ? valoresActuales(ingreso) : null;
  const camposVisibles = esDecoracionDePago ? CAMPOS_DECORACION_INGRESO : CAMPOS_INGRESO_MANUAL;
  // Un valor guardado que la lista ya no ofrece (cuenta inactiva, factura o
  // proyecto que no aparece) se muestra como "(actual)" para que guardar sin
  // tocarlo nunca lo cambie.
  const cuentaFueraDeLista =
    ingreso?.cuentaReceptoraId && !mediosFinancieros.some((m) => m.id === ingreso.cuentaReceptoraId) ? ingreso : null;
  const facturaFueraDeLista = ingreso?.facturaId && !facturasEmitidas.some((f) => f.id === ingreso.facturaId) ? ingreso : null;
  const proyectoFueraDeLista =
    !esDecoracionDePago && ingreso?.proyectoId && !proyectosDisponibles.some((p) => p.id === ingreso.proyectoId) ? ingreso : null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {esDecoracionDePago ? "Datos fiscales del pago" : ingreso ? "Editar ingreso" : "Nuevo ingreso manual"}
        </h2>
        {esDecoracionDePago && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {ingreso!.concepto} · {formatearFecha(new Date(ingreso!.fecha))} — monto, fecha y proyecto vienen
            de Control de Obra, aquí solo se agrega información fiscal.
          </p>
        )}

        <form action={formAction} className="mt-4 space-y-3">
          {actuales && (
            <>
              {camposVisibles.map((campo) => (
                <input key={campo} type="hidden" name={prefijoOriginal(campo)} value={actuales[campo]} />
              ))}
              <input type="hidden" name={prefijoOriginal("facturaEsperada")} value={ingreso!.facturaEsperada ? "true" : "false"} />
            </>
          )}

          {!esDecoracionDePago && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="fecha"
                  type="date"
                  required
                  defaultValue={actuales?.fecha ?? new Date().toISOString().slice(0, 10)}
                  className={CAMPO_CLASE}
                />
                <input
                  name="monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="Monto"
                  defaultValue={actuales?.monto ?? ""}
                  className={CAMPO_CLASE}
                />
              </div>
              <input
                name="concepto"
                required
                placeholder="Concepto"
                defaultValue={actuales?.concepto ?? ""}
                className={CAMPO_CLASE}
              />
              <select name="proyectoId" defaultValue={actuales?.proyectoId ?? ""} className={CAMPO_CLASE}>
                <option value="">Sin proyecto</option>
                {proyectoFueraDeLista && (
                  <option value={proyectoFueraDeLista.proyectoId!}>{proyectoFueraDeLista.proyectoNombre ?? "Proyecto actual"} (actual)</option>
                )}
                {proyectosDisponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>

              {/* Obligatoria al crear. Al editar se precarga; un ingreso
                  histórico sin clasificación la conserva vacía si no se elige. */}
              <select
                name="clasificacionManual"
                required={!ingreso}
                defaultValue={actuales?.clasificacionManual ?? ""}
                className={CAMPO_CLASE}
              >
                <option value="" disabled>
                  ¿A qué línea del Estado de Resultados pertenece?
                </option>
                <option value="INGRESO_OPERATIVO">Otros ingresos (operativo)</option>
                <option value="OTRO_NO_OPERATIVO">Otro (no operativo)</option>
              </select>

              <div>
                <label className="text-xs text-[var(--muted)]">Fecha de cobro (vacío = por cobrar)</label>
                <input name="fechaCobro" type="date" defaultValue={actuales?.fechaCobro ?? ""} className={`mt-1 ${CAMPO_CLASE}`} />
              </div>
            </>
          )}

          <input
            name="clienteNombre"
            placeholder="Cliente (opcional)"
            defaultValue={actuales?.clienteNombre ?? ""}
            className={CAMPO_CLASE}
          />

          <div className="grid grid-cols-2 gap-3">
            <select name="metodoIngreso" defaultValue={actuales?.metodoIngreso ?? ""} className={CAMPO_CLASE}>
              <option value="">Método (opcional)</option>
              {Object.entries(METODO_INGRESO_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select name="cuentaReceptoraId" defaultValue={actuales?.cuentaReceptoraId ?? ""} className={CAMPO_CLASE}>
              <option value="">Cuenta receptora (opcional)</option>
              {cuentaFueraDeLista && (
                <option value={cuentaFueraDeLista.cuentaReceptoraId!}>
                  {cuentaFueraDeLista.cuentaReceptoraNombre ?? "Cuenta actual"} (actual)
                </option>
              )}
              {mediosFinancieros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          {esDecoracionDePago ? (
            // D-b: la referencia vive en el cobro (Control de Obra) — aquí
            // solo se consulta; nunca se edita ni se descarta en silencio.
            <p className="text-sm text-[var(--muted)]">
              Referencia del cobro:{" "}
              <span className="text-[var(--foreground)]">{ingreso!.referencia || "sin referencia"}</span>
              <span className="block text-xs">Se edita desde el cobro en Control de Obra.</span>
            </p>
          ) : (
            <input
              name="referencia"
              placeholder="Referencia (opcional)"
              defaultValue={actuales?.referencia ?? ""}
              className={CAMPO_CLASE}
            />
          )}

          <select name="facturaId" defaultValue={actuales?.facturaId ?? ""} className={CAMPO_CLASE}>
            <option value="">Sin factura vinculada</option>
            {facturaFueraDeLista && (
              <option value={facturaFueraDeLista.facturaId!}>
                Factura {facturaFueraDeLista.facturaUuid ? `${facturaFueraDeLista.facturaUuid.slice(0, 8)}…` : ""} (actual)
              </option>
            )}
            {facturasEmitidas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.razonSocialEmisor} — {formatMoney(f.total)} ({f.uuid.slice(0, 8)}…)
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input type="checkbox" name="facturaEsperada" defaultChecked={ingreso?.facturaEsperada ?? false} />
            Se espera factura para este ingreso
          </label>

          {(esDecoracionDePago || !ingreso) && (
            <Campo label={ingreso ? "Reemplazar comprobante (opcional)" : "Comprobante (opcional)"}>
              <FileInput
                name="comprobante"
                accept="image/*,application/pdf"
                className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </Campo>
          )}

          <textarea
            name="comentarios"
            rows={2}
            placeholder="Comentarios (opcional)"
            defaultValue={actuales?.comentarios ?? ""}
            className={CAMPO_CLASE}
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
            {ingreso?.ingresoId && !esDecoracionDePago && (
              <button
                type="button"
                onClick={() => {
                  cancelarIngresoAction(ingreso.ingresoId!);
                  onClose();
                }}
                className="ml-auto text-sm text-red-700 hover:underline"
              >
                Cancelar ingreso
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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      {children}
    </div>
  );
}
