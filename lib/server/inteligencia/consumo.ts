import "server-only";
import { db } from "@/lib/server/db";
import type { CapacidadInteligencia } from "@/lib/generated/prisma/client";

// Agregaciones de consumo GENÉRICAS — leen exclusivamente
// RegistroConsumoInteligencia (nunca DocumentoEgreso ni ningún modelo de
// dominio), así el dashboard de Master sigue funcionando sin cambios cuando
// se agreguen capacidades no documentales (Chat, embeddings). Todo se
// calcula con agregaciones en base de datos — nunca se cargan filas
// individuales a memoria, pensado para cientos de empresas y millones de
// filas (Master → Empresa → ARQENTO IA, V1.3, octubre 2026).

// `hasta` es EXCLUSIVO — mismo criterio que lib/contabilidad/periodo.ts, para
// que "hoy" nunca quede ambiguo por horas/zona horaria.
export type RangoFechas = { desde: Date; hasta: Date };

export type ResumenConsumoInteligencia = {
  costoTotal: number;
  operacionesTotal: number;
  operacionesExitosas: number;
  operacionesConError: number;
  documentosTexto: number;
  documentosVisuales: number;
  unidadesVisualesProcesadas: number;
  tokensEntrada: number;
  tokensSalida: number;
  costoPromedioPorOperacion: number;
};

export type DesgloseCapacidad = {
  capacidad: CapacidadInteligencia;
  operaciones: number;
  unidades: number;
  costoTotal: number;
};

// SIEMPRE filtrado por empresaId — ninguna agregación de este archivo puede
// mezclar registros de dos empresas distintas.
export async function obtenerResumenConsumo(empresaId: string, rango: RangoFechas): Promise<ResumenConsumoInteligencia> {
  const grupos = await db.registroConsumoInteligencia.groupBy({
    by: ["tipoConsumo", "estatus"],
    where: { empresaId, fecha: { gte: rango.desde, lt: rango.hasta } },
    _sum: { costoTotal: true, tokensEntrada: true, tokensSalida: true, unidades: true },
    _count: { _all: true },
  });

  let costoTotal = 0;
  let operacionesTotal = 0;
  let operacionesExitosas = 0;
  let operacionesConError = 0;
  let documentosTexto = 0;
  let documentosVisuales = 0;
  let unidadesVisualesProcesadas = 0;
  let tokensEntrada = 0;
  let tokensSalida = 0;

  for (const g of grupos) {
    const costo = Number(g._sum.costoTotal ?? 0);
    const cuenta = g._count._all;
    costoTotal += costo;
    operacionesTotal += cuenta;
    if (g.estatus === "EXITO") operacionesExitosas += cuenta;
    else operacionesConError += cuenta;
    tokensEntrada += g._sum.tokensEntrada ?? 0;
    tokensSalida += g._sum.tokensSalida ?? 0;
    if (g.tipoConsumo === "EXTRACCION_LLM") documentosTexto += cuenta;
    if (g.tipoConsumo === "EXTRACCION_LLM_VISUAL") {
      documentosVisuales += cuenta;
      unidadesVisualesProcesadas += g._sum.unidades ?? 0;
    }
  }

  return {
    costoTotal,
    operacionesTotal,
    operacionesExitosas,
    operacionesConError,
    documentosTexto,
    documentosVisuales,
    unidadesVisualesProcesadas,
    tokensEntrada,
    tokensSalida,
    costoPromedioPorOperacion: operacionesTotal > 0 ? costoTotal / operacionesTotal : 0,
  };
}

const CAPACIDAD_POR_TIPO_CONSUMO: Record<string, CapacidadInteligencia> = {
  EXTRACCION_LLM: "ANALISIS_DOCUMENTAL_TEXTO",
  EXTRACCION_LLM_VISUAL: "ANALISIS_VISUAL",
};

export async function obtenerDesglosePorCapacidad(empresaId: string, rango: RangoFechas): Promise<DesgloseCapacidad[]> {
  const grupos = await db.registroConsumoInteligencia.groupBy({
    by: ["tipoConsumo"],
    where: { empresaId, fecha: { gte: rango.desde, lt: rango.hasta } },
    _sum: { costoTotal: true, unidades: true },
    _count: { _all: true },
  });

  return grupos
    .filter((g) => CAPACIDAD_POR_TIPO_CONSUMO[g.tipoConsumo])
    .map((g) => ({
      capacidad: CAPACIDAD_POR_TIPO_CONSUMO[g.tipoConsumo],
      operaciones: g._count._all,
      unidades: g._sum.unidades ?? 0,
      costoTotal: Number(g._sum.costoTotal ?? 0),
    }));
}

export type ConsumoDiario = { dia: string; costoTotal: number; operaciones: number };

// Prisma no soporta agrupar por fecha truncada (date_trunc) vía groupBy() —
// único uso de SQL crudo de este módulo, parametrizado (nunca interpolación
// de string) para evitar inyección SQL.
export async function obtenerConsumoDiario(empresaId: string, rango: RangoFechas): Promise<ConsumoDiario[]> {
  const filas = await db.$queryRaw<{ dia: Date; costo_total: string; operaciones: bigint }[]>`
    SELECT
      date_trunc('day', "fecha") AS dia,
      SUM("costoTotal")::text AS costo_total,
      COUNT(*)::bigint AS operaciones
    FROM "registro_consumo_inteligencia"
    WHERE "empresaId" = ${empresaId}
      AND "fecha" >= ${rango.desde}
      AND "fecha" < ${rango.hasta}
    GROUP BY dia
    ORDER BY dia ASC
  `;

  return filas.map((f) => ({
    dia: f.dia.toISOString().slice(0, 10),
    costoTotal: Number(f.costo_total),
    operaciones: Number(f.operaciones),
  }));
}
