"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoDinero } from "@/components/ui/campo-dinero";
import { crearConceptoAction, type FormState } from "@/app/(app)/control-de-obra/[id]/actions";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

// Solo campos operativos (Contrato General) — descripción, unidad, cantidad,
// P.U., y P.U. materiales cuando aplica (Precio Alzado). Los campos privados
// (Indirectos, Herramienta, %, precio comercial) ya no se capturan aquí — se
// definen desde Contrato General Priv., una vez creado el concepto (sección
// 13 del rediseño, agosto 2026: "la separación debe ser real por pestaña").
export function FormNuevoConcepto({
  partidaId,
  proyectoId,
  esquemaContractual,
}: {
  partidaId: string;
  proyectoId: string;
  esquemaContractual: EsquemaContractual | null;
}) {
  const action = crearConceptoAction.bind(null, partidaId, proyectoId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined
  );

  const esPrecioAlzado = esquemaContractual === "PRECIO_ALZADO";

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <CampoDinero name="precioUnitarioContratista" placeholder="P.U. (presupuesto)" />
        {esPrecioAlzado && (
          <CampoDinero name="precioUnitarioMateriales" placeholder="P.U. materiales (presupuesto)" />
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Guardando…" : "Guardar concepto"}
        </Button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
