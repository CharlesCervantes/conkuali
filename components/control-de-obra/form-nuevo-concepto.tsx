"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearConceptoAction, type FormState } from "@/app/(app)/control-de-obra/[id]/actions";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

export function FormNuevoConcepto({
  partidaId,
  proyectoId,
  esquemaContractual,
  puedeVerPrivado,
}: {
  partidaId: string;
  proyectoId: string;
  esquemaContractual: EsquemaContractual | null;
  puedeVerPrivado: boolean;
}) {
  const action = crearConceptoAction.bind(null, partidaId, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  const esPrecioAlzado = esquemaContractual === "PRECIO_ALZADO";
  const esAdministracion = esquemaContractual === "ADMINISTRACION";

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Input name="descripcion" required placeholder="Descripción" />
        <Input name="unidad" required placeholder="Unidad (m², ml…)" />
        <Input
          name="cantidadContratada"
          required
          type="number"
          step="0.001"
          min="0"
          placeholder="Cantidad total"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Contrato General
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Input
            name="precioUnitarioContratista"
            type="number"
            step="0.01"
            min="0"
            placeholder="P.U. contratista (presupuesto)"
          />
          <Input
            name="precioUnitarioMateriales"
            type="number"
            step="0.01"
            min="0"
            placeholder="P.U. materiales (presupuesto)"
          />
        </div>
      </div>

      {puedeVerPrivado && (
        <div className="border-t border-[var(--border)] pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Contrato General Privado
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            {esPrecioAlzado && (
              <>
                <Input
                  name="precioUnitarioIndirectos"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="P.U. indirectos"
                />
                <Input
                  name="precioUnitarioHerramienta"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="P.U. herramienta"
                />
              </>
            )}
            {esPrecioAlzado && (
              <Input
                name="porcentajeUtilidad"
                type="number"
                step="0.01"
                min="0"
                placeholder="% utilidad (usa el default si se deja vacío)"
              />
            )}
            {esAdministracion && (
              <Input
                name="porcentajeAdministracion"
                type="number"
                step="0.01"
                min="0"
                placeholder="% administración (usa el default si se deja vacío)"
              />
            )}
            <Input
              name="precioUnitarioClienteOverride"
              type="number"
              step="0.01"
              min="0"
              placeholder="Precio comercial final (opcional)"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Guardando…" : "Guardar concepto"}
        </Button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
