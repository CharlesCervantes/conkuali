// Catálogo curado (no un enum de Postgres) — se valida en el servicio contra
// esta lista, así que GastoObra.categoria nunca guarda un valor arbitrario.
// Agregar una categoría nueva es un cambio de código, sin migración — mismo
// patrón que lib/control-de-obra/iconos-partida.ts.
export const CATEGORIAS_GASTO = [
  // Obra (destino Proyecto)
  "MATERIAL",
  "HERRAMIENTA",
  "RENTA_EQUIPO",
  "TRANSPORTE",
  "COMIDA_PERSONAL",
  "SERVICIO",
  // Permisos/derechos/licencias atribuibles a una obra específica —
  // distinto de IMPUESTOS_CONTRIBUCIONES (Contabilidad — reconocimiento,
  // septiembre 2026): esto es costo directo de la obra, no una contribución
  // general de la Empresa.
  "PERMISOS_DERECHOS_OBRA",
  "OTRO",
  // Empresa (destino Empresa — Gastos transversal, septiembre 2026)
  "NOMINA",
  "RENTA_OFICINA",
  "GASOLINA",
  // Reemplaza la antigua "IMPUESTOS" (Contabilidad — reconocimiento,
  // septiembre 2026) — línea propia del Estado de Resultados, nunca dentro
  // de Gastos de Operación. Ver docs/negocio/05-modulo-contabilidad.md
  // sección 12.
  "IMPUESTOS_CONTRIBUCIONES",
  "SERVICIOS_EMPRESA",
  "PAPELERIA",
  "VIATICOS",
  "OTRO_EMPRESA",
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

export const CATEGORIA_GASTO_LABEL: Record<CategoriaGasto, string> = {
  MATERIAL: "Material",
  HERRAMIENTA: "Herramienta",
  RENTA_EQUIPO: "Renta de equipo",
  TRANSPORTE: "Transporte",
  COMIDA_PERSONAL: "Comida / personal",
  SERVICIO: "Servicio",
  PERMISOS_DERECHOS_OBRA: "Permisos y derechos de obra",
  OTRO: "Otro",
  NOMINA: "Nómina",
  RENTA_OFICINA: "Renta",
  GASOLINA: "Gasolina",
  IMPUESTOS_CONTRIBUCIONES: "Impuestos y contribuciones",
  SERVICIOS_EMPRESA: "Servicios",
  PAPELERIA: "Papelería",
  VIATICOS: "Viáticos",
  OTRO_EMPRESA: "Otro",
};

// A qué destino (Paso 1 del formulario de Gastos) pertenece cada categoría —
// filtra el <select> según si el gasto es de Proyecto o de Empresa. Ninguna
// categoría es "ambos" a propósito: mezclar los dos catálogos en un solo
// dropdown de 15 opciones es justo el ruido que el Paso 1 evita.
export type AmbitoGasto = "obra" | "empresa";

export const CATEGORIA_GASTO_AMBITO: Record<CategoriaGasto, AmbitoGasto> = {
  MATERIAL: "obra",
  HERRAMIENTA: "obra",
  RENTA_EQUIPO: "obra",
  TRANSPORTE: "obra",
  COMIDA_PERSONAL: "obra",
  SERVICIO: "obra",
  PERMISOS_DERECHOS_OBRA: "obra",
  OTRO: "obra",
  NOMINA: "empresa",
  RENTA_OFICINA: "empresa",
  GASOLINA: "empresa",
  IMPUESTOS_CONTRIBUCIONES: "empresa",
  SERVICIOS_EMPRESA: "empresa",
  PAPELERIA: "empresa",
  VIATICOS: "empresa",
  OTRO_EMPRESA: "empresa",
};

// Categorías sensibles de Gastos de Empresa — información financiera interna
// (nómina, renta, impuestos, servicios/administración general) que un
// Supervisor NO debe poder ni capturar ni consultar por default, a
// diferencia de categorías operativas de Empresa (gasolina, papelería,
// viáticos) que sí puede seguir registrando igual que cualquier gasto de
// obra. Ver puedeCapturarCategoriaGasto/puedeVerGastosEmpresaSensibles en
// lib/server/permisos.ts — la sensibilidad vive ÚNICAMENTE aquí (una sola
// fuente), el permiso solo la consulta (Gastos transversal, septiembre
// 2026). "Otro" de Empresa se marca sensible por default (no es una forma de
// evadir las categorías restringidas metiendo algo sensible ahí).
export const CATEGORIA_GASTO_SENSIBLE: Record<CategoriaGasto, boolean> = {
  MATERIAL: false,
  HERRAMIENTA: false,
  RENTA_EQUIPO: false,
  TRANSPORTE: false,
  COMIDA_PERSONAL: false,
  SERVICIO: false,
  PERMISOS_DERECHOS_OBRA: false,
  OTRO: false,
  NOMINA: true,
  RENTA_OFICINA: true,
  GASOLINA: false,
  IMPUESTOS_CONTRIBUCIONES: true,
  SERVICIOS_EMPRESA: true,
  PAPELERIA: false,
  VIATICOS: false,
  OTRO_EMPRESA: true,
};

export function categoriasParaAmbito(ambito: AmbitoGasto): CategoriaGasto[] {
  return CATEGORIAS_GASTO.filter((c) => CATEGORIA_GASTO_AMBITO[c] === ambito);
}
