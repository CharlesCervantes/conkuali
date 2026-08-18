import "server-only";
import { db } from "@/lib/server/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoriaTx } from "@/lib/server/auditoria";
import {
  puedeEmitirEstimacionCliente,
  puedeMaterializarEstimacionHistorica,
} from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";
import {
  calcularPrecioConcepto,
  calcularPrecioOperativoConcepto,
  type PorcentajesDefaultProyecto,
} from "@/lib/control-de-obra/contrato-general";
import { sumaEjecutadaPorConcepto } from "./avance-calculo";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { RegistroNoEncontradoError } from "./estructura-contractual";

type Cliente = Prisma.TransactionClient;

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function numOrNull(valor: { toNumber(): number } | null): number | null {
  return valor === null ? null : valor.toNumber();
}

// ---------------------------------------------------------------------------
// Valorización por concepto — la misma cantidad física (AvanceConcepto), dos
// precios (operativo/Cliente y privado/Cliente Priv.). Acumulado/pendiente/%
// se derivan igual que en avance.ts, nunca se recalculan con otra fórmula.
// Esta forma es tanto el detalle que se muestra en vivo (semana abierta) como
// el que se congela en EstimacionClienteConcepto (semana cerrada).
// ---------------------------------------------------------------------------

export type FilaEstimacion = {
  conceptoId: string;
  partidaNombre: string;
  descripcionConcepto: string;
  unidad: string;

  cantidadContratada: number;
  cantidadAnterior: number;
  cantidadEstaSemana: number;
  cantidadAcumulada: number;
  cantidadPorEjercer: number;
  avancePorcentaje: number;

  precioUnitarioOperativo: number;
  importeContratadoOperativo: number;
  importeEstaSemanaOperativo: number;
  importeAcumuladoOperativo: number;
  importePorEjercerOperativo: number;

  precioUnitarioPrivado: number;
  importeContratadoPrivado: number;
  importeEstaSemanaPrivado: number;
  importeAcumuladoPrivado: number;
  importePorEjercerPrivado: number;
  porcentajeAplicadoPrivado: number | null;
};

// Proyección segura para Cliente (operativo) — SUPERVISOR incluido. Nunca se
// pasa un FilaEstimacion completo (con columnas *Privado) a la página/
// componentes de Cliente; esto es lo único que cruza esa frontera.
export type FilaEstimacionOperativa = Omit<
  FilaEstimacion,
  | "precioUnitarioPrivado"
  | "importeContratadoPrivado"
  | "importeEstaSemanaPrivado"
  | "importeAcumuladoPrivado"
  | "importePorEjercerPrivado"
  | "porcentajeAplicadoPrivado"
>;

export function soloOperativo(filas: FilaEstimacion[]): FilaEstimacionOperativa[] {
  return filas.map((f) => ({
    conceptoId: f.conceptoId,
    partidaNombre: f.partidaNombre,
    descripcionConcepto: f.descripcionConcepto,
    unidad: f.unidad,
    cantidadContratada: f.cantidadContratada,
    cantidadAnterior: f.cantidadAnterior,
    cantidadEstaSemana: f.cantidadEstaSemana,
    cantidadAcumulada: f.cantidadAcumulada,
    cantidadPorEjercer: f.cantidadPorEjercer,
    avancePorcentaje: f.avancePorcentaje,
    precioUnitarioOperativo: f.precioUnitarioOperativo,
    importeContratadoOperativo: f.importeContratadoOperativo,
    importeEstaSemanaOperativo: f.importeEstaSemanaOperativo,
    importeAcumuladoOperativo: f.importeAcumuladoOperativo,
    importePorEjercerOperativo: f.importePorEjercerOperativo,
  }));
}

export function agruparPorPartida<F extends { partidaNombre: string }>(
  filas: F[]
): { partidaNombre: string; conceptos: F[] }[] {
  const orden: string[] = [];
  const grupos = new Map<string, F[]>();
  for (const fila of filas) {
    if (!grupos.has(fila.partidaNombre)) {
      grupos.set(fila.partidaNombre, []);
      orden.push(fila.partidaNombre);
    }
    grupos.get(fila.partidaNombre)!.push(fila);
  }
  return orden.map((nombre) => ({ partidaNombre: nombre, conceptos: grupos.get(nombre)! }));
}

export function totalOperativo(filas: FilaEstimacionOperativa[] | FilaEstimacion[]): number {
  return filas.reduce((t, f) => t + f.importeEstaSemanaOperativo, 0);
}

export type TotalesPrivados = {
  subtotal: number;
  montoAdministracionOUtilidad: number;
  total: number;
};

type ResultadoValorizacion = { filas: FilaEstimacion[]; totalesPrivados: TotalesPrivados };

async function construirDetalleValorizado(
  cliente: Cliente,
  proyectoId: string,
  semana: { id: string; fechaInicio: Date },
  esquemaContractual: EsquemaContractual | null,
  porcentajesDefault: PorcentajesDefaultProyecto
): Promise<ResultadoValorizacion> {
  const conceptos = await cliente.concepto.findMany({
    where: { partida: { proyectoId }, estatus: "ACTIVO" },
    include: { partida: { select: { nombre: true } } },
  });
  const conceptoIds = conceptos.map((c) => c.id);

  const [anteriorPorConcepto, filasEstaSemana] = await Promise.all([
    sumaEjecutadaPorConcepto(conceptoIds, semana.fechaInicio, cliente),
    cliente.avanceConcepto.findMany({
      where: { conceptoId: { in: conceptoIds }, semanaId: semana.id, estatusAprobacion: "APROBADO" },
    }),
  ]);
  const estaSemanaPorConcepto = new Map(
    filasEstaSemana.map((f) => [f.conceptoId, Number(f.cantidadEjecutada)])
  );

  const filas: FilaEstimacion[] = [];
  let subtotalPrivado = 0;
  let montoPrivado = 0;

  for (const concepto of conceptos) {
    // Solo conceptos con avance real ESA semana — misma regla que Avance de
    // obra cerrada (filtrarPartidasConMovimiento en avance.ts).
    const estaSemana = estaSemanaPorConcepto.get(concepto.id) ?? 0;
    if (estaSemana <= 0) continue;

    const anterior = anteriorPorConcepto.get(concepto.id) ?? 0;
    const cantidadContratada = Number(concepto.cantidadContratada);
    const acumulada = anterior + estaSemana;
    const porEjercer = cantidadContratada - acumulada;
    const avancePorcentaje = cantidadContratada > 0 ? (acumulada / cantidadContratada) * 100 : 0;

    const costos = {
      precioUnitarioContratista: numOrNull(concepto.precioUnitarioContratista),
      precioUnitarioContratistaPrivado: numOrNull(concepto.precioUnitarioContratistaPrivado),
      precioUnitarioMateriales: numOrNull(concepto.precioUnitarioMateriales),
      precioUnitarioIndirectos: numOrNull(concepto.precioUnitarioIndirectos),
      precioUnitarioHerramienta: numOrNull(concepto.precioUnitarioHerramienta),
      porcentajeUtilidad: numOrNull(concepto.porcentajeUtilidad),
      porcentajeAdministracion: numOrNull(concepto.porcentajeAdministracion),
    };

    const operativo = calcularPrecioOperativoConcepto(
      costos,
      esquemaContractual,
      porcentajesDefault.administracion
    );
    const privado = calcularPrecioConcepto(costos, esquemaContractual, porcentajesDefault);

    // "Esta estimación" (sección 10) es el monto de ESTA semana, no el
    // acumulado a la fecha — subtotal/monto% se acumulan sobre costoBase/
    // montoPorcentaje POR UNIDAD (ya calculados por calcularPrecioConcepto,
    // nunca una fórmula nueva) multiplicados por la cantidad de esta semana.
    subtotalPrivado += privado.costoBase * estaSemana;
    montoPrivado += privado.montoPorcentaje * estaSemana;

    filas.push({
      conceptoId: concepto.id,
      partidaNombre: concepto.partida.nombre,
      descripcionConcepto: concepto.descripcion,
      unidad: concepto.unidad,

      cantidadContratada,
      cantidadAnterior: anterior,
      cantidadEstaSemana: estaSemana,
      cantidadAcumulada: acumulada,
      cantidadPorEjercer: porEjercer,
      avancePorcentaje,

      precioUnitarioOperativo: operativo.precioUnitarioConAdministracion,
      importeContratadoOperativo: operativo.precioUnitarioConAdministracion * cantidadContratada,
      importeEstaSemanaOperativo: operativo.precioUnitarioConAdministracion * estaSemana,
      importeAcumuladoOperativo: operativo.precioUnitarioConAdministracion * acumulada,
      importePorEjercerOperativo: operativo.precioUnitarioConAdministracion * porEjercer,

      precioUnitarioPrivado: privado.precioUnitarioRecomendado,
      importeContratadoPrivado: privado.precioUnitarioRecomendado * cantidadContratada,
      importeEstaSemanaPrivado: privado.precioUnitarioRecomendado * estaSemana,
      importeAcumuladoPrivado: privado.precioUnitarioRecomendado * acumulada,
      importePorEjercerPrivado: privado.precioUnitarioRecomendado * porEjercer,
      porcentajeAplicadoPrivado: privado.porcentajeAplicado,
    });
  }

  // Mismo orden que la estructura contractual (partida → descripción), no el
  // orden arbitrario de AvanceConcepto.
  filas.sort((a, b) => a.descripcionConcepto.localeCompare(b.descripcionConcepto));

  return {
    filas,
    totalesPrivados: {
      subtotal: subtotalPrivado,
      montoAdministracionOUtilidad: montoPrivado,
      total: subtotalPrivado + montoPrivado,
    },
  };
}

async function obtenerContextoProyecto(cliente: Cliente, proyectoId: string) {
  const proyecto = await cliente.proyecto.findFirst({
    where: { id: proyectoId },
    select: {
      esquemaContractual: true,
      porcentajeUtilidadDefault: true,
      porcentajeAdministracionDefault: true,
    },
  });
  if (!proyecto) throw new RegistroNoEncontradoError("El proyecto");
  const porcentajesDefault: PorcentajesDefaultProyecto = {
    utilidad: numOrNull(proyecto.porcentajeUtilidadDefault),
    administracion: numOrNull(proyecto.porcentajeAdministracionDefault),
  };
  return { esquemaContractual: proyecto.esquemaContractual, porcentajesDefault };
}

// ---------------------------------------------------------------------------
// Lectura en vivo — semana ABIERTA, sin fila EstimacionCliente todavía. No
// tiene gate de rol propio (mismo criterio que obtenerAvanceSemanal): quien
// llama decide qué proyectar (soloOperativo) antes de pasarlo a Cliente.
// ---------------------------------------------------------------------------

export async function obtenerEstimacionSemanalEnVivo(
  usuario: UsuarioSesion,
  proyectoId: string,
  semana: { id: string; fechaInicio: Date }
): Promise<ResultadoValorizacion> {
  await obtenerProyecto(usuario, proyectoId);
  const { esquemaContractual, porcentajesDefault } = await obtenerContextoProyecto(db, proyectoId);
  return construirDetalleValorizado(db, proyectoId, semana, esquemaContractual, porcentajesDefault);
}

// ---------------------------------------------------------------------------
// Lectura congelada — semana CERRADA (BORRADOR o EMITIDA). Nunca se
// recalcula: se lee tal cual quedó generada/reconciliada al cerrar.
// ---------------------------------------------------------------------------

export type EstimacionClienteResumen = {
  id: string;
  numero: number;
  estatus: "BORRADOR" | "EMITIDA";
  esquemaContractualUsado: EsquemaContractual | null;
  subtotal: number;
  montoAdministracionOUtilidad: number;
  total: number;
  generadoPorNombre: string;
  generadoEn: string;
  emitidoPorNombre: string | null;
  emitidoEn: string | null;
};

export async function obtenerEstimacionCliente(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<{ estimacion: EstimacionClienteResumen; filas: FilaEstimacion[] } | null> {
  const empresaId = requerirEmpresa(usuario);
  await obtenerProyecto(usuario, proyectoId);

  const estimacion = await db.estimacionCliente.findUnique({
    where: { proyectoId_semanaId: { proyectoId, semanaId } },
    include: {
      generadoPor: { select: { nombre: true } },
      emitidoPor: { select: { nombre: true } },
      detalle: true,
    },
  });
  if (!estimacion || estimacion.empresaId !== empresaId) return null;

  const filas: FilaEstimacion[] = estimacion.detalle.map((d) => ({
    conceptoId: d.conceptoId,
    partidaNombre: d.partidaNombre,
    descripcionConcepto: d.descripcionConcepto,
    unidad: d.unidad,
    cantidadContratada: Number(d.cantidadContratada),
    cantidadAnterior: Number(d.cantidadAnterior),
    cantidadEstaSemana: Number(d.cantidadEstaSemana),
    cantidadAcumulada: Number(d.cantidadAcumulada),
    cantidadPorEjercer: Number(d.cantidadPorEjercer),
    avancePorcentaje: Number(d.avancePorcentaje),
    precioUnitarioOperativo: Number(d.precioUnitarioOperativo),
    importeContratadoOperativo: Number(d.importeContratadoOperativo),
    importeEstaSemanaOperativo: Number(d.importeEstaSemanaOperativo),
    importeAcumuladoOperativo: Number(d.importeAcumuladoOperativo),
    importePorEjercerOperativo: Number(d.importePorEjercerOperativo),
    precioUnitarioPrivado: Number(d.precioUnitarioPrivado),
    importeContratadoPrivado: Number(d.importeContratadoPrivado),
    importeEstaSemanaPrivado: Number(d.importeEstaSemanaPrivado),
    importeAcumuladoPrivado: Number(d.importeAcumuladoPrivado),
    importePorEjercerPrivado: Number(d.importePorEjercerPrivado),
    porcentajeAplicadoPrivado: numOrNull(d.porcentajeAplicadoPrivado),
  }));

  return {
    estimacion: {
      id: estimacion.id,
      numero: estimacion.numero,
      estatus: estimacion.estatus,
      esquemaContractualUsado: estimacion.esquemaContractualUsado,
      subtotal: Number(estimacion.subtotal),
      montoAdministracionOUtilidad: Number(estimacion.montoAdministracionOUtilidad),
      total: Number(estimacion.total),
      generadoPorNombre: estimacion.generadoPor.nombre,
      generadoEn: estimacion.generadoEn.toISOString(),
      emitidoPorNombre: estimacion.emitidoPor?.nombre ?? null,
      emitidoEn: estimacion.emitidoEn?.toISOString() ?? null,
    },
    filas,
  };
}

// ---------------------------------------------------------------------------
// Generación/reconciliación al cerrar semana — llamada UNA VEZ por
// proyecto+semana dentro de la misma transacción atómica de cerrarSemana()
// (lib/server/control-de-obra/cierre-semana.ts). Nunca se llama sola desde
// fuera de esa transacción. EMITIDA nunca se toca.
// ---------------------------------------------------------------------------

export type ResultadoEstimacionBorrador =
  | { tipo: "OMITIDA_EMITIDA" }
  | { tipo: "SIN_AVANCE" } // nada que estimar esta semana — no se crea fila
  | { tipo: "CREADA" | "RECONCILIADA" | "SIN_CAMBIOS"; total: number };

export async function generarOReconciliarEstimacionBorrador(
  tx: Cliente,
  ctx: {
    empresaId: string;
    proyectoId: string;
    semanaId: string;
    usuarioId: string;
    // "backfill_historico" solo lo usa materializarEstimacionHistorica — deja
    // constancia en la bitácora de que este registro NO se generó en el
    // cierre original, sino después, a partir de datos ya existentes.
    origen?: "cierre_semana" | "backfill_historico";
  },
  semana: { id: string; fechaInicio: Date }
): Promise<ResultadoEstimacionBorrador> {
  const existente = await tx.estimacionCliente.findUnique({
    where: { proyectoId_semanaId: { proyectoId: ctx.proyectoId, semanaId: ctx.semanaId } },
    include: { detalle: true },
  });

  if (existente?.estatus === "EMITIDA") {
    return { tipo: "OMITIDA_EMITIDA" };
  }

  const { esquemaContractual, porcentajesDefault } = await obtenerContextoProyecto(tx, ctx.proyectoId);
  const { filas, totalesPrivados } = await construirDetalleValorizado(
    tx,
    ctx.proyectoId,
    semana,
    esquemaContractual,
    porcentajesDefault
  );

  if (filas.length === 0) {
    // Nada con avance aprobado esta semana. Si ya existía un BORRADOR previo
    // (de un cierre anterior con más avance, ahora reabierto y sin nada
    // aprobado todavía), se reconcilia a vacío igual que un corte que se
    // anula — nunca queda con datos obsoletos.
    if (existente && existente.detalle.length > 0) {
      await tx.estimacionClienteConcepto.deleteMany({ where: { estimacionClienteId: existente.id } });
      await tx.estimacionCliente.update({
        where: { id: existente.id },
        data: { subtotal: 0, montoAdministracionOUtilidad: 0, total: 0 },
      });
      await registrarAuditoriaTx(tx, {
        empresaId: ctx.empresaId,
        usuarioId: ctx.usuarioId,
        entidad: "EstimacionCliente",
        entidadId: existente.id,
        accion: "EDITAR",
        valorAnterior: { total: Number(existente.total), conceptos: existente.detalle.length },
        valorNuevo: { total: 0, conceptos: 0 },
      });
      return { tipo: "RECONCILIADA", total: 0 };
    }
    return { tipo: "SIN_AVANCE" };
  }

  const datosDetalle = filas.map((f) => ({
    conceptoId: f.conceptoId,
    partidaNombre: f.partidaNombre,
    descripcionConcepto: f.descripcionConcepto,
    unidad: f.unidad,
    cantidadContratada: f.cantidadContratada,
    cantidadAnterior: f.cantidadAnterior,
    cantidadEstaSemana: f.cantidadEstaSemana,
    cantidadAcumulada: f.cantidadAcumulada,
    cantidadPorEjercer: f.cantidadPorEjercer,
    avancePorcentaje: f.avancePorcentaje,
    precioUnitarioOperativo: f.precioUnitarioOperativo,
    importeContratadoOperativo: f.importeContratadoOperativo,
    importeEstaSemanaOperativo: f.importeEstaSemanaOperativo,
    importeAcumuladoOperativo: f.importeAcumuladoOperativo,
    importePorEjercerOperativo: f.importePorEjercerOperativo,
    precioUnitarioPrivado: f.precioUnitarioPrivado,
    importeContratadoPrivado: f.importeContratadoPrivado,
    importeEstaSemanaPrivado: f.importeEstaSemanaPrivado,
    importeAcumuladoPrivado: f.importeAcumuladoPrivado,
    importePorEjercerPrivado: f.importePorEjercerPrivado,
    porcentajeAplicadoPrivado: f.porcentajeAplicadoPrivado,
  }));

  if (existente) {
    // ¿Cambió algo de verdad? — mismo criterio de "no auditar/escribir lo que
    // no cambió" ya usado en cierre-semana.ts y estructura-contractual.ts.
    const sinCambios =
      Number(existente.total) === totalesPrivados.total &&
      existente.detalle.length === datosDetalle.length &&
      existente.detalle
        .slice()
        .sort((a, b) => a.conceptoId.localeCompare(b.conceptoId))
        .every((d, i) => {
          const nuevo = [...datosDetalle].sort((a, b) => a.conceptoId.localeCompare(b.conceptoId))[i];
          return (
            d.conceptoId === nuevo.conceptoId &&
            Number(d.cantidadEstaSemana) === nuevo.cantidadEstaSemana &&
            Number(d.importeEstaSemanaPrivado) === nuevo.importeEstaSemanaPrivado
          );
        });

    if (sinCambios) return { tipo: "SIN_CAMBIOS", total: totalesPrivados.total };

    const valorAnterior = { total: Number(existente.total), conceptos: existente.detalle.length };

    await tx.estimacionClienteConcepto.deleteMany({ where: { estimacionClienteId: existente.id } });
    const actualizada = await tx.estimacionCliente.update({
      where: { id: existente.id },
      data: {
        subtotal: totalesPrivados.subtotal,
        montoAdministracionOUtilidad: totalesPrivados.montoAdministracionOUtilidad,
        total: totalesPrivados.total,
        esquemaContractualUsado: esquemaContractual,
        detalle: { create: datosDetalle },
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      entidad: "EstimacionCliente",
      entidadId: actualizada.id,
      accion: "EDITAR",
      valorAnterior,
      valorNuevo: { total: totalesPrivados.total, conceptos: datosDetalle.length },
    });

    return { tipo: "RECONCILIADA", total: totalesPrivados.total };
  }

  // No existe todavía — numeración correlativa por proyecto, contador
  // atómico (mismo mecanismo que Empresa.ultimoFolioRecibo, aquí en
  // Proyecto.ultimoNumeroEstimacion — bloqueo de fila dentro de la misma
  // transacción, dos cierres simultáneos nunca repiten número).
  const proyecto = await tx.proyecto.update({
    where: { id: ctx.proyectoId },
    data: { ultimoNumeroEstimacion: { increment: 1 } },
  });

  const creada = await tx.estimacionCliente.create({
    data: {
      empresaId: ctx.empresaId,
      proyectoId: ctx.proyectoId,
      semanaId: ctx.semanaId,
      numero: proyecto.ultimoNumeroEstimacion,
      estatus: "BORRADOR",
      esquemaContractualUsado: esquemaContractual,
      subtotal: totalesPrivados.subtotal,
      montoAdministracionOUtilidad: totalesPrivados.montoAdministracionOUtilidad,
      total: totalesPrivados.total,
      generadoPorId: ctx.usuarioId,
      detalle: { create: datosDetalle },
    },
  });

  await registrarAuditoriaTx(tx, {
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    entidad: "EstimacionCliente",
    entidadId: creada.id,
    accion: "CREAR",
    valorNuevo: {
      numero: creada.numero,
      total: totalesPrivados.total,
      conceptos: datosDetalle.length,
      origen: ctx.origen ?? "cierre_semana",
    },
  });

  return { tipo: "CREADA", total: totalesPrivados.total };
}

// ---------------------------------------------------------------------------
// Materialización histórica — para una semana que ya estaba CERRADA antes de
// que este módulo existiera (o que por cualquier otra razón nunca disparó la
// generación dentro de cerrarSemana()) y por lo tanto no tiene
// EstimacionCliente. Reutiliza exactamente la misma valorización/numeración
// que el flujo normal (generarOReconciliarEstimacionBorrador) — la única
// diferencia es CUÁNDO se llama y que la bitácora queda marcada como
// backfill, nunca como si hubiera salido del cierre original.
//
// Deliberadamente NO reconcilia ni toca una fila ya existente (BORRADOR o
// EMITIDA) — si ya existe, se considera éxito idempotente y no hace nada más;
// reconciliar es responsabilidad exclusiva del ciclo normal cerrar/reabrir.
// Tampoco reabre la semana, ni toca AvanceConcepto/CorteSemanal/
// MovimientoSemanal — es una operación de solo-lectura sobre esos datos.
// ---------------------------------------------------------------------------

export async function materializarEstimacionHistorica(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<{ id: string; numero: number; yaExistia: boolean; total: number }> {
  if (!puedeMaterializarEstimacionHistorica(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  await obtenerProyecto(usuario, proyectoId);

  const cierre = await db.cierreSemanaProyecto.findUnique({
    where: { proyectoId_semanaId: { proyectoId, semanaId } },
  });
  if (!cierre || cierre.estatus !== "CERRADA") {
    throw new ValidacionError(
      "Esta semana no está cerrada — solo se puede materializar una estimación histórica sobre una semana ya cerrada."
    );
  }

  const existente = await db.estimacionCliente.findUnique({
    where: { proyectoId_semanaId: { proyectoId, semanaId } },
  });
  if (existente) {
    return { id: existente.id, numero: existente.numero, yaExistia: true, total: Number(existente.total) };
  }

  const semana = await db.semana.findFirst({ where: { id: semanaId, empresaId } });
  if (!semana) throw new RegistroNoEncontradoError("La semana");

  return db.$transaction(async (tx) => {
    const resultado = await generarOReconciliarEstimacionBorrador(
      tx,
      { empresaId, proyectoId, semanaId, usuarioId: usuario.id, origen: "backfill_historico" },
      semana
    );

    if (resultado.tipo !== "CREADA") {
      // SIN_AVANCE: la semana en verdad no tuvo avance aprobado — no hay
      // nada que materializar, no se inventa una fila vacía.
      throw new ValidacionError(
        "Esta semana no tiene avance aprobado — no hay nada que materializar."
      );
    }

    const creada = await tx.estimacionCliente.findUniqueOrThrow({
      where: { proyectoId_semanaId: { proyectoId, semanaId } },
    });
    return { id: creada.id, numero: creada.numero, yaExistia: false, total: resultado.total };
  });
}

// ---------------------------------------------------------------------------
// Emitir — solo Administrador/Director, solo sobre una semana cerrada con
// BORRADOR existente. Congela para siempre (ni un recierre posterior la
// vuelve a tocar — ver generarOReconciliarEstimacionBorrador).
// ---------------------------------------------------------------------------

export async function emitirEstimacion(usuario: UsuarioSesion, estimacionId: string) {
  if (!puedeEmitirEstimacionCliente(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  return db.$transaction(async (tx) => {
    // Bloqueo de fila — un doble clic en "Emitir" (o dos requests
    // concurrentes) nunca puede pasar dos veces la validación "todavía no
    // está emitida" y generar dos aplicaciones a fondo (el índice único
    // parcial de MovimientoFinancieroCliente ya lo impediría a nivel de
    // base, pero este candado evita además el error de carrera visible al
    // usuario — sección "Integridad financiera" del diseño, agosto 2026).
    await tx.$queryRaw`SELECT id FROM estimaciones_cliente WHERE id = ${estimacionId} FOR UPDATE`;

    const estimacion = await tx.estimacionCliente.findFirst({
      where: { id: estimacionId, empresaId },
    });
    if (!estimacion) throw new RegistroNoEncontradoError("La estimación");
    if (estimacion.estatus === "EMITIDA") {
      throw new ValidacionError("Esta estimación ya fue emitida.");
    }
    if (Number(estimacion.total) <= 0) {
      throw new ValidacionError("No se puede emitir una estimación sin importe.");
    }

    const actualizada = await tx.estimacionCliente.update({
      where: { id: estimacion.id },
      data: { estatus: "EMITIDA", emitidoPorId: usuario.id, emitidoEn: new Date() },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "EstimacionCliente",
      entidadId: actualizada.id,
      accion: "CAMBIAR_ESTATUS",
      valorAnterior: { estatus: "BORRADOR" },
      valorNuevo: { estatus: "EMITIDA" },
    });

    // Control Contractual — en proyectos FONDO, esta estimación se refleja
    // de inmediato como una aplicación contra el fondo (nunca en
    // PAGO_POR_ESTIMACION, donde queda pendiente de cobro sin generar
    // ningún movimiento todavía — sección 5/9 del diseño).
    const proyecto = await tx.proyecto.findFirst({ where: { id: estimacion.proyectoId } });
    if (proyecto?.esquemaFinanciamientoCliente === "FONDO") {
      const { aplicarEstimacionAFondoSiCorresponde } = await import("./financiero-cliente");
      await aplicarEstimacionAFondoSiCorresponde(
        tx,
        { empresaId, proyectoId: estimacion.proyectoId, usuarioId: usuario.id },
        actualizada
      );
    }

    return actualizada;
  });
}
