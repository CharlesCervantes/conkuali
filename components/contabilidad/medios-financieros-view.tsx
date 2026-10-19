"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  crearMedioFinancieroAction,
  editarMedioFinancieroAction,
  cambiarEstatusMedioFinancieroAction,
  type ContabilidadFormState,
} from "@/app/(app)/contabilidad/actions";
import { formatMoney } from "@/lib/dinero";
import type { MedioFinancieroConSaldo } from "@/lib/server/contabilidad/saldos";

const TIPO_LABEL: Record<string, string> = {
  BANCO: "Banco",
  TARJETA: "Tarjeta",
  EFECTIVO: "Efectivo",
};

// Aviso neutral cuando el servidor no envía saldos actuales (C3) — nunca
// explica el motivo.
const AVISO_SALDO_RESTRINGIDO = "Saldo no disponible para tu usuario. Consulta con el administrador de la Empresa.";

export function MediosFinancierosView({
  medios,
  saldosRestringidos,
}: {
  medios: MedioFinancieroConSaldo[];
  saldosRestringidos: boolean;
}) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<MedioFinancieroConSaldo | null>(null);

  return (
    <div className="space-y-4">
      {saldosRestringidos && medios.length > 0 && (
        <p className="rounded-lg border border-[var(--border)] bg-black/[0.03] px-4 py-3 text-sm text-[var(--muted)]">
          {AVISO_SALDO_RESTRINGIDO}
        </p>
      )}
      <Card className="divide-y divide-[var(--border)] p-0">
        {medios.length === 0 ? (
          <p className="p-5 text-sm text-[var(--muted)]">Todavía no hay cuentas/medios configurados.</p>
        ) : (
          medios.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">{m.nombre}</p>
                  {!m.activo && (
                    <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {TIPO_LABEL[m.tipo] ?? m.tipo}
                  {m.numeroCuentaEnmascarado && ` · ${m.numeroCuentaEnmascarado}`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {m.saldoActual === null ? (
                  <p className="text-right text-sm text-[var(--muted)]" title={AVISO_SALDO_RESTRINGIDO}>
                    —
                  </p>
                ) : (
                  <p className="text-right text-sm font-semibold tabular-nums text-[var(--foreground)]">
                    {formatMoney(m.saldoActual)}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setEditando(m)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => cambiarEstatusMedioFinancieroAction(m.id, !m.activo)}
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  {m.activo ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      {creando || editando ? (
        <Card className="enter p-5">
          <FormularioMedioFinanciero
            medio={editando}
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
          + Nueva cuenta / medio
        </button>
      )}
    </div>
  );
}

function FormularioMedioFinanciero({
  medio,
  onCancelar,
}: {
  medio: MedioFinancieroConSaldo | null;
  onCancelar: () => void;
}) {
  const action = medio ? editarMedioFinancieroAction.bind(null, medio.id) : crearMedioFinancieroAction;
  const [state, formAction, pending] = useActionState<ContabilidadFormState, FormData>(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onCancelar();
  }

  return (
    <form action={formAction} className="space-y-3">
      <input
        name="nombre"
        placeholder="Nombre (ej. BBVA — Cuenta fiscal)"
        required
        defaultValue={medio?.nombre ?? ""}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      />
      <select
        name="tipo"
        required
        defaultValue={medio?.tipo ?? ""}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      >
        <option value="" disabled>
          Tipo…
        </option>
        <option value="BANCO">Banco</option>
        <option value="TARJETA">Tarjeta</option>
        <option value="EFECTIVO">Efectivo</option>
      </select>
      <input
        name="numeroCuentaEnmascarado"
        placeholder="Últimos 4 dígitos (opcional)"
        maxLength={4}
        defaultValue={medio?.numeroCuentaEnmascarado ?? ""}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--muted)]">Saldo inicial</label>
          <input
            name="saldoInicial"
            type="number"
            step="0.01"
            defaultValue={medio?.saldoInicial ?? 0}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Fecha de saldo inicial</label>
          <input
            name="fechaSaldoInicial"
            type="date"
            defaultValue={medio?.fechaSaldoInicial ? medio.fechaSaldoInicial.slice(0, 10) : ""}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : medio ? "Guardar cambios" : "Crear"}
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
