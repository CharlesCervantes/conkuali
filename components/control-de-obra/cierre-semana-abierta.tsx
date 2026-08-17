"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/dinero";
import {
  cerrarSemanaAction,
  type CerrarSemanaFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type { ResumenCierreSemana } from "@/lib/server/control-de-obra/cierre-semana";

// Bloque al final de Avance de obra — semana todavía abierta (nunca se
// cerró, o se reabrió). El botón dispara cerrarSemanaAction directamente; un
// confirm() nativo es suficiente pausa de seguridad para esta acción (a
// diferencia de Eliminar proyecto, es reversible vía Reabrir).
export function CierreSemanaAbierta({
  proyectoId,
  semanaId,
  numeroSemana,
  resumen,
  puedeCerrarSemana,
}: {
  proyectoId: string;
  semanaId: string;
  numeroSemana: number;
  resumen: ResumenCierreSemana;
  puedeCerrarSemana: boolean;
}) {
  const action = cerrarSemanaAction.bind(null, proyectoId, semanaId);
  const [state, formAction, pending] = useActionState<CerrarSemanaFormState, FormData>(
    action,
    undefined
  );

  const bloqueado = !resumen.puedeCerrar;

  return (
    <Card className="enter p-5">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        Cierre de semana
      </p>
      <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">
        Resumen de la semana {numeroSemana}
      </h3>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Dato etiqueta="Conceptos con avance" valor={resumen.conceptosConAvance} />
        <Dato etiqueta="Avances aprobados" valor={resumen.avancesAprobados} />
        <Dato
          etiqueta="Pendientes por aprobar"
          valor={resumen.pendientesPorAprobar}
          resaltar={resumen.pendientesPorAprobar > 0}
        />
        <Dato etiqueta="Contratistas involucrados" valor={resumen.contratistasInvolucrados} />
        <Dato
          etiqueta="Monto de mano de obra aprobado"
          valor={formatMoney(resumen.montoManoDeObraAprobado)}
        />
      </dl>

      {bloqueado && (
        <div className="mt-4 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {resumen.pendientesPorAprobar > 0 && (
            <p>
              Hay {resumen.pendientesPorAprobar} avance
              {resumen.pendientesPorAprobar === 1 ? "" : "s"} pendiente
              {resumen.pendientesPorAprobar === 1 ? "" : "s"} por aprobar. Apruébalo
              {resumen.pendientesPorAprobar === 1 ? "" : "s"} o recházalo
              {resumen.pendientesPorAprobar === 1 ? "" : "s"} antes de cerrar.
            </p>
          )}
          {resumen.conceptosSinContratista.length > 0 && (
            <p>
              Conceptos con avance aprobado sin contratista asignado:{" "}
              {resumen.conceptosSinContratista.map((c) => c.descripcion).join(", ")}.
            </p>
          )}
        </div>
      )}

      {puedeCerrarSemana && (
        <form action={formAction} className="mt-4">
          <Button
            type="submit"
            disabled={bloqueado || pending}
            onClick={(e) => {
              if (
                !window.confirm(
                  `¿Cerrar la semana ${numeroSemana}? Esto genera los cortes y movimientos de Reporte General de los contratistas con avance aprobado.`
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            {pending ? "Cerrando…" : `Cerrar semana ${numeroSemana}`}
          </Button>
          {state?.error && <p className="mt-2 text-sm text-red-700">{state.error}</p>}
        </form>
      )}
    </Card>
  );
}

function Dato({
  etiqueta,
  valor,
  resaltar,
}: {
  etiqueta: string;
  valor: string | number;
  resaltar?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{etiqueta}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          resaltar ? "text-amber-600" : "text-[var(--foreground)]"
        )}
      >
        {valor}
      </dd>
    </div>
  );
}
