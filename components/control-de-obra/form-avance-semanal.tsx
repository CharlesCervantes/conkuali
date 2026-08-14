"use client";

import { useActionState, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BarraAvance } from "./barra-avance";
import { EstatusAprobacionAvanceBadge } from "./estatus-aprobacion-avance-badge";
import { useDirtyAvance } from "./dirty-avance-context";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/dinero";
import { Prisma } from "@/lib/generated/prisma/browser";
import {
  guardarAvanceAction,
  cambiarEstatusAprobacionAvanceAction,
  type AvanceFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type { obtenerAvanceSemanal } from "@/lib/server/control-de-obra/avance";

type Partidas = Awaited<ReturnType<typeof obtenerAvanceSemanal>>;
type ConceptoConAvance = Partidas[number]["conceptos"][number];

function formatCantidad(valor: InstanceType<typeof Prisma.Decimal> | number): string {
  const n = typeof valor === "number" ? valor : valor.toNumber();
  return n.toLocaleString("es-MX", { maximumFractionDigits: 3 });
}

function valorInicial(concepto: ConceptoConAvance): string {
  return concepto.estaSemana > 0 ? formatCantidad(concepto.estaSemana) : "";
}

export function FormAvanceSemanal({
  proyectoId,
  semanaId,
  partidas,
  puedeAprobar,
}: {
  proyectoId: string;
  semanaId: string;
  partidas: Partidas;
  puedeAprobar: boolean;
}) {
  return (
    <div className="space-y-3">
      {partidas.length === 0 && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay partidas en este proyecto. Créalas primero en Partidas de
          obra.
        </Card>
      )}

      {partidas.map((partida, i) => (
        <PartidaAvance
          key={partida.id}
          proyectoId={proyectoId}
          semanaId={semanaId}
          partida={partida}
          puedeAprobar={puedeAprobar}
          indiceEntrada={i}
        />
      ))}
    </div>
  );
}

function PartidaAvance({
  proyectoId,
  semanaId,
  partida,
  puedeAprobar,
  indiceEntrada,
}: {
  proyectoId: string;
  semanaId: string;
  partida: Partidas[number];
  puedeAprobar: boolean;
  indiceEntrada: number;
}) {
  const action = guardarAvanceAction.bind(null, proyectoId, semanaId);
  const [state, formAction, pending] = useActionState<AvanceFormState, FormData>(
    action,
    undefined
  );
  const { marcarPartida } = useDirtyAvance();

  const [baseline, setBaseline] = useState<Record<string, string>>(() =>
    Object.fromEntries(partida.conceptos.map((c) => [c.id, valorInicial(c)]))
  );
  const [valores, setValores] = useState<Record<string, string>>(baseline);

  const conceptosModificados = partida.conceptos.filter(
    (c) => (valores[c.id] ?? "") !== (baseline[c.id] ?? "")
  );
  const dirty = conceptosModificados.length > 0;

  useEffect(() => {
    marcarPartida(partida.id, dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, partida.id]);

  // Al desmontar (navegación confirmada, etc.) no dejar la partida marcada.
  useEffect(() => {
    return () => marcarPartida(partida.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partida.id]);

  // Al terminar un guardado exitoso, el baseline pasa a ser lo recién
  // guardado — se ajusta durante el render (no en un efecto) siguiendo el
  // patrón de React para "adaptar estado cuando cambia una prop/valor".
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardados !== undefined && !state.error) {
      setBaseline(valores);
    }
  }

  function actualizarValor(conceptoId: string, nuevaCantidad: string) {
    setValores((prev) => ({ ...prev, [conceptoId]: nuevaCantidad }));
  }

  const conMovimiento = partida.conceptos.filter((c) => c.estaSemana > 0).length;

  return (
    <Card
      className="enter overflow-hidden"
      style={{ transitionDelay: `${Math.min(indiceEntrada, 6) * 30}ms` }}
    >
      <details>
        <summary className="group flex cursor-pointer list-none items-center justify-between px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-[var(--foreground)]">
            {partida.nombre}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {partida.conceptos.length} concepto
            {partida.conceptos.length === 1 ? "" : "s"}
            {conMovimiento > 0 && ` · ${conMovimiento} con movimiento esta semana`}
          </span>
        </summary>

        <div className="border-t border-[var(--border)] px-5 py-4">
          {partida.conceptos.length === 0 ? (
            <p className="py-2 text-sm text-[var(--muted)]">
              Esta partida todavía no tiene conceptos.
            </p>
          ) : (
            <form action={formAction}>
              <Table>
                <Thead>
                  <Tr>
                    <Th rowSpan={2} className="align-bottom">Concepto</Th>
                    <Th rowSpan={2} className="align-bottom">Unidad</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Total contratado</Th>
                    <Th rowSpan={2} className="text-right align-bottom">
                      P.U. Contratista
                    </Th>
                    <Th rowSpan={2} className="text-right align-bottom">Anterior</Th>
                    <Th colSpan={2} className="text-center bg-[var(--brand)]/[0.04]">
                      Esta semana
                    </Th>
                    <Th rowSpan={2} className="text-right align-bottom">Acumulado</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Pendiente</Th>
                    <Th rowSpan={2} className="text-right align-bottom">Avance</Th>
                    <Th rowSpan={2} className="align-bottom">Estado</Th>
                  </Tr>
                  <Tr>
                    <Th className="text-right bg-[var(--brand)]/[0.04]">Cantidad</Th>
                    <Th className="text-right bg-[var(--brand)]/[0.04]">Monto</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {partida.conceptos.map((concepto) => (
                    <FilaConcepto
                      key={concepto.id}
                      proyectoId={proyectoId}
                      semanaId={semanaId}
                      concepto={concepto}
                      valor={valores[concepto.id] ?? ""}
                      onCambiar={(v) => actualizarValor(concepto.id, v)}
                      puedeAprobar={puedeAprobar}
                    />
                  ))}
                </tbody>
              </Table>

              {dirty ? (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
                  {state?.error && (
                    <p className="enter text-sm text-red-700">{state.error}</p>
                  )}
                  <span className="text-sm text-[var(--muted)]">
                    Cambios sin guardar: {conceptosModificados.length} concepto
                    {conceptosModificados.length === 1 ? "" : "s"}
                  </span>
                  <Button type="submit" disabled={pending}>
                    {pending ? "Guardando…" : "Guardar cambios"}
                  </Button>
                </div>
              ) : (
                state?.guardados !== undefined &&
                !state.error && (
                  <p className="enter mt-3 text-right text-sm text-emerald-700">
                    Guardado ✓
                  </p>
                )
              )}
            </form>
          )}
        </div>
      </details>
    </Card>
  );
}

function calcularTextoMonto(
  textoCantidad: string,
  precio: number | null
): string {
  if (!precio || textoCantidad === "") return "";
  return new Prisma.Decimal(textoCantidad || 0)
    .times(precio)
    .toDecimalPlaces(2)
    .toString();
}

function FilaConcepto({
  proyectoId,
  semanaId,
  concepto,
  valor,
  onCambiar,
  puedeAprobar,
}: {
  proyectoId: string;
  semanaId: string;
  concepto: ConceptoConAvance;
  valor: string;
  onCambiar: (nuevaCantidad: string) => void;
  puedeAprobar: boolean;
}) {
  const cantidadActual = new Prisma.Decimal(valor || 0);
  const anterior = new Prisma.Decimal(concepto.anterior);
  const total = new Prisma.Decimal(concepto.cantidadTotal);
  const acumulado = anterior.plus(cantidadActual);
  const pendiente = total.minus(acumulado);
  const avancePorcentaje = total.gt(0)
    ? acumulado.div(total).times(100).toNumber()
    : 0;
  const excede = acumulado.gt(total);

  const precio = concepto.precioUnitarioContratistaContratado;
  const tienePrecio = precio !== null;

  // El input de Monto tiene su propio texto — si se derivara de `valor` en
  // cada render (cantidad × precio), el redondeo a 3 decimales de la
  // cantidad reescribiría el monto en cada tecleo y el usuario nunca podría
  // terminar de escribir. Solo se resincroniza cuando la cantidad cambió por
  // OTRA vía (el input de Cantidad, o un cambio de semana) — nunca cuando el
  // cambio vino de este mismo campo.
  const [cantidadSincronizada, setCantidadSincronizada] = useState(valor);
  const [textoMonto, setTextoMonto] = useState(() => calcularTextoMonto(valor, precio));
  const [montoEnfocado, setMontoEnfocado] = useState(false);

  if (valor !== cantidadSincronizada) {
    setCantidadSincronizada(valor);
    setTextoMonto(calcularTextoMonto(valor, precio));
  }

  function alCambiarCantidad(texto: string) {
    onCambiar(texto);
  }

  function alCambiarMonto(textoCrudo: string) {
    if (!tienePrecio || precio === null) return;
    // Deja escribir libremente — incluso números a medio terminar (ej. "12.").
    const texto = textoCrudo.replace(/[^0-9.]/g, "");
    setTextoMonto(texto);

    if (texto === "") {
      setCantidadSincronizada("");
      onCambiar("");
      return;
    }
    if (texto === "." || Number.isNaN(Number(texto))) {
      return; // número incompleto — espera a que termine de escribir
    }

    // Aritmética con Decimal exacta (no float de JS) — la cantidad
    // resultante se redondea al mismo límite de precisión que el resto del
    // sistema (Concepto.cantidadContratada / ContratoConcepto.cantidad = 3
    // decimales).
    const nuevaCantidad = new Prisma.Decimal(texto)
      .div(precio)
      .toDecimalPlaces(3)
      .toString();
    setCantidadSincronizada(nuevaCantidad);
    onCambiar(nuevaCantidad);
  }

  return (
    <Tr>
      <Td className="font-medium">{concepto.descripcion}</Td>
      <Td className="text-[var(--muted)]">{concepto.unidad}</Td>
      <Td className="text-right tabular-nums">{formatCantidad(concepto.cantidadTotal)}</Td>
      <Td className="text-right tabular-nums text-[var(--muted)]">
        {precio !== null ? formatMoney(precio) : "—"}
      </Td>
      <Td className="text-right tabular-nums text-[var(--muted)]">
        {formatCantidad(concepto.anterior)}
      </Td>
      <Td className="bg-[var(--brand)]/[0.02]">
        <input
          type="number"
          name={`cantidad_${concepto.id}`}
          min={0}
          step="0.001"
          value={valor}
          onChange={(e) => alCambiarCantidad(e.target.value)}
          placeholder="0"
          className={cn(
            "w-24 rounded-md border bg-[var(--surface)] px-2.5 py-1.5 text-right text-sm tabular-nums text-[var(--foreground)] transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/15",
            excede
              ? "border-red-300 focus:border-red-400"
              : "border-[var(--border)] focus:border-[var(--brand)]"
          )}
        />
      </Td>
      <Td className="bg-[var(--brand)]/[0.02]">
        {tienePrecio ? (
          <input
            type="text"
            inputMode="decimal"
            value={
              montoEnfocado
                ? textoMonto
                : textoMonto === ""
                  ? ""
                  : formatMoney(textoMonto)
            }
            onFocus={() => setMontoEnfocado(true)}
            onBlur={() => setMontoEnfocado(false)}
            onChange={(e) => alCambiarMonto(e.target.value)}
            placeholder="$0.00"
            className={cn(
              "w-28 rounded-md border bg-[var(--surface)] px-2.5 py-1.5 text-right text-sm tabular-nums text-[var(--foreground)] transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/15",
              excede
                ? "border-red-300 focus:border-red-400"
                : "border-[var(--border)] focus:border-[var(--brand)]"
            )}
          />
        ) : (
          <span className="block text-right text-sm text-[var(--muted)]">—</span>
        )}
      </Td>
      <Td className="text-right font-medium tabular-nums">{formatCantidad(acumulado)}</Td>
      <Td
        className={cn(
          "text-right tabular-nums",
          excede ? "text-red-700" : "text-[var(--muted)]"
        )}
      >
        {excede ? `Excede ${formatCantidad(pendiente.abs())}` : formatCantidad(pendiente)}
      </Td>
      <Td>
        <BarraAvance porcentaje={avancePorcentaje} />
      </Td>
      <Td>
        <div className="space-y-1">
          <EstatusAprobacionAvanceBadge estatus={concepto.estatusAprobacion} />
          {puedeAprobar && concepto.estatusAprobacion === "PENDIENTE" && (
            <ControlesAprobacion
              proyectoId={proyectoId}
              conceptoId={concepto.id}
              semanaId={semanaId}
            />
          )}
        </div>
      </Td>
    </Tr>
  );
}

// Botones en línea, no un desplegable: dentro de una tabla ancha con scroll
// horizontal un <details>/absolute quedaba recortado por el contenedor con
// overflow (había que hacer scroll para verlo). Además, un <form> aquí no
// puede anidarse dentro del <form> grande de captura de la partida — un
// <form> dentro de otro <form> es HTML inválido y el navegador lo descarta en
// silencio, por eso los botones no hacían nada. Se invoca la Server Action
// directamente, sin <form>.
function ControlesAprobacion({
  proyectoId,
  conceptoId,
  semanaId,
}: {
  proyectoId: string;
  conceptoId: string;
  semanaId: string;
}) {
  const [enviando, setEnviando] = useState(false);

  async function cambiarEstatus(nuevoEstatus: "APROBADO" | "RECHAZADO") {
    setEnviando(true);
    try {
      await cambiarEstatusAprobacionAvanceAction(
        proyectoId,
        conceptoId,
        semanaId,
        nuevoEstatus
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={enviando}
        onClick={() => cambiarEstatus("APROBADO")}
        className="text-[11px] font-medium text-emerald-700 transition-colors duration-150 ease-out hover:underline disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="button"
        disabled={enviando}
        onClick={() => cambiarEstatus("RECHAZADO")}
        className="text-[11px] font-medium text-red-700 transition-colors duration-150 ease-out hover:underline disabled:opacity-50"
      >
        Rechazar
      </button>
    </div>
  );
}
