"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import {
  categoriasParaAmbito,
  CATEGORIA_GASTO_LABEL,
  type AmbitoGasto,
} from "@/lib/control-de-obra/categorias-gasto";
import {
  crearGastoRecurrenteAction,
  editarGastoRecurrenteAction,
  cambiarEstatusGastoRecurrenteAction,
  type GastoRecurrenteFormState,
} from "@/app/(app)/gastos/actions";
import type { FilaGastoRecurrente } from "@/lib/server/control-de-obra/gastos-recurrentes";

const FRECUENCIA_LABEL: Record<string, string> = {
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
};

export function GastosRecurrentesView({
  recurrentes,
  proyectosDisponibles,
  beneficiarios,
}: {
  recurrentes: FilaGastoRecurrente[];
  proyectosDisponibles: { id: string; nombre: string }[];
  beneficiarios: { id: string; nombre: string; tipo: string }[];
}) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<FilaGastoRecurrente | null>(null);

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-[var(--border)] p-0">
        {recurrentes.length === 0 ? (
          <p className="p-5 text-sm text-[var(--muted)]">Todavía no hay gastos recurrentes configurados.</p>
        ) : (
          recurrentes.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">{r.descripcion}</p>
                  {!r.activo && (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {r.destinoNombre} · {CATEGORIA_GASTO_LABEL[r.categoria as keyof typeof CATEGORIA_GASTO_LABEL] ?? r.categoria} ·{" "}
                  {FRECUENCIA_LABEL[r.frecuencia]} ·{" "}
                  {r.montoFijo !== null ? formatMoney(r.montoFijo) : "Monto variable"}
                  {r.pagadorNombre && ` · Paga: ${r.pagadorNombre}`} · desde{" "}
                  {formatearFecha(new Date(r.fechaInicio))}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditando(r)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => cambiarEstatusGastoRecurrenteAction(r.id, !r.activo)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {r.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      {creando || editando ? (
        <Card className="enter p-5">
          <FormularioGastoRecurrente
            recurrente={editando}
            proyectosDisponibles={proyectosDisponibles}
            beneficiarios={beneficiarios}
            onCancelar={() => {
              setCreando(false);
              setEditando(null);
            }}
          />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out hover:bg-black/[0.03]"
        >
          + Nuevo gasto recurrente
        </button>
      )}
    </div>
  );
}

function FormularioGastoRecurrente({
  recurrente,
  proyectosDisponibles,
  beneficiarios,
  onCancelar,
}: {
  recurrente: FilaGastoRecurrente | null;
  proyectosDisponibles: { id: string; nombre: string }[];
  beneficiarios: { id: string; nombre: string; tipo: string }[];
  onCancelar: () => void;
}) {
  const action = recurrente
    ? editarGastoRecurrenteAction.bind(null, recurrente.id)
    : crearGastoRecurrenteAction;
  const [state, formAction, pending] = useActionState<GastoRecurrenteFormState, FormData>(
    action,
    undefined
  );
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onCancelar();
  }

  const [destino, setDestino] = useState<"proyecto" | "empresa">(
    recurrente ? (recurrente.esEmpresa ? "empresa" : "proyecto") : "proyecto"
  );
  const ambito: AmbitoGasto = destino === "empresa" ? "empresa" : "obra";
  const categorias = categoriasParaAmbito(ambito);

  return (
    <form action={formAction} className="space-y-3">
      {!recurrente && (
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Destino</label>
          <input type="hidden" name="destino" value={destino} />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setDestino("proyecto")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${destino === "proyecto" ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : "border-[var(--border)] text-[var(--muted)]"}`}
            >
              Proyecto / Obra
            </button>
            <button
              type="button"
              onClick={() => setDestino("empresa")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${destino === "empresa" ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : "border-[var(--border)] text-[var(--muted)]"}`}
            >
              Empresa
            </button>
          </div>
        </div>
      )}
      {recurrente && recurrente.esEmpresa ? (
        <input type="hidden" name="proyectoId" value={recurrente.proyectoId} />
      ) : (!recurrente && destino === "proyecto") || (recurrente && !recurrente.esEmpresa) ? (
        <select
          name="proyectoId"
          required
          defaultValue={recurrente?.proyectoId ?? ""}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        >
          <option value="" disabled>
            Selecciona un proyecto…
          </option>
          {proyectosDisponibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      ) : null}

      <input
        name="descripcion"
        placeholder="Descripción (ej. Nómina — Andrés)"
        required
        defaultValue={recurrente?.descripcion ?? ""}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      />

      <div className="grid grid-cols-2 gap-3">
        <select
          name="categoria"
          required
          defaultValue={recurrente?.categoria ?? ""}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        >
          <option value="" disabled>
            Categoría…
          </option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_GASTO_LABEL[c]}
            </option>
          ))}
        </select>
        <select
          name="frecuencia"
          required
          defaultValue={recurrente?.frecuencia ?? ""}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        >
          <option value="" disabled>
            Frecuencia…
          </option>
          <option value="SEMANAL">Semanal</option>
          <option value="QUINCENAL">Quincenal</option>
          <option value="MENSUAL">Mensual</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <input
            name="montoFijo"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Monto fijo (vacío = variable)"
            defaultValue={recurrente?.montoFijo ?? ""}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Vacío: cada ocurrencia nace en borrador, pendiente de capturar el monto real.
          </p>
        </div>
        <input
          name="fechaInicio"
          type="date"
          required
          defaultValue={recurrente ? recurrente.fechaInicio.slice(0, 10) : new Date().toISOString().slice(0, 10)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        />
      </div>

      <select
        name="pagadorBeneficiarioId"
        defaultValue=""
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      >
        <option value="">La empresa paga directo (sin reposición)</option>
        {beneficiarios.map((b) => (
          <option key={b.id} value={b.id}>
            {b.nombre}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : recurrente ? "Guardar cambios" : "Crear recurrente"}
        </Button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
        >
          Cancelar
        </button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
