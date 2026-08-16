"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import {
  obtenerConceptoDetalleAction,
  editarConceptoEstructuralAction,
  editarConceptoPrivadoAction,
  type ConceptoDetalle,
  type BitacoraEntrada,
  type EditarConceptoEstructuralFormState,
  type EditarConceptoPrivadoFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";

const ETIQUETA_ACCION: Record<string, string> = {
  CREAR: "Creó el concepto",
  EDITAR: "Editó el concepto",
  CAMBIAR_ESTATUS: "Cambió el estatus",
  CONFIRMAR: "Aprobó",
  RECHAZAR: "Rechazó",
  ACTIVAR: "Activó",
  DESACTIVAR: "Desactivó",
};

// Etiquetas en español de cada campo de Concepto que puede aparecer en un
// snapshot de bitácora (valorAnterior/valorNuevo) — solo los campos listados
// aquí se consideran al calcular qué cambió; el resto (id, partidaId,
// createdAt, updatedAt, orden, codigo) se ignora a propósito.
const ETIQUETAS_CAMPO: Record<string, string> = {
  descripcion: "Descripción",
  unidad: "Unidad",
  cantidadContratada: "Cantidad",
  notas: "Notas",
  precioUnitarioContratista: "P.U.",
  precioUnitarioMateriales: "P.U. materiales",
  descripcionPrivado: "Descripción (Priv.)",
  unidadPrivado: "Unidad (Priv.)",
  cantidadContratadaPrivado: "Cantidad (Priv.)",
  precioUnitarioContratistaPrivado: "P.U. (Priv.)",
  precioUnitarioIndirectos: "P.U. indirectos",
  precioUnitarioHerramienta: "P.U. herramienta",
  porcentajeUtilidad: "% utilidad",
  porcentajeAdministracion: "% administración",
  estatus: "Estatus",
};

const CAMPOS_MONEDA = new Set([
  "precioUnitarioContratista",
  "precioUnitarioMateriales",
  "precioUnitarioContratistaPrivado",
  "precioUnitarioIndirectos",
  "precioUnitarioHerramienta",
]);
const CAMPOS_PORCENTAJE = new Set(["porcentajeUtilidad", "porcentajeAdministracion"]);
const CAMPOS_CANTIDAD = new Set(["cantidadContratada", "cantidadContratadaPrivado"]);
const ETIQUETA_ESTATUS: Record<string, string> = { ACTIVO: "Activo", CANCELADO: "Cancelado" };

function formatValorCampo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (campo === "estatus") return ETIQUETA_ESTATUS[String(valor)] ?? String(valor);
  if (CAMPOS_MONEDA.has(campo)) return formatMoney(Number(valor));
  if (CAMPOS_PORCENTAJE.has(campo)) return `${Number(valor).toLocaleString("es-MX")}%`;
  if (CAMPOS_CANTIDAD.has(campo)) {
    return Number(valor).toLocaleString("es-MX", { maximumFractionDigits: 3 });
  }
  return String(valor);
}

type CambioCampo = { campo: string; etiqueta: string; anterior: string; nuevo: string };

// Compara los snapshots completos de antes/después campo por campo y regresa
// solo los que de verdad cambiaron — así una acción "operativo" nunca muestra
// ruido de campos privados (son idénticos en ambos snapshots) y viceversa,
// sin necesidad de casos especiales por tipo de acción.
function calcularCambios(
  anterior: Record<string, unknown> | null,
  nuevo: Record<string, unknown> | null
): CambioCampo[] {
  if (!anterior || !nuevo) return [];
  const cambios: CambioCampo[] = [];
  for (const campo of Object.keys(ETIQUETAS_CAMPO)) {
    if (!(campo in anterior) || !(campo in nuevo)) continue;
    const valorAnterior = anterior[campo] ?? null;
    const valorNuevo = nuevo[campo] ?? null;
    if (String(valorAnterior ?? "") === String(valorNuevo ?? "")) continue;
    cambios.push({
      campo,
      etiqueta: ETIQUETAS_CAMPO[campo],
      anterior: formatValorCampo(campo, valorAnterior),
      nuevo: formatValorCampo(campo, valorNuevo),
    });
  }
  return cambios;
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Dos modos reales, cada uno con su propia acción de guardado — abrir desde
// Contrato General nunca debe mostrar ni poder tocar nada de Privado, y
// viceversa (decisión de sesión, agosto 2026).
export function ModalEditarConcepto({
  proyectoId,
  conceptoId,
  modo,
  onClose,
}: {
  proyectoId: string;
  conceptoId: string;
  modo: "operativo" | "privado";
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<
    | { tipo: "cargando" }
    | { tipo: "error"; mensaje: string }
    | { tipo: "listo"; concepto: ConceptoDetalle; bitacora: BitacoraEntrada[] }
  >({ tipo: "cargando" });

  useEffect(() => {
    let cancelado = false;
    obtenerConceptoDetalleAction(conceptoId).then((resultado) => {
      if (cancelado) return;
      if ("error" in resultado) {
        setEstado({ tipo: "error", mensaje: resultado.error });
      } else {
        setEstado({ tipo: "listo", concepto: resultado.concepto, bitacora: resultado.bitacora });
      }
    });
    return () => {
      cancelado = true;
    };
  }, [conceptoId]);

  useEffect(() => {
    function alTecla(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTecla);
    return () => document.removeEventListener("keydown", alTecla);
  }, [onClose]);

  // Portal a document.body: la tarjeta de la partida usa la clase de
  // animación .enter (transform: translateY(...)), y cualquier ancestro con
  // transform se vuelve el "containing block" de un descendiente
  // position:fixed — sin el portal, el modal quedaba atrapado dentro de esa
  // tarjeta en vez de cubrir toda la pantalla.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="enter max-h-[85vh] w-full max-w-4xl overflow-y-auto p-6">
        {estado.tipo === "cargando" && (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Cargando…</p>
        )}
        {estado.tipo === "error" && (
          <>
            <p className="py-4 text-sm text-red-700">{estado.mensaje}</p>
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </>
        )}
        {estado.tipo === "listo" &&
          (modo === "operativo" ? (
            <FormularioOperativo
              proyectoId={proyectoId}
              concepto={estado.concepto}
              bitacora={estado.bitacora}
              onClose={onClose}
            />
          ) : (
            <FormularioPrivado
              proyectoId={proyectoId}
              concepto={estado.concepto}
              bitacora={estado.bitacora}
              onClose={onClose}
            />
          ))}
      </Card>
    </div>,
    document.body
  );
}

function Encabezado({ titulo, partidaNombre, onClose }: { titulo: string; partidaNombre: string; onClose: () => void }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{titulo}</h2>
        <p className="mt-0.5 text-xs font-medium text-[var(--muted)]">
          Partida: <span className="text-[var(--foreground)]">{partidaNombre}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
      >
        ✕
      </button>
    </div>
  );
}

function Bitacora({ bitacora }: { bitacora: BitacoraEntrada[] }) {
  return (
    <div className="mt-6 border-t border-[var(--border)] pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Bitácora
      </p>
      {bitacora.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Sin eventos registrados.</p>
      ) : (
        <ul className="space-y-3">
          {bitacora.map((entrada) => {
            const cambios = calcularCambios(entrada.valorAnterior, entrada.valorNuevo);
            return (
              <li key={entrada.id} className="text-xs">
                <p className="text-[var(--muted)]">
                  <span className="font-medium text-[var(--foreground)]">
                    {entrada.usuarioNombre ?? "Usuario eliminado"}
                  </span>{" "}
                  — {ETIQUETA_ACCION[entrada.accion] ?? entrada.accion} ·{" "}
                  {formatFecha(entrada.createdAt)}
                </p>
                {cambios.length > 0 && (
                  <ul className="mt-1 space-y-0.5 border-l-2 border-[var(--border)] pl-2.5">
                    {cambios.map((cambio) => (
                      <li key={cambio.campo} className="text-[var(--muted)]">
                        <span className="text-[var(--foreground)]">{cambio.etiqueta}:</span>{" "}
                        {cambio.anterior} → {cambio.nuevo}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Modo operativo (Contrato General) — SOLO descripción, unidad, cantidad,
// P.U., P.U. materiales y notas. Nunca muestra ni envía nada de Privado.
function FormularioOperativo({
  proyectoId,
  concepto,
  bitacora,
  onClose,
}: {
  proyectoId: string;
  concepto: ConceptoDetalle;
  bitacora: BitacoraEntrada[];
  onClose: () => void;
}) {
  const action = editarConceptoEstructuralAction.bind(null, concepto.id, proyectoId);
  const [state, formAction, pending] = useActionState<
    EditarConceptoEstructuralFormState,
    FormData
  >(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onClose();
  }

  const esPrecioAlzado = concepto.esquemaContractual === "PRECIO_ALZADO";

  return (
    <div>
      <Encabezado titulo="Editar concepto — Contrato General" partidaNombre={concepto.partidaNombre} onClose={onClose} />

      <form action={formAction} className="space-y-4">
        <Campo label="Descripción" name="descripcion" defaultValue={concepto.descripcion} required />

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Unidad" name="unidad" defaultValue={concepto.unidad} required />
          <Campo
            label="Cantidad"
            name="cantidadContratada"
            type="number"
            step="0.001"
            min="0"
            defaultValue={concepto.cantidadContratada}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="P.U."
            name="precioUnitarioContratista"
            type="number"
            step="0.01"
            min="0"
            defaultValue={concepto.precioUnitarioContratista ?? undefined}
          />
          {esPrecioAlzado && (
            <Campo
              label="P.U. materiales"
              name="precioUnitarioMateriales"
              type="number"
              step="0.01"
              min="0"
              defaultValue={concepto.precioUnitarioMateriales ?? undefined}
            />
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Notas
          </label>
          <textarea
            name="notas"
            rows={2}
            defaultValue={concepto.notas ?? undefined}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
          >
            Cancelar
          </button>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        </div>
      </form>

      <Bitacora bitacora={bitacora} />
    </div>
  );
}

// Modo privado (Contrato General Priv.) — descripción/unidad/cantidad/P.U.
// propios de esta capa (nacen iguales a los de Contrato General, luego son
// independientes), más Indirectos/Herramienta/%/override. Nunca envía nada
// de Contrato General operativo.
function FormularioPrivado({
  proyectoId,
  concepto,
  bitacora,
  onClose,
}: {
  proyectoId: string;
  concepto: ConceptoDetalle;
  bitacora: BitacoraEntrada[];
  onClose: () => void;
}) {
  const action = editarConceptoPrivadoAction.bind(null, concepto.id, proyectoId);
  const [state, formAction, pending] = useActionState<
    EditarConceptoPrivadoFormState,
    FormData
  >(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onClose();
  }

  const esPrecioAlzado = concepto.esquemaContractual === "PRECIO_ALZADO";
  const esAdministracion = concepto.esquemaContractual === "ADMINISTRACION";

  return (
    <div>
      <Encabezado titulo="Editar concepto — Contrato General Priv." partidaNombre={concepto.partidaNombre} onClose={onClose} />

      <form action={formAction} className="space-y-4">
        <Campo
          label="Descripción"
          name="descripcionPrivado"
          defaultValue={concepto.descripcionPrivado ?? concepto.descripcion}
          placeholder="Igual a Contrato General si se deja vacío"
        />

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Unidad"
            name="unidadPrivado"
            defaultValue={concepto.unidadPrivado ?? concepto.unidad}
            placeholder="Igual a Contrato General si se deja vacío"
          />
          <Campo
            label="Cantidad"
            name="cantidadContratadaPrivado"
            type="number"
            step="0.001"
            min="0"
            defaultValue={concepto.cantidadContratadaPrivado ?? concepto.cantidadContratada}
            placeholder="Igual a Contrato General si se deja vacío"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="P.U."
            name="precioUnitarioContratistaPrivado"
            type="number"
            step="0.01"
            min="0"
            defaultValue={concepto.precioUnitarioContratistaPrivado ?? concepto.precioUnitarioContratista ?? undefined}
            placeholder="Igual a Contrato General si se deja vacío"
          />
          {esPrecioAlzado && (
            <>
              <Campo
                label="P.U. indirectos"
                name="precioUnitarioIndirectos"
                type="number"
                step="0.01"
                min="0"
                defaultValue={concepto.precioUnitarioIndirectos ?? undefined}
              />
              <Campo
                label="P.U. herramienta"
                name="precioUnitarioHerramienta"
                type="number"
                step="0.01"
                min="0"
                defaultValue={concepto.precioUnitarioHerramienta ?? undefined}
              />
              <Campo
                label="% utilidad"
                name="porcentajeUtilidad"
                type="number"
                step="0.01"
                min="0"
                defaultValue={concepto.porcentajeUtilidad ?? undefined}
                placeholder="Usa el default si se deja vacío"
              />
            </>
          )}
          {esAdministracion && (
            <Campo
              label="% administración"
              name="porcentajeAdministracion"
              type="number"
              step="0.01"
              min="0"
              defaultValue={concepto.porcentajeAdministracion ?? undefined}
              placeholder="Usa el default si se deja vacío"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
          >
            Cancelar
          </button>
          {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        </div>
      </form>

      <Bitacora bitacora={bitacora} />
    </div>
  );
}

function Campo({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  step,
  min,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: string;
  step?: string;
  min?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <Input
        name={name}
        defaultValue={defaultValue}
        required={required}
        type={type}
        step={step}
        min={min}
        placeholder={placeholder}
      />
    </div>
  );
}
