import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

// Nada de esto se guarda calculado — siempre se deriva en lectura a partir de
// los componentes de costo del Concepto (docs/negocio/04-modulo-control-de-obra.md,
// sección 49.9).

export type CostosConcepto = {
  precioUnitarioContratista: number | null;
  // Copia editable propia de Contrato General Privado — null = todavía no se
  // editó aquí, se usa igual al de Contrato General (precioUnitarioContratista).
  // Una vez editada, es independiente: nunca se sincroniza de vuelta
  // (decisión de sesión, agosto 2026).
  precioUnitarioContratistaPrivado: number | null;
  precioUnitarioMateriales: number | null;
  precioUnitarioIndirectos: number | null;
  precioUnitarioHerramienta: number | null;
  porcentajeUtilidad: number | null;
  porcentajeAdministracion: number | null;
};

export type PorcentajesDefaultProyecto = {
  utilidad: number | null;
  administracion: number | null;
};

export type PrecioConceptoCalculado = {
  // Indirectos/Herramienta se ignoran si el esquema es ADMINISTRACION, aunque
  // el concepto tuviera algo capturado ahí (dato residual de un cambio de
  // esquema, por ejemplo) — el esquema del proyecto manda.
  costoContratista: number;
  costoMateriales: number;
  costoIndirectos: number;
  costoHerramienta: number;
  costoBase: number;
  porcentajeAplicado: number | null;
  montoPorcentaje: number;
  precioUnitarioRecomendado: number;
};

export type ImportesConceptoCalculados = PrecioConceptoCalculado & {
  cantidad: number;
  importeContratista: number;
  importeMateriales: number;
  importeIndirectos: number;
  importeHerramienta: number;
  importeUtilidadOAdministracion: number;
  importeTotal: number; // cantidad × precioUnitarioRecomendado
  subtotalOperativo: number; // cantidad × (contratista + materiales) — lo que ve Supervisor
};

// Extiende calcularPrecioConcepto multiplicando por la cantidad total del
// concepto — para subtotales de partida y total de contrato.
export function calcularImportesConcepto(
  concepto: CostosConcepto & { cantidadContratada: number },
  esquema: EsquemaContractual | null,
  porcentajesDefault: PorcentajesDefaultProyecto
): ImportesConceptoCalculados {
  const precios = calcularPrecioConcepto(concepto, esquema, porcentajesDefault);
  const cantidad = concepto.cantidadContratada;

  return {
    ...precios,
    cantidad,
    importeContratista: precios.costoContratista * cantidad,
    importeMateriales: precios.costoMateriales * cantidad,
    importeIndirectos: precios.costoIndirectos * cantidad,
    importeHerramienta: precios.costoHerramienta * cantidad,
    importeUtilidadOAdministracion: precios.montoPorcentaje * cantidad,
    importeTotal: precios.precioUnitarioRecomendado * cantidad,
    subtotalOperativo: (precios.costoContratista + precios.costoMateriales) * cantidad,
  };
}

export function calcularPrecioConcepto(
  concepto: CostosConcepto,
  esquema: EsquemaContractual | null,
  porcentajesDefault: PorcentajesDefaultProyecto
): PrecioConceptoCalculado {
  // Contrato General Privado calcula sobre su propia copia editable del P.U.
  // cuando existe — nunca sobre precioUnitarioContratista directamente, para
  // que editar aquí no le pase nada al Contrato General original (esta
  // función solo la usa la vista Privada — ver contrato-general-privado-view.tsx).
  const costoContratista =
    concepto.precioUnitarioContratistaPrivado ?? concepto.precioUnitarioContratista ?? 0;
  const esPrecioAlzado = esquema === "PRECIO_ALZADO";
  // Materiales presupuestados solo aplica como componente de Precio Alzado —
  // en Administración el costo de materiales vendrá de gasto real (otro
  // módulo, todavía no implementado), no de este presupuesto (precisión de
  // sesión, agosto 2026).
  const costoMateriales = esPrecioAlzado ? (concepto.precioUnitarioMateriales ?? 0) : 0;
  const costoIndirectos = esPrecioAlzado ? (concepto.precioUnitarioIndirectos ?? 0) : 0;
  const costoHerramienta = esPrecioAlzado ? (concepto.precioUnitarioHerramienta ?? 0) : 0;
  const costoBase = costoContratista + costoMateriales + costoIndirectos + costoHerramienta;

  const porcentajeAplicado =
    esquema === "ADMINISTRACION"
      ? (concepto.porcentajeAdministracion ?? porcentajesDefault.administracion)
      : (concepto.porcentajeUtilidad ?? porcentajesDefault.utilidad);

  const montoPorcentaje = costoBase * ((porcentajeAplicado ?? 0) / 100);
  const precioUnitarioRecomendado = costoBase + montoPorcentaje;

  return {
    costoContratista,
    costoMateriales,
    costoIndirectos,
    costoHerramienta,
    costoBase,
    porcentajeAplicado,
    montoPorcentaje,
    precioUnitarioRecomendado,
  };
}
