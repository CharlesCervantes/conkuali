"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import {
  cambiarEstatusInteligenciaEmpresaAction,
  actualizarCapacidadInteligenciaEmpresaAction,
  actualizarLimiteInteligenciaEmpresaAction,
  type MasterFormState,
} from "@/app/master/actions";
import type { CapacidadInteligencia } from "@/lib/generated/prisma/client";
import type {
  ConfiguracionInteligenciaEmpresa,
  TipoRangoInteligencia,
  RangoInteligencia,
} from "@/lib/server/master/inteligencia";
import type { ResumenConsumoInteligencia, DesgloseCapacidad, ConsumoDiario } from "@/lib/server/inteligencia/consumo";

// Pestaña Master → Empresa → ARQENTO IA — administración de capacidades y
// límites, más dashboard de consumo (lectura, nunca escritura de datos de
// negocio). Solo Master ve esto (costos internos incluidos) — ver
// lib/server/master/inteligencia.ts (V1.3, octubre 2026).

const ETIQUETA_CAPACIDAD: Record<CapacidadInteligencia, string> = {
  ANALISIS_DOCUMENTAL_TEXTO: "Análisis documental con texto",
  ANALISIS_VISUAL: "Análisis visual de documentos",
};

const OPCIONES_RANGO: { valor: TipoRangoInteligencia; etiqueta: string }[] = [
  { valor: "ESTE_MES", etiqueta: "Este mes" },
  { valor: "MES_ANTERIOR", etiqueta: "Mes anterior" },
  { valor: "ULTIMOS_3_MESES", etiqueta: "Últimos 3 meses" },
  { valor: "PERSONALIZADO", etiqueta: "Rango personalizado" },
];

export function TabArqentoIA({
  empresaId,
  configuracion,
  dashboard,
  rango,
  tipoRango,
}: {
  empresaId: string;
  configuracion: ConfiguracionInteligenciaEmpresa;
  dashboard: { resumen: ResumenConsumoInteligencia; desglose: DesgloseCapacidad[]; diario: ConsumoDiario[] };
  rango: RangoInteligencia;
  tipoRango: TipoRangoInteligencia;
}) {
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">ARQENTO IA</p>
          <p className="text-xs text-[var(--muted)]">
            {configuracion.inteligenciaHabilitada
              ? "Esta empresa puede usar las capacidades de IA habilitadas abajo."
              : "Desactivado — ninguna capacidad de IA corre para esta empresa, sin importar su configuración individual."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => cambiarEstatusInteligenciaEmpresaAction(empresaId, !configuracion.inteligenciaHabilitada)}
        >
          {configuracion.inteligenciaHabilitada ? "Desactivar" : "Activar"}
        </Button>
      </Card>

      <Card className="divide-y divide-[var(--border)] p-0">
        <p className="px-5 py-3 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Capacidades</p>
        {(Object.keys(ETIQUETA_CAPACIDAD) as CapacidadInteligencia[]).map((capacidad) => (
          <div key={capacidad} className="flex items-center justify-between px-5 py-4">
            <p className="text-sm text-[var(--foreground)]">{ETIQUETA_CAPACIDAD[capacidad]}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                actualizarCapacidadInteligenciaEmpresaAction(empresaId, capacidad, !configuracion.capacidades[capacidad])
              }
            >
              {configuracion.capacidades[capacidad] ? "Desactivar" : "Activar"}
            </Button>
          </div>
        ))}
      </Card>

      <SelectorPeriodo tipoRango={tipoRango} />

      <ResumenConsumo resumen={dashboard.resumen} etiquetaPeriodo={rango.etiqueta} />

      <ConsumoDiarioGrafica diario={dashboard.diario} />

      <DesglosePorCapacidad desglose={dashboard.desglose} />

      <LimitesForm empresaId={empresaId} configuracion={configuracion} />
    </div>
  );
}

function SelectorPeriodo({ tipoRango }: { tipoRango: TipoRangoInteligencia }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [desde, setDesde] = useState(searchParams.get("desde") ?? "");
  const [hasta, setHasta] = useState(searchParams.get("hasta") ?? "");

  function navegar(params: Record<string, string | null>) {
    const nuevos = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(params)) {
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
    }
    router.push(`${pathname}?${nuevos.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg bg-black/[0.03] p-1">
        {OPCIONES_RANGO.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => navegar({ periodo: opcion.valor, desde: null, hasta: null })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out ${
              tipoRango === opcion.valor
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {tipoRango === "PERSONALIZADO" && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5"
          />
          <span className="text-[var(--muted)]">a</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5"
          />
          <button
            type="button"
            onClick={() => navegar({ periodo: "PERSONALIZADO", desde, hasta })}
            disabled={!desde || !hasta}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand-foreground)] disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

function Tile({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <p className="text-xs text-[var(--muted)]">{etiqueta}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--foreground)]">{valor}</p>
    </div>
  );
}

function ResumenConsumo({ resumen, etiquetaPeriodo }: { resumen: ResumenConsumoInteligencia; etiquetaPeriodo: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-[var(--foreground)]">Uso — {etiquetaPeriodo}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile etiqueta="Costo interno real" valor={formatMoney(resumen.costoTotal)} />
        <Tile etiqueta="Operaciones totales" valor={String(resumen.operacionesTotal)} />
        <Tile etiqueta="Documentos con texto" valor={String(resumen.documentosTexto)} />
        <Tile etiqueta="Documentos visuales" valor={String(resumen.documentosVisuales)} />
        <Tile etiqueta="Imágenes/páginas procesadas" valor={String(resumen.unidadesVisualesProcesadas)} />
        <Tile etiqueta="Tokens de entrada" valor={resumen.tokensEntrada.toLocaleString("es-MX")} />
        <Tile etiqueta="Tokens de salida" valor={resumen.tokensSalida.toLocaleString("es-MX")} />
        <Tile etiqueta="Operaciones exitosas" valor={String(resumen.operacionesExitosas)} />
        <Tile etiqueta="Operaciones con error" valor={String(resumen.operacionesConError)} />
        <Tile etiqueta="Costo promedio por operación" valor={formatMoney(resumen.costoPromedioPorOperacion)} />
      </div>
    </Card>
  );
}

// Barra simple en CSS puro — no hay librería de gráficas en el proyecto y no
// se justifica agregar una para una sola barra diaria (decisión de sesión,
// V1.3). Altura proporcional al máximo de la serie visible.
function ConsumoDiarioGrafica({ diario }: { diario: ConsumoDiario[] }) {
  if (diario.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold text-[var(--foreground)]">Consumo diario</p>
        <p className="mt-3 text-sm text-[var(--muted)]">Sin consumo registrado en este periodo.</p>
      </Card>
    );
  }

  const maximo = Math.max(...diario.map((d) => d.costoTotal), 0.000001);

  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-[var(--foreground)]">Consumo diario (costo interno)</p>
      <div className="mt-4 flex h-32 items-end gap-1 overflow-x-auto">
        {diario.map((d) => (
          <div
            key={d.dia}
            title={`${d.dia}: ${formatMoney(d.costoTotal)} · ${d.operaciones} operación(es)`}
            className="min-w-[10px] flex-1 rounded-t bg-[var(--brand)]/70 transition-colors hover:bg-[var(--brand)]"
            style={{ height: `${Math.max((d.costoTotal / maximo) * 100, 3)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
        <span>{diario[0]?.dia}</span>
        <span>{diario[diario.length - 1]?.dia}</span>
      </div>
    </Card>
  );
}

function DesglosePorCapacidad({ desglose }: { desglose: DesgloseCapacidad[] }) {
  return (
    <Card className="p-0">
      <p className="px-5 py-3 text-sm font-semibold text-[var(--foreground)]">Desglose por capacidad</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-[var(--border)] text-xs text-[var(--muted)]">
            <th className="px-5 py-2 text-left font-medium">Capacidad</th>
            <th className="px-5 py-2 text-right font-medium">Operaciones</th>
            <th className="px-5 py-2 text-right font-medium">Unidades</th>
            <th className="px-5 py-2 text-right font-medium">Costo</th>
          </tr>
        </thead>
        <tbody>
          {desglose.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-4 text-center text-[var(--muted)]">
                Sin consumo registrado en este periodo.
              </td>
            </tr>
          ) : (
            desglose.map((fila) => (
              <tr key={fila.capacidad} className="border-b border-[var(--border)] last:border-0">
                <td className="px-5 py-3 text-[var(--foreground)]">{ETIQUETA_CAPACIDAD[fila.capacidad]}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fila.operaciones}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fila.unidades}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatMoney(fila.costoTotal)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}

function LimitesForm({
  empresaId,
  configuracion,
}: {
  empresaId: string;
  configuracion: ConfiguracionInteligenciaEmpresa;
}) {
  const [state, formAction, pending] = useActionState<MasterFormState, FormData>(
    actualizarLimiteInteligenciaEmpresaAction.bind(null, empresaId),
    undefined
  );

  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-[var(--foreground)]">Límites</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Límite operativo de seguridad — número de operaciones de IA por mes, sin importar el tipo de operación. No
        es el futuro sistema comercial de ARQENTO IA (créditos/planes).
      </p>
      <form action={formAction} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--muted)]">Límite mensual (operaciones, vacío = sin límite)</label>
            <input
              name="limiteOperacionesMensual"
              type="number"
              min="1"
              step="1"
              defaultValue={configuracion.limiteOperacionesMensual ?? ""}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)]">% de alerta (informativo, vacío = sin alerta)</label>
            <input
              name="porcentajeAlerta"
              type="number"
              min="1"
              max="100"
              step="1"
              defaultValue={configuracion.porcentajeAlerta ?? ""}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-[var(--muted)]">Al alcanzar el límite</label>
          <select
            name="comportamientoLimite"
            defaultValue={configuracion.comportamientoLimite}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]"
          >
            <option value="SOLO_ALERTAR">Solo alertar — sigue permitiendo operaciones</option>
            <option value="BLOQUEAR">Bloquear nuevas solicitudes de IA</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
          {state?.guardado && <p className="text-sm text-emerald-700">Guardado.</p>}
        </div>
      </form>
    </Card>
  );
}
