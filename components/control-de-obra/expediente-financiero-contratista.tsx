"use client";

import { useActionState, useState } from "react";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/dinero";
import { EstadoPagoBadge } from "@/components/reporte-general/estado-pago-badge";
import { DetalleCorteModal } from "./detalle-corte-modal";
import {
  generarReciboAction,
  type GenerarReciboFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type {
  ResumenFinancieroContratista,
  CorteHistorial,
} from "@/lib/server/control-de-obra/recibos";

// Los cuatro indicadores del resumen financiero — separado de
// EstimacionesYPagos para que contratistas-view.tsx pueda ponerlo dentro del
// <summary> del acordeón (siempre visible, incluso con la tarjeta cerrada)
// mientras que Estimaciones y pagos vive en el cuerpo (solo visible al
// expandir). Ninguno de los dos repite el gate de puedeVerRecibosFinancieros
// — ya lo decidió el caller (contratistas-view.tsx).
export function ResumenFinancieroIndicadores({
  resumen,
}: {
  resumen: ResumenFinancieroContratista;
}) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Dato etiqueta="Contrato vigente" valor={formatMoney(resumen.contratoVigente)} />
      <Dato etiqueta="Estimado acumulado" valor={formatMoney(resumen.estimadoAcumulado)} />
      <Dato etiqueta="Pagado acumulado" valor={formatMoney(resumen.pagadoAcumulado)} />
      <Dato
        etiqueta="Saldo contractual"
        valor={formatMoney(resumen.saldoContractual)}
        resaltar={resumen.saldoContractual < 0}
      />
    </dl>
  );
}

// Historial de cortes de un contratista — vive en el cuerpo del acordeón
// (contratistas-view.tsx), solo visible con la tarjeta abierta. "Ver
// recibo"/"Generar" son botones/links propios, nunca dentro del <summary>,
// así que un clic ahí nunca cierra el acordeón accidentalmente.
export function EstimacionesYPagos({
  proyectoId,
  historial,
}: {
  proyectoId: string;
  historial: CorteHistorial[];
}) {
  const [corteDetalleId, setCorteDetalleId] = useState<string | null>(null);

  return (
    <div>
      <p className="mb-3 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        Estimaciones y pagos
      </p>
      {historial.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Aún no hay estimaciones generadas.</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Semana</Th>
              <Th>Corte</Th>
              <Th className="text-right">Importe</Th>
              <Th>Estado de pago</Th>
              <Th>Recibo</Th>
            </Tr>
          </Thead>
          <tbody>
            {historial.map((corte) => (
              <Tr key={corte.id}>
                <Td>
                  <button
                    type="button"
                    onClick={() => setCorteDetalleId(corte.id)}
                    className="font-medium text-[var(--brand)] transition-colors duration-150 ease-out hover:underline"
                  >
                    Semana {corte.semanaNumero}
                  </button>
                </Td>
                <Td className="text-[var(--muted)]">{String(corte.numero).padStart(3, "0")}</Td>
                <Td className="text-right tabular-nums">{formatMoney(corte.montoNeto)}</Td>
                <Td>
                  <EstadoPagoBadge estatus={corte.estatusPago} />
                </Td>
                <Td>
                  <AccionRecibo proyectoId={proyectoId} corte={corte} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {corteDetalleId && (
        <DetalleCorteModal
          corteId={corteDetalleId}
          proyectoId={proyectoId}
          onClose={() => setCorteDetalleId(null)}
        />
      )}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  resaltar,
}: {
  etiqueta: string;
  valor: string;
  resaltar?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{etiqueta}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          resaltar ? "text-red-600" : "text-[var(--foreground)]"
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

function AccionRecibo({
  proyectoId,
  corte,
}: {
  proyectoId: string;
  corte: CorteHistorial;
}) {
  const action = generarReciboAction.bind(null, corte.id, proyectoId);
  const [state, formAction, pending] = useActionState<GenerarReciboFormState, FormData>(
    action,
    undefined
  );

  if (corte.reciboVigenteId) {
    return (
      <a
        href={`/api/control-de-obra/proyectos/${proyectoId}/recibos/${corte.reciboVigenteId}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-[var(--brand)] hover:underline"
      >
        Ver{corte.reciboVigenteFirmado ? " (firmado)" : ""}
      </a>
    );
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-[var(--brand)] transition-colors duration-150 ease-out hover:underline disabled:opacity-50"
      >
        {pending ? "Generando…" : "Generar"}
      </button>
      {state?.error && <p className="mt-0.5 text-[10px] text-red-700">{state.error}</p>}
    </form>
  );
}
