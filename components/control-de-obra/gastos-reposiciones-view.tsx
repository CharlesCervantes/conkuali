"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import { CATEGORIA_GASTO_LABEL } from "@/lib/control-de-obra/categorias-gasto";
import {
  crearReposicionAction,
  enviarReposicionARevisionAction,
  aprobarReposicionAction,
  rechazarReposicionAction,
  enviarGastoARevisionAction,
  aprobarGastoAction,
  rechazarGastoAction,
  type ReposicionFormState,
  type AprobarGastoFormState,
  type RechazarGastoFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import { FormularioGasto } from "./formulario-gasto";
import type { FilaGasto, DashboardGastos } from "@/lib/server/control-de-obra/gastos";
import type { FilaReposicion } from "@/lib/server/control-de-obra/reposiciones";

const METODO_PAGO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  TARJETA_DEBITO: "Tarjeta débito",
  TARJETA_CREDITO: "Tarjeta crédito",
};

const ESTATUS_GASTO_ESTILO: Record<string, string> = {
  BORRADOR: "bg-black/[0.05] text-[var(--muted)]",
  PENDIENTE_REVISION: "bg-amber-100 text-amber-800",
  APROBADO: "bg-emerald-100 text-emerald-700",
  RECHAZADO: "bg-red-100 text-red-700",
  CANCELADO: "bg-black/[0.05] text-[var(--muted)]",
};

const ESTATUS_GASTO_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  PENDIENTE_REVISION: "Pendiente de revisión",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  CANCELADO: "Cancelado",
};

const ESTATUS_REPOSICION_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  ENVIADA_REVISION: "Enviada a revisión",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

export function GastosReposicionesView({
  proyectoId,
  semanaId,
  gastos,
  reposiciones,
  beneficiarios,
  beneficiarioVinculado,
  dashboard,
  puedeAprobar,
  usuarioId,
}: {
  proyectoId: string;
  semanaId: string;
  gastos: FilaGasto[];
  reposiciones: FilaReposicion[];
  beneficiarios: { id: string; nombre: string; tipo: string }[];
  beneficiarioVinculado: { id: string; nombre: string } | null;
  dashboard: DashboardGastos;
  puedeAprobar: boolean;
  usuarioId: string;
}) {
  const [modalNuevoGasto, setModalNuevoGasto] = useState(false);
  const [gastoEditando, setGastoEditando] = useState<FilaGasto | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [rechazandoGasto, setRechazandoGasto] = useState<string | null>(null);
  const [rechazandoReposicion, setRechazandoReposicion] = useState<string | null>(null);

  const elegibles = gastos.filter(
    (g) => g.estatus === "APROBADO" && !g.reposicionGastosId && g.pagadorBeneficiarioId
  );
  const pagadorSeleccionado =
    seleccionados.size > 0
      ? (elegibles.find((g) => seleccionados.has(g.id))?.pagadorBeneficiarioId ?? null)
      : null;
  const totalSeleccionado = elegibles
    .filter((g) => seleccionados.has(g.id))
    .reduce((t, g) => t + g.monto, 0);

  function alternarSeleccion(gasto: FilaGasto) {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(gasto.id)) {
        nuevo.delete(gasto.id);
      } else {
        nuevo.add(gasto.id);
      }
      return nuevo;
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Indicador etiqueta="Capturados" valor={dashboard.capturados} />
        <Indicador
          etiqueta="Pendientes de revisión"
          valor={dashboard.pendientesRevision}
          resaltar={dashboard.pendientesRevision > 0}
        />
        <Indicador etiqueta="Aprobados" valor={dashboard.aprobados} />
        <Indicador etiqueta="Total aprobado" valor={formatMoney(dashboard.totalAprobado)} />
        <Indicador
          etiqueta="Reposiciones pendientes"
          valor={reposiciones.filter((r) => r.estatus === "ENVIADA_REVISION").length}
        />
        <Indicador
          etiqueta="Reposiciones aprobadas"
          valor={reposiciones.filter((r) => r.estatus === "APROBADA").length}
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Gastos</h2>
        <Button onClick={() => setModalNuevoGasto(true)}>+ Nuevo gasto</Button>
      </div>

      {gastos.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay gastos capturados esta semana.
        </Card>
      ) : (
        <div className="space-y-3">
          {gastos.map((g) => {
            const puedeSeleccionar =
              g.estatus === "APROBADO" &&
              !g.reposicionGastosId &&
              g.pagadorBeneficiarioId &&
              (pagadorSeleccionado === null || pagadorSeleccionado === g.pagadorBeneficiarioId);
            const puedeEditar =
              (g.estatus === "BORRADOR" || g.estatus === "PENDIENTE_REVISION") &&
              (g.capturadoPorId === usuarioId || puedeAprobar);

            return (
              <Card key={g.id} className="enter p-4">
                <div className="flex items-start gap-3">
                  {puedeSeleccionar && (
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={seleccionados.has(g.id)}
                      onChange={() => alternarSeleccion(g)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[var(--foreground)]">{g.descripcion}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTATUS_GASTO_ESTILO[g.estatus]}`}
                      >
                        {ESTATUS_GASTO_LABEL[g.estatus]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {formatearFecha(new Date(g.fecha))} ·{" "}
                      {CATEGORIA_GASTO_LABEL[g.categoria as keyof typeof CATEGORIA_GASTO_LABEL] ??
                        g.categoria}{" "}
                      · {METODO_PAGO_LABEL[g.metodoPago] ?? g.metodoPago}
                      {g.pagadorNombre && ` · Pagó: ${g.pagadorNombre}`}
                      {g.proveedorNombre && ` · Proveedor: ${g.proveedorNombre}`}
                    </p>
                    {g.comentario && (
                      <p className="mt-1 text-sm text-[var(--muted)]">{g.comentario}</p>
                    )}
                    {g.motivoRechazo && (
                      <p className="mt-1 text-sm text-red-700">Rechazado: {g.motivoRechazo}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {g.ticketUrl && (
                        <a
                          href={g.ticketUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--brand)] hover:underline"
                        >
                          Ver ticket
                        </a>
                      )}
                      {g.requiereFactura && (
                        <span className="text-[var(--muted)]">
                          Factura: {g.estatusFiscal === "FACTURADO" ? "recibida" : "pendiente"}
                        </span>
                      )}
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => setGastoEditando(g)}
                          className="text-[var(--brand)] hover:underline"
                        >
                          Editar
                        </button>
                      )}
                      {g.estatus === "BORRADOR" && puedeEditar && (
                        <button
                          type="button"
                          onClick={() => enviarGastoARevisionAction(proyectoId, g.id)}
                          className="text-[var(--brand)] hover:underline"
                        >
                          Enviar a revisión
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-[var(--foreground)]">
                      {formatMoney(g.monto)}
                    </p>
                    {g.estatus === "PENDIENTE_REVISION" && puedeAprobar && (
                      <div className="mt-2 flex flex-col items-end gap-1">
                        <BotonAprobarGasto proyectoId={proyectoId} gastoId={g.id} />
                        <button
                          type="button"
                          onClick={() => setRechazandoGasto(g.id)}
                          className="text-xs font-medium text-red-700 hover:underline"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {seleccionados.size > 0 && pagadorSeleccionado && (
        <Card className="enter sticky bottom-4 flex items-center justify-between p-4 ring-2 ring-emerald-200">
          <p className="text-sm text-[var(--foreground)]">
            {seleccionados.size} gasto{seleccionados.size === 1 ? "" : "s"} seleccionado
            {seleccionados.size === 1 ? "" : "s"} · {formatMoney(totalSeleccionado)}
          </p>
          <FormularioGenerarReposicion
            proyectoId={proyectoId}
            semanaId={semanaId}
            beneficiarioId={pagadorSeleccionado}
            gastoIds={[...seleccionados]}
            onDone={() => setSeleccionados(new Set())}
          />
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">Reposiciones</h2>
        {reposiciones.length === 0 ? (
          <Card className="p-6 text-sm text-[var(--muted)]">
            Todavía no hay reposiciones generadas esta semana.
          </Card>
        ) : (
          <div className="space-y-3">
            {reposiciones.map((r) => (
              <Card key={r.id} className="enter p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--foreground)]">
                      {r.folio} · {r.beneficiarioNombre}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {r.cantidadGastos} gasto{r.cantidadGastos === 1 ? "" : "s"} ·{" "}
                      {ESTATUS_REPOSICION_LABEL[r.estatus]}
                      {r.estatusPago && ` · Pago: ${r.estatusPago}`}
                    </p>
                    {r.motivoRechazo && (
                      <p className="mt-1 text-sm text-red-700">Rechazada: {r.motivoRechazo}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
                      {formatMoney(r.total)}
                    </p>
                    {r.estatus === "BORRADOR" && (
                      <button
                        type="button"
                        onClick={() => enviarReposicionARevisionAction(proyectoId, r.id)}
                        className="text-sm font-medium text-[var(--brand)] hover:underline"
                      >
                        Enviar a revisión
                      </button>
                    )}
                    {r.estatus === "ENVIADA_REVISION" && puedeAprobar && (
                      <div className="flex items-center gap-2">
                        <BotonAprobarReposicion proyectoId={proyectoId} reposicionId={r.id} />
                        <button
                          type="button"
                          onClick={() => setRechazandoReposicion(r.id)}
                          className="text-sm font-medium text-red-700 hover:underline"
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {(modalNuevoGasto || gastoEditando) && (
        <FormularioGasto
          proyectoId={proyectoId}
          semanaId={semanaId}
          beneficiarios={beneficiarios}
          beneficiarioVinculado={beneficiarioVinculado}
          gasto={gastoEditando}
          onClose={() => {
            setModalNuevoGasto(false);
            setGastoEditando(null);
          }}
        />
      )}

      {rechazandoGasto && (
        <ModalMotivoRechazo
          titulo="Rechazar gasto"
          proyectoId={proyectoId}
          idParaAccion={rechazandoGasto}
          accion={rechazarGastoAction}
          onClose={() => setRechazandoGasto(null)}
        />
      )}

      {rechazandoReposicion && (
        <ModalMotivoRechazo
          titulo="Rechazar reposición"
          proyectoId={proyectoId}
          idParaAccion={rechazandoReposicion}
          accion={rechazarReposicionAction}
          onClose={() => setRechazandoReposicion(null)}
        />
      )}
    </div>
  );
}

function Indicador({
  etiqueta,
  valor,
  resaltar,
}: {
  etiqueta: string;
  valor: string | number;
  resaltar?: boolean;
}) {
  return (
    <Card className="p-3">
      <p className="text-[11px] text-[var(--muted)]">{etiqueta}</p>
      <p
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          resaltar ? "text-amber-600" : "text-[var(--foreground)]"
        }`}
      >
        {valor}
      </p>
    </Card>
  );
}

function BotonAprobarGasto({ proyectoId, gastoId }: { proyectoId: string; gastoId: string }) {
  const action = aprobarGastoAction.bind(null, proyectoId, gastoId);
  const [state, formAction, pending] = useActionState<AprobarGastoFormState, FormData>(
    action,
    undefined
  );
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Aprobando…" : "Aprobar"}
      </button>
      {state?.error && <p className="mt-1 text-[10px] text-red-700">{state.error}</p>}
    </form>
  );
}

function BotonAprobarReposicion({
  proyectoId,
  reposicionId,
}: {
  proyectoId: string;
  reposicionId: string;
}) {
  const action = aprobarReposicionAction.bind(null, proyectoId, reposicionId);
  const [state, formAction, pending] = useActionState<ReposicionFormState, FormData>(
    action,
    undefined
  );
  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50"
      >
        {pending ? "Aprobando…" : "Aprobar"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-red-700">{state.error}</p>}
    </form>
  );
}

function FormularioGenerarReposicion({
  proyectoId,
  semanaId,
  beneficiarioId,
  gastoIds,
  onDone,
}: {
  proyectoId: string;
  semanaId: string;
  beneficiarioId: string;
  gastoIds: string[];
  onDone: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const resultado = await crearReposicionAction(
            proyectoId,
            semanaId,
            beneficiarioId,
            gastoIds
          );
          setPending(false);
          if (resultado?.error) {
            setError(resultado.error);
          } else {
            onDone();
          }
        }}
      >
        {pending ? "Generando…" : "Generar reposición"}
      </Button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

function ModalMotivoRechazo({
  titulo,
  proyectoId,
  idParaAccion,
  accion,
  onClose,
}: {
  titulo: string;
  proyectoId: string;
  idParaAccion: string;
  accion: (
    proyectoId: string,
    id: string,
    state: RechazarGastoFormState | ReposicionFormState,
    formData: FormData
  ) => Promise<RechazarGastoFormState | ReposicionFormState>;
  onClose: () => void;
}) {
  const bound = accion.bind(null, proyectoId, idParaAccion);
  const [state, formAction, pending] = useActionState<
    RechazarGastoFormState | ReposicionFormState,
    FormData
  >(bound, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state && !state.error) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{titulo}</h2>
        <form action={formAction} className="mt-4 space-y-3">
          <textarea
            name="motivo"
            rows={3}
            required
            placeholder="Motivo del rechazo"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Rechazar"}
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
