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
  // Override privado de `administracion` (Proyecto.porcentajeAdministracionPrivadoDefault)
  // — null = el motor privado cae a `administracion` (el default operativo).
  // Solo lo usa calcularPrecioConcepto; calcularPrecioOperativoConcepto
  // nunca lo lee (agosto 2026).
  administracionPrivado: number | null;
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

// ---------------------------------------------------------------------------
// Motor operativo (Contrato General, NO privado) — Contratistas + Materiales
// (si Precio Alzado) + % Administración (que no es privado, a diferencia de
// % Utilidad — sección 49.9). Nunca incluye Indirectos/Herramienta/precio
// comercial, eso es exclusivo de calcularPrecioConcepto/Privado. Se calcula
// siempre sobre precioUnitarioContratista (nunca sobre el P.U. de Contrato
// General Privado). Compartido por ContratoGeneralView y por Cliente
// (operativo) — no duplicar esta fórmula en ninguno de los dos.
// ---------------------------------------------------------------------------

export type CostosOperativoConcepto = {
  precioUnitarioContratista: number | null;
  precioUnitarioMateriales: number | null;
  porcentajeAdministracion: number | null;
};

export type PrecioOperativoCalculado = {
  costoContratista: number;
  costoMateriales: number;
  subtotalPorUnidad: number; // contratista + materiales (si Precio Alzado)
  porcentajeAdministracionAplicado: number | null; // null si el esquema no es ADMINISTRACION
  montoAdministracionPorUnidad: number; // 0 si el esquema no es ADMINISTRACION
  precioUnitarioConAdministracion: number; // subtotalPorUnidad + montoAdministracionPorUnidad
};

export function calcularPrecioOperativoConcepto(
  concepto: CostosOperativoConcepto,
  esquema: EsquemaContractual | null,
  porcentajeAdministracionDefault: number | null
): PrecioOperativoCalculado {
  const esPrecioAlzado = esquema === "PRECIO_ALZADO";
  const esAdministracion = esquema === "ADMINISTRACION";

  const costoContratista = concepto.precioUnitarioContratista ?? 0;
  const costoMateriales = esPrecioAlzado ? (concepto.precioUnitarioMateriales ?? 0) : 0;
  const subtotalPorUnidad = costoContratista + costoMateriales;

  const porcentajeAdministracionAplicado = esAdministracion
    ? (concepto.porcentajeAdministracion ?? porcentajeAdministracionDefault)
    : null;
  // Base de administración = solo contratista, nunca materiales — aunque el
  // concepto tuviera materiales capturados (dato residual de otro esquema).
  const montoAdministracionPorUnidad = esAdministracion
    ? costoContratista * ((porcentajeAdministracionAplicado ?? 0) / 100)
    : 0;

  return {
    costoContratista,
    costoMateriales,
    subtotalPorUnidad,
    porcentajeAdministracionAplicado,
    montoAdministracionPorUnidad,
    precioUnitarioConAdministracion: subtotalPorUnidad + montoAdministracionPorUnidad,
  };
}

// Espejo de calcularImportesConcepto (motor privado) pero para el motor
// operativo — mismo patrón "× cantidad" para totales de contrato/proyecto,
// nunca una fórmula nueva (Control Contractual en Cliente normal, agosto
// 2026).
export type ImportesOperativoConceptoCalculados = PrecioOperativoCalculado & {
  cantidad: number;
  importeTotal: number; // cantidad × precioUnitarioConAdministracion
};

export function calcularImportesOperativoConcepto(
  concepto: CostosOperativoConcepto & { cantidadContratada: number },
  esquema: EsquemaContractual | null,
  porcentajeAdministracionDefault: number | null
): ImportesOperativoConceptoCalculados {
  const precio = calcularPrecioOperativoConcepto(concepto, esquema, porcentajeAdministracionDefault);
  const cantidad = concepto.cantidadContratada;

  return {
    ...precio,
    cantidad,
    importeTotal: precio.precioUnitarioConAdministracion * cantidad,
  };
}

// ---------------------------------------------------------------------------
// Totales de una Estimación Cliente — trabajos + gastos cobrables + IVA.
// Punto único de esta aritmética: EstimacionCliente (snapshot al cerrar/
// reconciliar), la vista en vivo antes de emitir, el PDF y ResumenEstimacion*
// llaman todos a esta misma función — nunca la repiten (gastos cobrables en
// Estimación Cliente, agosto 2026). Se llama una vez por capa (operativo,
// privado) con los insumos YA resueltos de esa capa; nunca mezcla ambas ni
// aplica un % único sobre trabajos+gastos combinados — la administración de
// trabajos llega ya sumada exacta por concepto (puede variar por concepto,
// por overrides), la de gastos se calcula aquí porque un gasto no tiene
// concepto que pueda traer su propio override.
// ---------------------------------------------------------------------------

export type InsumosTotalesEstimacion = {
  subtotalTrabajos: number;
  montoAdministracionTrabajos: number;
  subtotalGastosCobrables: number;
  // % vigente para gastos, ya resuelto por el caller (administración default
  // del proyecto, o utilidad default si el esquema es PRECIO_ALZADO) — null
  // si no hay gastos o el esquema/capa no aplica ningún % (ej. operativo +
  // PRECIO_ALZADO, donde ningún % es visible para Cliente normal).
  porcentajeAdministracionGastos: number | null;
  aplicaIVA: boolean;
  porcentajeIVA: number | null;
};

export type TotalesEstimacionCalculados = {
  montoAdministracionGastos: number;
  montoAdministracionTotal: number; // trabajos + gastos
  baseAntesIVA: number; // subtotalTrabajos + subtotalGastosCobrables + montoAdministracionTotal
  montoIVA: number;
  total: number;
};

export function calcularTotalesEstimacion(
  insumos: InsumosTotalesEstimacion
): TotalesEstimacionCalculados {
  const montoAdministracionGastos =
    insumos.subtotalGastosCobrables * ((insumos.porcentajeAdministracionGastos ?? 0) / 100);
  const montoAdministracionTotal = insumos.montoAdministracionTrabajos + montoAdministracionGastos;
  const baseAntesIVA =
    insumos.subtotalTrabajos + insumos.subtotalGastosCobrables + montoAdministracionTotal;
  const montoIVA = insumos.aplicaIVA ? baseAntesIVA * ((insumos.porcentajeIVA ?? 0) / 100) : 0;

  return {
    montoAdministracionGastos,
    montoAdministracionTotal,
    baseAntesIVA,
    montoIVA,
    total: baseAntesIVA + montoIVA,
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
      ? (concepto.porcentajeAdministracion ??
        porcentajesDefault.administracionPrivado ??
        porcentajesDefault.administracion)
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
