"use client";

import { useActionState, useState } from "react";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/dinero";
import { ModalEditarConcepto } from "./modal-editar-concepto";
import {
  editarConceptoPrivadoAction,
  type EditarConceptoPrivadoFormState,
} from "@/app/(app)/control-de-obra/[id]/actions";
import type { ImportesConceptoCalculados } from "@/lib/control-de-obra/contrato-general";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

// Plano y sin Decimal a propósito — ver contrato-general-privado-view.tsx
// (el server component que arma esto) para el porqué.
export type ConceptoPrivado = {
  id: string;
  descripcion: string;
  unidad: string;
  cantidad: number;
  descripcionPrivado: string | null;
  unidadPrivado: string | null;
  cantidadContratadaPrivado: number | null;
  precioUnitarioContratista: number | null;
  precioUnitarioContratistaPrivado: number | null;
  precioUnitarioIndirectos: number | null;
  precioUnitarioHerramienta: number | null;
  porcentajeUtilidad: number | null;
  porcentajeAdministracion: number | null;
  precioUnitarioClienteOverride: number | null;
};

export function TablaPrivadaEditable({
  proyectoId,
  conceptos,
  esquemaContractual,
  mostrarIndirectosHerramienta,
}: {
  proyectoId: string;
  conceptos: { concepto: ConceptoPrivado; importes: ImportesConceptoCalculados }[];
  esquemaContractual: EsquemaContractual | null;
  mostrarIndirectosHerramienta: boolean;
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [conceptoModalId, setConceptoModalId] = useState<string | null>(null);

  return (
    <>
      <Table>
        <Thead>
          <Tr>
            <Th>Concepto</Th>
            {mostrarIndirectosHerramienta && <Th className="text-right">Indirectos</Th>}
            {mostrarIndirectosHerramienta && <Th className="text-right">Herramienta</Th>}
            <Th className="text-right">%</Th>
            <Th className="text-right">P.U. recomendado</Th>
            <Th className="text-right">P.U. cliente</Th>
            <Th className="text-right">Importe</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <tbody>
          {conceptos.map(({ concepto, importes }) =>
            editandoId === concepto.id ? (
              <Tr key={concepto.id}>
                <Td colSpan={mostrarIndirectosHerramienta ? 7 : 5} className="bg-[var(--brand)]/[0.02]">
                  <FormEditarConceptoPrivado
                    proyectoId={proyectoId}
                    concepto={concepto}
                    esquemaContractual={esquemaContractual}
                    onCancelar={() => setEditandoId(null)}
                    onGuardado={() => setEditandoId(null)}
                  />
                </Td>
              </Tr>
            ) : (
              <Tr
                key={concepto.id}
                onClick={() => setConceptoModalId(concepto.id)}
                title="Clic para editar el concepto"
                className="cursor-pointer transition-colors duration-150 ease-out hover:bg-[var(--brand)]/[0.05]"
              >
                <Td className="font-medium">{concepto.descripcion}</Td>
                {mostrarIndirectosHerramienta && (
                  <Td className="text-right tabular-nums text-[var(--muted)]">
                    {formatMoney(importes.costoIndirectos)}
                  </Td>
                )}
                {mostrarIndirectosHerramienta && (
                  <Td className="text-right tabular-nums text-[var(--muted)]">
                    {formatMoney(importes.costoHerramienta)}
                  </Td>
                )}
                <Td className="text-right tabular-nums text-[var(--muted)]">
                  {importes.porcentajeAplicado !== null
                    ? `${importes.porcentajeAplicado.toLocaleString("es-MX")}%`
                    : "—"}
                </Td>
                <Td className="text-right tabular-nums text-[var(--muted)]">
                  {formatMoney(importes.precioUnitarioRecomendado)}
                </Td>
                <Td className="text-right tabular-nums">
                  <span className={importes.tieneOverride ? "font-semibold" : ""}>
                    {formatMoney(importes.precioUnitarioCliente)}
                  </span>
                  {importes.tieneOverride && (
                    <span className="ml-1.5 text-xs text-[var(--muted)]">(comercial)</span>
                  )}
                </Td>
                <Td className="text-right font-medium tabular-nums">
                  {formatMoney(importes.importeTotal)}
                </Td>
                <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setEditandoId(concepto.id)}
                    className="text-xs font-medium text-[var(--brand)] transition-colors duration-150 ease-out hover:underline"
                  >
                    Editar
                  </button>
                </Td>
              </Tr>
            )
          )}
        </tbody>
      </Table>

      {conceptoModalId && (
        <ModalEditarConcepto
          proyectoId={proyectoId}
          conceptoId={conceptoModalId}
          modo="privado"
          onClose={() => setConceptoModalId(null)}
        />
      )}
    </>
  );
}

function FormEditarConceptoPrivado({
  proyectoId,
  concepto,
  esquemaContractual,
  onCancelar,
  onGuardado,
}: {
  proyectoId: string;
  concepto: ConceptoPrivado;
  esquemaContractual: EsquemaContractual | null;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const action = editarConceptoPrivadoAction.bind(null, concepto.id, proyectoId);
  const [state, formAction, pending] = useActionState<
    EditarConceptoPrivadoFormState,
    FormData
  >(action, undefined);
  const [stateAnterior, setStateAnterior] = useState(state);
  if (state !== stateAnterior) {
    setStateAnterior(state);
    if (state?.guardado) onGuardado();
  }

  const esPrecioAlzado = esquemaContractual === "PRECIO_ALZADO";
  const esAdministracion = esquemaContractual === "ADMINISTRACION";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="descripcionPrivado" value={concepto.descripcionPrivado ?? ""} />
      <input type="hidden" name="unidadPrivado" value={concepto.unidadPrivado ?? ""} />
      <input
        type="hidden"
        name="cantidadContratadaPrivado"
        value={concepto.cantidadContratadaPrivado ?? ""}
      />
      <p className="text-sm font-medium text-[var(--foreground)]">{concepto.descripcion}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CampoPrivado
          label="P.U."
          name="precioUnitarioContratistaPrivado"
          defaultValue={concepto.precioUnitarioContratistaPrivado ?? concepto.precioUnitarioContratista}
        />
        {esPrecioAlzado && (
          <>
            <CampoPrivado
              label="P.U. indirectos"
              name="precioUnitarioIndirectos"
              defaultValue={concepto.precioUnitarioIndirectos}
            />
            <CampoPrivado
              label="P.U. herramienta"
              name="precioUnitarioHerramienta"
              defaultValue={concepto.precioUnitarioHerramienta}
            />
            <CampoPrivado
              label="% utilidad"
              name="porcentajeUtilidad"
              defaultValue={concepto.porcentajeUtilidad}
              placeholder="Usa el default si se deja vacío"
            />
          </>
        )}
        {esAdministracion && (
          <CampoPrivado
            label="% administración"
            name="porcentajeAdministracion"
            defaultValue={concepto.porcentajeAdministracion}
            placeholder="Usa el default si se deja vacío"
          />
        )}
        <CampoPrivado
          label="Precio comercial final"
          name="precioUnitarioClienteOverride"
          defaultValue={concepto.precioUnitarioClienteOverride}
          placeholder="Opcional — si no, se usa el recomendado"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Guardando…" : "Guardar"}
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

function CampoPrivado({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue: number | null;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</label>
      <Input
        name={name}
        type="number"
        step="0.01"
        min="0"
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
      />
    </div>
  );
}
