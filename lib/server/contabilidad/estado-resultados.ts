import "server-only";
import { db } from "@/lib/server/db";
import { puedeVerContabilidad, puedeVerInformacionPrivada } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";
import type { RangoPeriodo } from "@/lib/contabilidad/periodo";
import { rangoAcumuladoAnual } from "@/lib/contabilidad/periodo";

// ---------------------------------------------------------------------------
// Motor del Estado de Resultados — única fuente de cálculo, reutilizada tanto
// para "Periodo actual" como "Acumulado del año" (misma función, dos rangos),
// y consumida sin cálculo adicional por la UI (Contabilidad — reconocimiento,
// septiembre 2026, ver docs/negocio/05-modulo-contabilidad.md).
//
// Principio de diseño no negociable: reconocimiento (eje 2), no flujo de
// efectivo (eje 4). "Ingresos por obra" NUNCA lee MovimientoFinancieroCliente
// — solo EstimacionClienteCapa. Esto hace el doble conteo con Aportaciones de
// Fondo/Pagos físicamente imposible, no solo evitado por un filtro.
// ---------------------------------------------------------------------------

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// Clasificación exclusiva de un registro manual — invariante: una operación
// reconocida participa en EXACTAMENTE una línea del Estado de Resultados.
// Nunca se infiere del texto libre de `concepto`.
export const CLASIFICACIONES_EGRESO_MANUAL = [
  "COSTO_DIRECTO_OBRA",
  "GASTO_OPERACION",
  "IMPUESTOS_CONTRIBUCIONES",
  "OTRO_NO_OPERATIVO",
] as const;
export type ClasificacionEgresoManual = (typeof CLASIFICACIONES_EGRESO_MANUAL)[number];

export const CLASIFICACIONES_INGRESO_MANUAL = ["INGRESO_OPERATIVO", "OTRO_NO_OPERATIVO"] as const;
export type ClasificacionIngresoManual = (typeof CLASIFICACIONES_INGRESO_MANUAL)[number];

const CATEGORIAS_MATERIALES = ["MATERIAL"];
const CATEGORIAS_MAQUINARIA = ["HERRAMIENTA", "RENTA_EQUIPO"];
const CATEGORIAS_PERMISOS_OBRA = ["PERMISOS_DERECHOS_OBRA"];
const CATEGORIAS_OTROS_COSTOS_DIRECTOS = ["TRANSPORTE", "COMIDA_PERSONAL", "SERVICIO", "OTRO"];
const CATEGORIAS_ADMIN_SERVICIOS = ["SERVICIOS_EMPRESA"];
const CATEGORIAS_OFICINA = ["RENTA_OFICINA"];
const CATEGORIAS_VEHICULOS = ["GASOLINA"];
const CATEGORIAS_NOMINA = ["NOMINA"];
const CATEGORIAS_OTROS_GASTOS_OPERACION = ["PAPELERIA", "VIATICOS", "OTRO_EMPRESA"];
const CATEGORIAS_IMPUESTOS = ["IMPUESTOS_CONTRIBUCIONES"];

// Suficiente para reconstruir el query de drill-down en una iteración
// posterior sin volver a decidir la lógica de negocio en la UI — no se
// implementa el endpoint de drill-down en esta entrega.
export type OrigenLinea = {
  modelo: "EstimacionClienteCapa" | "GastoObra" | "CorteSemanal" | "Ingreso" | "Egreso";
  filtro: Record<string, unknown>;
};

export type LineaResultado = {
  clave: string;
  etiqueta: string;
  monto: number;
  origen: OrigenLinea;
};

export type SeccionResultado = {
  clave: string;
  etiqueta: string;
  lineas: LineaResultado[];
  total: number;
};

export type EstadoResultados = {
  periodo: { desde: string; hasta: string; etiqueta: string };
  proyectoId: string | null;
  ingresos: SeccionResultado;
  costosDirectos: SeccionResultado;
  utilidadBruta: { monto: number; margenPorcentaje: number | null };
  gastosOperacion: SeccionResultado;
  utilidadOperativa: number;
  impuestosContribuciones: number;
  otros: SeccionResultado;
  resultadoPeriodo: number;
  // true si se excluyó capa Privada por falta de permiso vigente en este
  // momento (rol + Vista privada + Empresa.privadoHabilitado) — la UI puede
  // mostrar un aviso discreto sin exponer ningún detalle Privado.
  privadoExcluido: boolean;
};

// `whereProyecto` ya trae la restricción de proyecto/ámbito correcta (ver
// calcularEstadoResultados) — esta función nunca decide por su cuenta si
// restringe a obras reales o no, solo aplica lo que se le pasa.
async function sumarGastoObraPorCategorias(
  empresaId: string,
  categorias: string[],
  rango: RangoPeriodo,
  whereProyecto: Record<string, unknown>
): Promise<number> {
  const r = await db.gastoObra.aggregate({
    where: {
      empresaId,
      incluidoEnContabilidad: true,
      estatus: "APROBADO",
      categoria: { in: categorias },
      fecha: { gte: rango.desde, lt: rango.hasta },
      ...whereProyecto,
    },
    _sum: { monto: true },
  });
  return Number(r._sum.monto ?? 0);
}

async function sumarEgresoManualPorClasificacion(
  empresaId: string,
  clasificacion: ClasificacionEgresoManual,
  rango: RangoPeriodo,
  proyectoId: string | null | undefined
): Promise<number> {
  const r = await db.egreso.aggregate({
    where: {
      empresaId,
      gastoObraId: null,
      estatus: "VIGENTE",
      clasificacionManual: clasificacion,
      fecha: { gte: rango.desde, lt: rango.hasta },
      ...(proyectoId ? { proyectoId } : {}),
    },
    _sum: { monto: true },
  });
  return Number(r._sum.monto ?? 0);
}

export async function calcularEstadoResultados(
  usuario: UsuarioSesion,
  rango: RangoPeriodo,
  proyectoId?: string | null
): Promise<EstadoResultados> {
  const empresaId = requerirContabilidad(usuario);
  const incluyePrivado = puedeVerInformacionPrivada(usuario);
  // Costos Directos de Obra: si no se filtró un proyecto puntual, se
  // restringe a obras reales (excluye el pseudo-proyecto OFICINA) — un
  // proyecto puntual ya es inequívoco, no hace falta la restricción de tipo.
  const whereProyectoObra: Record<string, unknown> = proyectoId
    ? { proyectoId }
    : { proyecto: { tipo: { in: ["FORMAL", "MOMENTANEA"] as const } } };
  // Gastos de Operación / registros manuales: el ámbito ya lo decide la
  // categoría/clasificación, nunca el tipo de proyecto — ver categorias-gasto.ts.
  const whereProyecto: Record<string, unknown> = proyectoId ? { proyectoId } : {};

  // ---- INGRESOS — solo EstimacionClienteCapa, nunca MovimientoFinancieroCliente ----
  const capasEmitidas = await db.estimacionClienteCapa.aggregate({
    where: {
      estatus: "EMITIDA",
      incluidoEnContabilidad: true,
      emitidoEn: { gte: rango.desde, lt: rango.hasta },
      estimacionCliente: {
        empresaId,
        ...(proyectoId ? { proyectoId } : {}),
      },
      ...(incluyePrivado ? {} : { capa: "OPERATIVO" as const }),
    },
    _sum: { total: true },
  });
  const ingresosPorObra = Number(capasEmitidas._sum.total ?? 0);

  const otrosIngresos = await (async () => {
    const r = await db.ingreso.aggregate({
      where: {
        empresaId,
        movimientoFinancieroClienteId: null,
        estatus: "VIGENTE",
        clasificacionManual: "INGRESO_OPERATIVO" satisfies ClasificacionIngresoManual,
        fecha: { gte: rango.desde, lt: rango.hasta },
        ...(proyectoId ? { proyectoId } : {}),
      },
      _sum: { monto: true },
    });
    return Number(r._sum.monto ?? 0);
  })();

  const totalIngresos = ingresosPorObra + otrosIngresos;

  // ---- COSTOS DIRECTOS DE OBRA ----
  const contratistas = await (async () => {
    const r = await db.corteSemanal.aggregate({
      where: {
        empresaId,
        estatus: "GENERADO",
        semana: { fechaInicio: { gte: rango.desde, lt: rango.hasta } },
        ...whereProyectoObra,
      },
      _sum: { montoNeto: true },
    });
    return Number(r._sum.montoNeto ?? 0);
  })();

  const [materiales, maquinaria, permisosObra, otrosCostosCategoria, otrosCostosManual] = await Promise.all([
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_MATERIALES, rango, whereProyectoObra),
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_MAQUINARIA, rango, whereProyectoObra),
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_PERMISOS_OBRA, rango, whereProyectoObra),
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_OTROS_COSTOS_DIRECTOS, rango, whereProyectoObra),
    sumarEgresoManualPorClasificacion(empresaId, "COSTO_DIRECTO_OBRA", rango, proyectoId),
  ]);
  const otrosCostosDirectos = otrosCostosCategoria + otrosCostosManual;

  const totalCostosDirectos = contratistas + materiales + maquinaria + permisosObra + otrosCostosDirectos;
  const utilidadBrutaMonto = totalIngresos - totalCostosDirectos;
  const margenBruto = totalIngresos !== 0 ? (utilidadBrutaMonto / totalIngresos) * 100 : null;

  // ---- GASTOS DE OPERACIÓN ----
  const [administracion, oficina, vehiculos, nomina, otrosGastosCategoria, otrosGastosManual] = await Promise.all([
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_ADMIN_SERVICIOS, rango, whereProyecto),
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_OFICINA, rango, whereProyecto),
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_VEHICULOS, rango, whereProyecto),
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_NOMINA, rango, whereProyecto),
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_OTROS_GASTOS_OPERACION, rango, whereProyecto),
    sumarEgresoManualPorClasificacion(empresaId, "GASTO_OPERACION", rango, proyectoId),
  ]);
  const otrosGastosOperacion = otrosGastosCategoria + otrosGastosManual;
  const totalGastosOperacion = administracion + oficina + vehiculos + nomina + otrosGastosOperacion;

  const utilidadOperativa = utilidadBrutaMonto - totalGastosOperacion;

  // ---- IMPUESTOS Y CONTRIBUCIONES — línea propia, nunca dentro de Gastos de Operación ----
  const [impuestosCategoria, impuestosManual] = await Promise.all([
    sumarGastoObraPorCategorias(empresaId, CATEGORIAS_IMPUESTOS, rango, whereProyecto),
    sumarEgresoManualPorClasificacion(empresaId, "IMPUESTOS_CONTRIBUCIONES", rango, proyectoId),
  ]);
  const impuestosContribuciones = impuestosCategoria + impuestosManual;

  // ---- OTROS INGRESOS / GASTOS (no operativos) ----
  const [otroIngresoManual, otroEgresoManual] = await Promise.all([
    (async () => {
      const r = await db.ingreso.aggregate({
        where: {
          empresaId,
          movimientoFinancieroClienteId: null,
          estatus: "VIGENTE",
          clasificacionManual: "OTRO_NO_OPERATIVO" satisfies ClasificacionIngresoManual,
          fecha: { gte: rango.desde, lt: rango.hasta },
          ...(proyectoId ? { proyectoId } : {}),
        },
        _sum: { monto: true },
      });
      return Number(r._sum.monto ?? 0);
    })(),
    sumarEgresoManualPorClasificacion(empresaId, "OTRO_NO_OPERATIVO", rango, proyectoId),
  ]);
  const totalOtros = otroIngresoManual - otroEgresoManual;

  const resultadoPeriodo = utilidadOperativa - impuestosContribuciones + totalOtros;

  const seccion = (clave: string, etiqueta: string, lineas: LineaResultado[]): SeccionResultado => ({
    clave,
    etiqueta,
    lineas,
    total: lineas.reduce((acc, l) => acc + l.monto, 0),
  });

  const linea = (clave: string, etiqueta: string, monto: number, origen: OrigenLinea): LineaResultado => ({
    clave,
    etiqueta,
    monto,
    origen,
  });

  const rangoFiltro = { gte: rango.desde.toISOString(), lt: rango.hasta.toISOString() };

  return {
    periodo: { desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString(), etiqueta: rango.etiqueta },
    proyectoId: proyectoId ?? null,
    ingresos: seccion("ingresos", "Ingresos", [
      linea("ingresos_por_obra", "Ingresos por obra", ingresosPorObra, {
        modelo: "EstimacionClienteCapa",
        filtro: { estatus: "EMITIDA", incluidoEnContabilidad: true, emitidoEn: rangoFiltro, capa: incluyePrivado ? undefined : "OPERATIVO" },
      }),
      linea("otros_ingresos", "Otros ingresos", otrosIngresos, {
        modelo: "Ingreso",
        filtro: { clasificacionManual: "INGRESO_OPERATIVO", fecha: rangoFiltro },
      }),
    ]),
    costosDirectos: seccion("costos_directos", "Costos directos de obra", [
      linea("contratistas", "Contratistas / Mano de obra", contratistas, {
        modelo: "CorteSemanal",
        filtro: { estatus: "GENERADO", semanaFechaInicio: rangoFiltro },
      }),
      linea("materiales", "Materiales", materiales, { modelo: "GastoObra", filtro: { categoria: CATEGORIAS_MATERIALES, fecha: rangoFiltro } }),
      linea("maquinaria", "Maquinaria y equipo", maquinaria, { modelo: "GastoObra", filtro: { categoria: CATEGORIAS_MAQUINARIA, fecha: rangoFiltro } }),
      linea("permisos_derechos_obra", "Permisos y derechos de obra", permisosObra, {
        modelo: "GastoObra",
        filtro: { categoria: CATEGORIAS_PERMISOS_OBRA, fecha: rangoFiltro },
      }),
      linea("otros_costos_directos", "Otros costos directos", otrosCostosDirectos, {
        modelo: "GastoObra",
        filtro: { categoria: CATEGORIAS_OTROS_COSTOS_DIRECTOS, fecha: rangoFiltro },
      }),
    ]),
    utilidadBruta: { monto: utilidadBrutaMonto, margenPorcentaje: margenBruto },
    gastosOperacion: seccion("gastos_operacion", "Gastos de operación", [
      linea("administracion_servicios", "Administración / Servicios", administracion, {
        modelo: "GastoObra",
        filtro: { categoria: CATEGORIAS_ADMIN_SERVICIOS, fecha: rangoFiltro },
      }),
      linea("oficina", "Oficina", oficina, { modelo: "GastoObra", filtro: { categoria: CATEGORIAS_OFICINA, fecha: rangoFiltro } }),
      linea("vehiculos_gasolina", "Vehículos / Gasolina", vehiculos, { modelo: "GastoObra", filtro: { categoria: CATEGORIAS_VEHICULOS, fecha: rangoFiltro } }),
      linea("nomina_administrativa", "Nómina administrativa", nomina, { modelo: "GastoObra", filtro: { categoria: CATEGORIAS_NOMINA, fecha: rangoFiltro } }),
      linea("otros_gastos_operacion", "Otros gastos", otrosGastosOperacion, {
        modelo: "GastoObra",
        filtro: { categoria: CATEGORIAS_OTROS_GASTOS_OPERACION, fecha: rangoFiltro },
      }),
    ]),
    utilidadOperativa,
    impuestosContribuciones,
    otros: seccion("otros", "Otros ingresos / gastos", [
      linea("otros_ingresos_no_operativos", "Otros ingresos (no operativos)", otroIngresoManual, {
        modelo: "Ingreso",
        filtro: { clasificacionManual: "OTRO_NO_OPERATIVO", fecha: rangoFiltro },
      }),
      linea("otros_gastos_no_operativos", "Otros gastos (no operativos)", -otroEgresoManual, {
        modelo: "Egreso",
        filtro: { clasificacionManual: "OTRO_NO_OPERATIVO", fecha: rangoFiltro },
      }),
    ]),
    resultadoPeriodo,
    privadoExcluido: !incluyePrivado,
  };
}

export type EstadoResultadosComparado = {
  periodoActual: EstadoResultados;
  acumuladoAnual: EstadoResultados;
};

// Única función pública de lectura del Estado de Resultados — reutiliza
// calcularEstadoResultados dos veces (nunca una fórmula distinta para el
// acumulado), mismo principio "no lógica contable duplicada" aplicado
// también del lado servidor.
export async function obtenerEstadoResultadosComparado(
  usuario: UsuarioSesion,
  rango: RangoPeriodo,
  proyectoId?: string | null
): Promise<EstadoResultadosComparado> {
  const [periodoActual, acumuladoAnual] = await Promise.all([
    calcularEstadoResultados(usuario, rango, proyectoId),
    calcularEstadoResultados(usuario, rangoAcumuladoAnual(rango), proyectoId),
  ]);
  return { periodoActual, acumuladoAnual };
}
