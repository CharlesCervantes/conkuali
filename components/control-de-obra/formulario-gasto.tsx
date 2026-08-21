"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORIAS_GASTO, CATEGORIA_GASTO_LABEL } from "@/lib/control-de-obra/categorias-gasto";
import {
  crearGastoAction,
  editarGastoAction,
  type GastoFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type { FilaGasto } from "@/lib/server/control-de-obra/gastos";

const METODOS_PAGO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA_DEBITO", label: "Tarjeta débito" },
  { value: "TARJETA_CREDITO", label: "Tarjeta crédito" },
];

const TRATAMIENTOS_CLIENTE = [
  { value: "NO_COBRABLE", label: "No cobrable al cliente" },
  { value: "COBRABLE_EN_ESTIMACION", label: "Cobrable en estimación" },
  { value: "INCLUIDO_EN_CONTRATO", label: "Incluido en contrato" },
];

// Formulario corto, pensado para llenarse desde el celular en obra —
// campos mínimos, input de archivo con `capture="environment"` para tomar la
// foto del ticket directo con la cámara (sección 35 del diseño de Gastos de
// Obra, agosto 2026).
type QuienPagoModo = "YO" | "OTRO" | "EMPRESA";

export function FormularioGasto({
  proyectoId,
  semanaId,
  beneficiarios,
  beneficiarioVinculado,
  gasto,
  onClose,
}: {
  proyectoId: string;
  semanaId: string;
  beneficiarios: { id: string; nombre: string; tipo: string }[];
  beneficiarioVinculado: { id: string; nombre: string } | null;
  gasto: FilaGasto | null;
  onClose: () => void;
}) {
  const action = gasto
    ? editarGastoAction.bind(null, proyectoId, gasto.id)
    : crearGastoAction.bind(null, proyectoId, semanaId);
  const [state, formAction, pending] = useActionState<GastoFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onClose();
  }

  // El modo inicial se infiere del gasto existente para no perder la
  // selección al editar — pero la resolución real de "YO" siempre vuelve a
  // ocurrir server-side al enviar (nunca se confía en el id de este campo
  // para ese caso).
  const [quienPagoModo, setQuienPagoModo] = useState<QuienPagoModo>(() => {
    if (!gasto || !gasto.pagadorBeneficiarioId) return "EMPRESA";
    if (beneficiarioVinculado && gasto.pagadorBeneficiarioId === beneficiarioVinculado.id) {
      return "YO";
    }
    return "OTRO";
  });

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
      <Card className="enter max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          {gasto ? "Editar gasto" : "Nuevo gasto"}
        </h2>

        <form action={formAction} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha">
              <input
                name="fecha"
                type="date"
                required
                defaultValue={gasto ? gasto.fecha.slice(0, 10) : hoy}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              />
            </Campo>
            <Campo label="Monto">
              <input
                name="monto"
                type="number"
                step="0.01"
                min="0.01"
                required
                defaultValue={gasto?.monto}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              />
            </Campo>
          </div>

          <Campo label="Descripción">
            <input
              name="descripcion"
              type="text"
              required
              defaultValue={gasto?.descripcion}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Categoría">
              <select
                name="categoria"
                required
                defaultValue={gasto?.categoria ?? ""}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_GASTO_LABEL[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Método de pago">
              <select
                name="metodoPago"
                required
                defaultValue={gasto?.metodoPago ?? ""}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {METODOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo label="¿Quién pagó?">
            <input type="hidden" name="quienPagoModo" value={quienPagoModo} />
            <div className="flex flex-wrap gap-1.5">
              <BotonModo activo={quienPagoModo === "EMPRESA"} onClick={() => setQuienPagoModo("EMPRESA")}>
                La empresa
              </BotonModo>
              <BotonModo
                activo={quienPagoModo === "YO"}
                disabled={!beneficiarioVinculado}
                onClick={() => setQuienPagoModo("YO")}
              >
                Yo pagué
              </BotonModo>
              <BotonModo activo={quienPagoModo === "OTRO"} onClick={() => setQuienPagoModo("OTRO")}>
                Otro beneficiario
              </BotonModo>
            </div>

            {quienPagoModo === "YO" && beneficiarioVinculado && (
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Se registrará como pagado por <strong>{beneficiarioVinculado.nombre}</strong>.
              </p>
            )}
            {!beneficiarioVinculado && (
              <p className="mt-1.5 text-xs text-[var(--muted)]">
                Este usuario no tiene un beneficiario de pago relacionado. Configúralo antes de
                generar la reposición.
              </p>
            )}
            {quienPagoModo === "OTRO" && (
              <select
                name="pagadorBeneficiarioId"
                required
                defaultValue={gasto?.pagadorBeneficiarioId ?? ""}
                className="mt-1.5 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {beneficiarios.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            )}
          </Campo>

          <Campo label="Proveedor (opcional)">
            <select
              name="proveedorBeneficiarioId"
              defaultValue={gasto?.proveedorBeneficiarioId ?? ""}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            >
              <option value="">Sin proveedor</option>
              {beneficiarios
                .filter((b) => b.tipo === "PROVEEDOR")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
            </select>
          </Campo>

          <Campo label="Tratamiento para cliente">
            <select
              name="tratamientoCliente"
              defaultValue={gasto?.tratamientoCliente ?? "NO_COBRABLE"}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            >
              {TRATAMIENTOS_CLIENTE.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Comentario (opcional)">
            <textarea
              name="comentario"
              rows={2}
              defaultValue={gasto?.comentario ?? undefined}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
            />
          </Campo>

          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            <input
              type="checkbox"
              name="requiereFactura"
              defaultChecked={gasto?.requiereFactura ?? false}
            />
            Requiere factura
          </label>

          <Campo label={gasto?.ticketUrl ? "Reemplazar ticket (opcional)" : "Ticket / foto"}>
            <input
              name="ticket"
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="w-full text-sm text-[var(--foreground)]"
            />
            {gasto?.ticketUrl && (
              <a
                href={gasto.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-[var(--brand)] hover:underline"
              >
                Ver ticket actual
              </a>
            )}
          </Campo>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : gasto ? "Guardar cambios" : "Guardar gasto"}
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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">{label}</label>
      {children}
    </div>
  );
}

function BotonModo({
  activo,
  disabled,
  onClick,
  children,
}: {
  activo: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40 ${
        activo
          ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]"
          : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}
