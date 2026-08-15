"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  obtenerConceptoDetalleAction,
  editarConceptoCompletoAction,
  type ConceptoDetalle,
  type BitacoraEntrada,
  type EditarConceptoCompletoFormState,
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

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ModalEditarConcepto({
  proyectoId,
  conceptoId,
  onClose,
}: {
  proyectoId: string;
  conceptoId: string;
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
        {estado.tipo === "listo" && (
          <FormularioConcepto
            proyectoId={proyectoId}
            concepto={estado.concepto}
            bitacora={estado.bitacora}
            onClose={onClose}
          />
        )}
      </Card>
    </div>,
    document.body
  );
}

function FormularioConcepto({
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
  const action = editarConceptoCompletoAction.bind(null, concepto.id, proyectoId);
  const [state, formAction, pending] = useActionState<
    EditarConceptoCompletoFormState,
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Editar concepto</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
        >
          ✕
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        <p className="text-xs font-medium text-[var(--muted)]">
          Partida: <span className="text-[var(--foreground)]">{concepto.partidaNombre}</span>
        </p>

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

        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Contrato General
          </p>
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
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Contrato General Privado
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Campo
              label="P.U. (Contrato General Priv.)"
              name="precioUnitarioContratistaPrivado"
              type="number"
              step="0.01"
              min="0"
              defaultValue={concepto.precioUnitarioContratistaPrivado ?? undefined}
              placeholder="Igual al de Contrato General si se deja vacío"
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
            <Campo
              label="Precio comercial final"
              name="precioUnitarioClienteOverride"
              type="number"
              step="0.01"
              min="0"
              defaultValue={concepto.precioUnitarioClienteOverride ?? undefined}
              placeholder="Opcional — si no, se usa el recomendado"
            />
          </div>
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

      <div className="border-t border-[var(--border)] pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Bitácora
        </p>
        {bitacora.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Sin eventos registrados.</p>
        ) : (
          <ul className="space-y-2">
            {bitacora.map((entrada) => (
              <li key={entrada.id} className="text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">
                  {entrada.usuarioNombre ?? "Usuario eliminado"}
                </span>{" "}
                — {ETIQUETA_ACCION[entrada.accion] ?? entrada.accion} ·{" "}
                {formatFecha(entrada.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
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
