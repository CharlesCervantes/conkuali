"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import {
  crearOrdenCompraAction,
  editarOrdenCompraAction,
  type OrdenCompraFormState,
} from "@/app/(proyecto)/control-de-obra/[id]/actions";
import type { FilaOrdenCompra } from "@/lib/server/control-de-obra/ordenes-compra";

type Linea = {
  concepto: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
};

const LINEA_VACIA: Linea = { concepto: "", descripcion: "", unidad: "", cantidad: "1", precioUnitario: "0" };

export function FormularioOrdenCompra({
  proyectoId,
  semanaId,
  proveedores,
  orden,
  onClose,
}: {
  proyectoId: string;
  semanaId: string;
  proveedores: { id: string; nombre: string }[];
  orden: FilaOrdenCompra | null;
  onClose: () => void;
}) {
  const action = orden
    ? editarOrdenCompraAction.bind(null, proyectoId, orden.id)
    : crearOrdenCompraAction.bind(null, proyectoId, semanaId);
  const [state, formAction, pending] = useActionState<OrdenCompraFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardada) onClose();
  }

  const [lineas, setLineas] = useState<Linea[]>(
    orden && orden.detalle.length > 0
      ? orden.detalle.map((l) => ({
          concepto: l.concepto,
          descripcion: l.descripcion ?? "",
          unidad: l.unidad,
          cantidad: String(l.cantidad),
          precioUnitario: String(l.precioUnitario),
        }))
      : [{ ...LINEA_VACIA }]
  );

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  const total = lineas.reduce(
    (t, l) => t + (Number(l.cantidad) || 0) * (Number(l.precioUnitario) || 0),
    0
  );

  function actualizarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {orden ? "Editar orden de compra" : "Nueva orden de compra"}
        </h2>

        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="detalle" value={JSON.stringify(lineas)} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                Proveedor
              </label>
              <select
                name="proveedorBeneficiarioId"
                required
                defaultValue={orden?.proveedorBeneficiarioId ?? ""}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">
                Fecha
              </label>
              <input
                name="fecha"
                type="date"
                required
                defaultValue={orden ? orden.fecha.slice(0, 10) : hoy}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              />
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-[var(--foreground)]">Detalle</p>
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5">
                  <input
                    placeholder="Concepto"
                    required
                    value={l.concepto}
                    onChange={(e) => actualizarLinea(i, "concepto", e.target.value)}
                    className="col-span-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm"
                  />
                  <input
                    placeholder="Unidad"
                    required
                    value={l.unidad}
                    onChange={(e) => actualizarLinea(i, "unidad", e.target.value)}
                    className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.001"
                    placeholder="Cantidad"
                    required
                    value={l.cantidad}
                    onChange={(e) => actualizarLinea(i, "cantidad", e.target.value)}
                    className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="P.U."
                    required
                    value={l.precioUnitario}
                    onChange={(e) => actualizarLinea(i, "precioUnitario", e.target.value)}
                    className="col-span-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setLineas((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={lineas.length === 1}
                    className="col-span-1 text-sm text-red-700 disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setLineas((prev) => [...prev, { ...LINEA_VACIA }])}
              className="mt-2 text-sm font-medium text-[var(--brand)] hover:underline"
            >
              + Agregar línea
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-2 text-sm font-semibold text-[var(--foreground)]">
            Total <span className="tabular-nums">{formatMoney(total)}</span>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input
              type="checkbox"
              name="requiereFactura"
              defaultChecked={orden?.requiereFactura ?? false}
            />
            Requiere factura
          </label>

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
              {pending ? "Guardando…" : orden ? "Guardar cambios" : "Guardar orden"}
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
