"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import {
  cargarFacturaAction,
  vincularFacturaAGastoAction,
  vincularFacturaAIngresoAction,
} from "@/app/(app)/contabilidad/actions";
import type { FilaFacturaPendiente } from "@/lib/server/contabilidad/facturas-pendientes";
import type { FilaFactura } from "@/lib/server/contabilidad/facturas";

export function FacturasPendientesView({
  pendientes,
  facturas,
}: {
  pendientes: FilaFacturaPendiente[];
  facturas: FilaFactura[];
}) {
  const [cargandoPara, setCargandoPara] = useState<FilaFacturaPendiente | null>(null);
  const [cargaLibre, setCargaLibre] = useState(false);
  const [vinculando, setVinculando] = useState<FilaFactura | null>(null);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Facturas pendientes ({pendientes.length})
        </p>
        {pendientes.length === 0 ? (
          <Card className="p-6 text-sm text-[var(--muted)]">Sin facturas pendientes por ahora.</Card>
        ) : (
          <div className="space-y-2">
            {pendientes.map((p) => (
              <Card key={`${p.origen}-${p.id}`} className="enter flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[var(--foreground)]">{p.concepto}</p>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                      {p.origen === "EGRESO" ? "Egreso" : "Ingreso"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {p.proyectoNombre ?? "—"} · {formatearFecha(new Date(p.fecha))}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--foreground)]">
                  {formatMoney(p.montoEsperado)}
                </p>
                <Button onClick={() => setCargandoPara(p)} className="shrink-0 px-3 py-1.5 text-xs">
                  Cargar XML
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Facturas cargadas ({facturas.length})
          </p>
          <button
            type="button"
            onClick={() => setCargaLibre(true)}
            className="text-sm font-medium text-[var(--brand)] hover:underline"
          >
            + Cargar factura
          </button>
        </div>
        {facturas.length === 0 ? (
          <Card className="p-6 text-sm text-[var(--muted)]">Todavía no se ha cargado ninguna factura.</Card>
        ) : (
          <div className="space-y-2">
            {facturas.map((f) => {
              const sinVincular = f.vinculadaAEgresos === 0 && f.vinculadaAIngresos === 0;
              return (
                <Card key={f.id} className="enter p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[var(--foreground)]">{f.razonSocialEmisor}</p>
                        <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                          {f.direccion === "RECIBIDA" ? "Recibida" : "Emitida"}
                        </span>
                        {f.estatus === "CANCELADO" && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                            Cancelada
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        UUID {f.uuid} · {formatearFecha(new Date(f.fechaEmision))} ·{" "}
                        {f.vinculadaAEgresos + f.vinculadaAIngresos} vinculación
                        {f.vinculadaAEgresos + f.vinculadaAIngresos === 1 ? "" : "es"}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--foreground)]">
                      {formatMoney(f.total)} {f.moneda}
                    </p>
                    {sinVincular && (
                      <button
                        type="button"
                        onClick={() => setVinculando(f)}
                        className="shrink-0 text-xs font-medium text-[var(--brand)] hover:underline"
                      >
                        Vincular
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {cargandoPara && (
        <ModalCargarFactura
          direccionFija={cargandoPara.origen === "EGRESO" ? "RECIBIDA" : "EMITIDA"}
          vincularA={{ origen: cargandoPara.origen, id: cargandoPara.id }}
          onClose={() => setCargandoPara(null)}
        />
      )}
      {cargaLibre && <ModalCargarFactura onClose={() => setCargaLibre(false)} />}
      {vinculando && (
        <ModalVincular
          factura={vinculando}
          pendientes={pendientes.filter((p) => p.origen === (vinculando.direccion === "RECIBIDA" ? "EGRESO" : "INGRESO"))}
          onClose={() => setVinculando(null)}
        />
      )}
    </div>
  );
}

function ModalCargarFactura({
  direccionFija,
  vincularA,
  onClose,
}: {
  direccionFija?: "RECIBIDA" | "EMITIDA";
  vincularA?: { origen: "EGRESO" | "INGRESO"; id: string };
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ coincide: boolean; diferenciaMonto: number } | null>(null);

  function enviar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      if (direccionFija) formData.set("direccion", direccionFija);
      const respuesta = await cargarFacturaAction(undefined, formData);
      if (!respuesta || respuesta.error) {
        setError(respuesta?.error ?? "No se pudo cargar la factura.");
        return;
      }
      if (vincularA) {
        const vinculo =
          vincularA.origen === "EGRESO"
            ? await vincularFacturaAGastoAction(respuesta.facturaId!, vincularA.id)
            : await vincularFacturaAIngresoAction(respuesta.facturaId!, vincularA.id);
        if (vinculo?.error) {
          setError(vinculo.error);
          return;
        }
        setResultado({ coincide: vinculo?.coincide ?? true, diferenciaMonto: vinculo?.diferenciaMonto ?? 0 });
      } else {
        onClose();
      }
    });
  }

  if (resultado) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <Card className="enter w-full max-w-md p-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Factura vinculada ✓</h2>
          {resultado.coincide ? (
            <p className="mt-2 text-sm text-emerald-700">El monto de la factura coincide con el registro.</p>
          ) : (
            <p className="mt-2 text-sm text-amber-700">
              Aviso: el monto de la factura difiere por {formatMoney(resultado.diferenciaMonto)} — revisa que sea
              correcto (una factura puede cubrir más de un gasto, o traer retenciones).
            </p>
          )}
          <Button className="mt-4" onClick={onClose}>
            Cerrar
          </Button>
        </Card>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Cargar factura (CFDI)</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          El XML es la fuente fiscal — se lee automáticamente (UUID, RFC, total, etc.). El PDF es solo la
          representación, opcional.
        </p>
        <form
          action={enviar}
          className="mt-4 space-y-3"
        >
          {!direccionFija && (
            <select
              name="direccion"
              required
              defaultValue="RECIBIDA"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
            >
              <option value="RECIBIDA">Recibida (factura de un proveedor — Egreso)</option>
              <option value="EMITIDA">Emitida (factura a un cliente — Ingreso)</option>
            </select>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Archivo XML</label>
            <FileInput
              name="xml"
              accept=".xml,text/xml,application/xml"
              required
              className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">PDF (opcional)</label>
            <FileInput
              name="pdf"
              accept="application/pdf"
              className="block w-full text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Leyendo XML…" : "Cargar"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
            >
              Cancelar
            </button>
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        </form>
      </Card>
    </div>,
    document.body
  );
}

function ModalVincular({
  factura,
  pendientes,
  onClose,
}: {
  factura: FilaFactura;
  pendientes: FilaFacturaPendiente[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ coincide: boolean; diferenciaMonto: number } | null>(null);

  function vincular(pendiente: FilaFacturaPendiente) {
    setError(null);
    startTransition(async () => {
      const respuesta =
        pendiente.origen === "EGRESO"
          ? await vincularFacturaAGastoAction(factura.id, pendiente.id)
          : await vincularFacturaAIngresoAction(factura.id, pendiente.id);
      if (respuesta?.error) {
        setError(respuesta.error);
        return;
      }
      setResultado({ coincide: respuesta?.coincide ?? true, diferenciaMonto: respuesta?.diferenciaMonto ?? 0 });
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter max-h-[80vh] w-full max-w-md overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Vincular factura</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {factura.razonSocialEmisor} — {formatMoney(factura.total)} {factura.moneda}
        </p>

        {resultado ? (
          <>
            {resultado.coincide ? (
              <p className="mt-3 text-sm text-emerald-700">Vinculada ✓ — el monto coincide.</p>
            ) : (
              <p className="mt-3 text-sm text-amber-700">
                Vinculada ✓ — aviso: difiere por {formatMoney(resultado.diferenciaMonto)}.
              </p>
            )}
            <Button className="mt-4" onClick={onClose}>
              Cerrar
            </Button>
          </>
        ) : pendientes.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">No hay pendientes compatibles para vincular.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {pendientes.map((p) => (
              <button
                key={`${p.origen}-${p.id}`}
                type="button"
                disabled={pending}
                onClick={() => vincular(p)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm transition-colors duration-150 ease-out hover:bg-black/[0.03] disabled:opacity-50"
              >
                <span>{p.concepto}</span>
                <span className="tabular-nums text-[var(--muted)]">{formatMoney(p.montoEsperado)}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        {!resultado && (
          <button
            type="button"
            onClick={onClose}
            className="mt-4 text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
          >
            Cancelar
          </button>
        )}
      </Card>
    </div>,
    document.body
  );
}
