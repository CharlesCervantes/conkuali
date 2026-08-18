// Catálogo curado (no un enum de Postgres) — se valida en el servicio contra
// esta lista, así que GastoObra.categoria nunca guarda un valor arbitrario.
// Agregar una categoría nueva es un cambio de código, sin migración — mismo
// patrón que lib/control-de-obra/iconos-partida.ts.
export const CATEGORIAS_GASTO = [
  "MATERIAL",
  "HERRAMIENTA",
  "RENTA_EQUIPO",
  "TRANSPORTE",
  "COMIDA_PERSONAL",
  "SERVICIO",
  "OTRO",
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

export const CATEGORIA_GASTO_LABEL: Record<CategoriaGasto, string> = {
  MATERIAL: "Material",
  HERRAMIENTA: "Herramienta",
  RENTA_EQUIPO: "Renta de equipo",
  TRANSPORTE: "Transporte",
  COMIDA_PERSONAL: "Comida / personal",
  SERVICIO: "Servicio",
  OTRO: "Otro",
};
