import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { formatMoney } from "@/lib/dinero";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import {
  puedeVerFinancieroCliente,
  puedeRegistrarMovimientoFinancieroCliente,
} from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { EsquemaContractual, EsquemaFinanciamientoCliente } from "@/lib/generated/prisma/enums";
import {
  calcularImportesConcepto,
  type PorcentajesDefaultProyecto,
} from "@/lib/control-de-obra/contrato-general";
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
// Aplicación de una EstimacionCliente contra el Fondo — compartida entre
// emitirEstimacion() (tiempo real) y materializarAplicacionesFondoHistoricas
// (backfill al asignar FONDO por primera vez con estimaciones ya EMITIDAS).
// Nunca se recalcula el monto: siempre es EstimacionCliente.total, ya
// congelado. Camino rápido con findFirst + garantía final con el índice
// único parcial de la migración (WHERE tipo='APLICACION_ESTIMACION') — si
// una carrera real hace chocar el create, se trata como éxito idempotente,
// nunca se deja un error crudo de Postgres.
// ---------------------------------------------------------------------------

async function crearAplicacionEstimacion(
  tx: Cliente,
  ctx: { empresaId: string; proyectoId: string; usuarioId: string },
  estimacion: { id: string; total: Prisma.Decimal; emitidoEn: Date | null; generadoEn: Date },
  origen: "emision" | "backfill_historico_fondo"
): Promise<{ creado: boolean }> {
  const yaExiste = await tx.movimientoFinancieroCliente.findFirst({
    where: { estimacionClienteId: estimacion.id, tipo: "APLICACION_ESTIMACION" },
    select: { id: true },
  });
  if (yaExiste) return { creado: false };

  try {
    const movimiento = await tx.movimientoFinancieroCliente.create({
      data: {
        empresaId: ctx.empresaId,
        proyectoId: ctx.proyectoId,
        tipo: "APLICACION_ESTIMACION",
        monto: estimacion.total,
        fecha: estimacion.emitidoEn ?? estimacion.generadoEn,
        estimacionClienteId: estimacion.id,
        registradoPorId: ctx.usuarioId,
      },
    });
    await registrarAuditoriaTx(tx, {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      entidad: "MovimientoFinancieroCliente",
      entidadId: movimiento.id,
      accion: "CREAR",
      valorNuevo: {
        tipo: "APLICACION_ESTIMACION",
        monto: Number(estimacion.total),
        estimacionClienteId: estimacion.id,
        origen,
      },
    });
    return { creado: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Carrera real contra el índice único parcial — ya existe, éxito
      // idempotente, nunca un error crudo de Postgres para el usuario.
      return { creado: false };
    }
    throw error;
  }
}

// Llamada desde emitirEstimacion() en tiempo real (estimacion-cliente.ts).
export async function aplicarEstimacionAFondoSiCorresponde(
  tx: Cliente,
  ctx: { empresaId: string; proyectoId: string; usuarioId: string },
  estimacion: { id: string; total: Prisma.Decimal; emitidoEn: Date | null; generadoEn: Date }
): Promise<void> {
  await crearAplicacionEstimacion(tx, ctx, estimacion, "emision");
}

// Llamada desde editarProyecto() (proyectos.ts, vía import dinámico para
// evitar un ciclo de módulos) al asignar FONDO por primera vez — genera la
// APLICACION_ESTIMACION faltante de cada EstimacionCliente EMITIDA que ya
// existía antes de que el esquema financiero estuviera definido. Nunca toca
// ni reemite la estimación; idempotente si se vuelve a correr.
export async function materializarAplicacionesFondoHistoricas(
  tx: Cliente,
  ctx: { empresaId: string; proyectoId: string; usuarioId: string }
): Promise<number> {
  const estimaciones = await tx.estimacionCliente.findMany({
    where: {
      proyectoId: ctx.proyectoId,
      estatus: "EMITIDA",
      movimientosFinancieros: { none: { tipo: "APLICACION_ESTIMACION" } },
    },
    select: { id: true, total: true, emitidoEn: true, generadoEn: true },
  });

  let creados = 0;
  for (const estimacion of estimaciones) {
    const resultado = await crearAplicacionEstimacion(
      tx,
      ctx,
      estimacion,
      "backfill_historico_fondo"
    );
    if (resultado.creado) creados++;
  }
  return creados;
}

// ---------------------------------------------------------------------------
// Control Contractual — resumen de proyecto, sin acumulados persistidos:
// todo se agrega en la lectura a partir de EstimacionCliente (EMITIDA) y del
// ledger de movimientos.
// ---------------------------------------------------------------------------

export type ControlContractual = {
  proyecto: {
    nombre: string;
    montoContrato: number;
    esquemaContractual: EsquemaContractual | null;
    esquemaFinanciamientoCliente: EsquemaFinanciamientoCliente | null;
    fechaInicio: string | null;
  };
  avanceFinanciero: {
    totalEmitido: number;
    saldoPorEjercer: number;
    porcentajeEjercido: number;
  };
  fondo: { aportado: number; aplicado: number; disponible: number } | null;
  pagoPorEstimacion: { totalEstimado: number; totalCobrado: number; pendiente: number } | null;
};

export async function obtenerControlContractual(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<ControlContractual> {
  if (!puedeVerFinancieroCliente(usuario)) throw new SinPermisoError();
  const proyecto = await obtenerProyecto(usuario, proyectoId);

  const [conceptos, agregadoEmitido, movimientos] = await Promise.all([
    db.concepto.findMany({
      where: { partida: { proyectoId }, estatus: "ACTIVO" },
      select: {
        cantidadContratada: true,
        precioUnitarioContratista: true,
        precioUnitarioContratistaPrivado: true,
        precioUnitarioMateriales: true,
        precioUnitarioIndirectos: true,
        precioUnitarioHerramienta: true,
        porcentajeUtilidad: true,
        porcentajeAdministracion: true,
      },
    }),
    db.estimacionCliente.aggregate({
      where: { proyectoId, estatus: "EMITIDA" },
      _sum: { total: true },
    }),
    db.movimientoFinancieroCliente.findMany({
      where: { proyectoId },
      select: { tipo: true, monto: true },
    }),
  ]);

  const porcentajesDefault: PorcentajesDefaultProyecto = {
    utilidad: numOrNull(proyecto.porcentajeUtilidadDefault),
    administracion: numOrNull(proyecto.porcentajeAdministracionDefault),
  };

  // Monto del contrato — mismo motor de cálculo privado que ya usa Contrato
  // General Privado (calcularImportesConcepto), sumado sobre todo el
  // proyecto en vez de por partida. Nunca una fórmula nueva.
  const montoContrato = conceptos.reduce((total, c) => {
    const importes = calcularImportesConcepto(
      {
        precioUnitarioContratista: numOrNull(c.precioUnitarioContratista),
        precioUnitarioContratistaPrivado: numOrNull(c.precioUnitarioContratistaPrivado),
        precioUnitarioMateriales: numOrNull(c.precioUnitarioMateriales),
        precioUnitarioIndirectos: numOrNull(c.precioUnitarioIndirectos),
        precioUnitarioHerramienta: numOrNull(c.precioUnitarioHerramienta),
        porcentajeUtilidad: numOrNull(c.porcentajeUtilidad),
        porcentajeAdministracion: numOrNull(c.porcentajeAdministracion),
        cantidadContratada: Number(c.cantidadContratada),
      },
      proyecto.esquemaContractual,
      porcentajesDefault
    );
    return total + importes.importeTotal;
  }, 0);

  const totalEmitido = Number(agregadoEmitido._sum.total ?? 0);
  const saldoPorEjercer = montoContrato - totalEmitido;
  const porcentajeEjercido = montoContrato > 0 ? (totalEmitido / montoContrato) * 100 : 0;

  let fondo: ControlContractual["fondo"] = null;
  let pagoPorEstimacion: ControlContractual["pagoPorEstimacion"] = null;

  if (proyecto.esquemaFinanciamientoCliente === "FONDO") {
    const aportado = movimientos
      .filter((m) => m.tipo === "APORTACION_FONDO")
      .reduce((t, m) => t + Number(m.monto), 0);
    const aplicado = movimientos
      .filter((m) => m.tipo === "APLICACION_ESTIMACION")
      .reduce((t, m) => t + Number(m.monto), 0);
    // Fondo por reponer (negativo) se muestra tal cual — nunca se trunca a 0
    // ni se oculta (sección 10 del diseño de Control Contractual).
    fondo = { aportado, aplicado, disponible: aportado - aplicado };
  } else if (proyecto.esquemaFinanciamientoCliente === "PAGO_POR_ESTIMACION") {
    const totalCobrado = movimientos
      .filter((m) => m.tipo === "PAGO_ESTIMACION")
      .reduce((t, m) => t + Number(m.monto), 0);
    pagoPorEstimacion = {
      totalEstimado: totalEmitido,
      totalCobrado,
      pendiente: totalEmitido - totalCobrado,
    };
  }

  return {
    proyecto: {
      nombre: proyecto.nombre,
      montoContrato,
      esquemaContractual: proyecto.esquemaContractual,
      esquemaFinanciamientoCliente: proyecto.esquemaFinanciamientoCliente,
      fechaInicio: proyecto.fechaInicio?.toISOString() ?? null,
    },
    avanceFinanciero: { totalEmitido, saldoPorEjercer, porcentajeEjercido },
    fondo,
    pagoPorEstimacion,
  };
}

// ---------------------------------------------------------------------------
// Historial semanal — una fila por EstimacionCliente EMITIDA, con columnas
// que dependen del esquema (nunca se fuerzan las mismas si no significan lo
// mismo). Estado de pago siempre derivado, nunca persistido.
// ---------------------------------------------------------------------------

export type EstadoPagoEstimacion = "PENDIENTE" | "PARCIAL" | "PAGADA";

export type FilaHistorialEstimacion = {
  id: string;
  numero: number;
  semanaNumero: number;
  semanaAnio: number;
  importe: number;
  emitidoEn: string | null;
  // FONDO
  aplicadoAlFondo: number | null;
  // PAGO_POR_ESTIMACION
  cobrado: number | null;
  pendiente: number | null;
  estado: EstadoPagoEstimacion | null;
};

export async function obtenerHistorialEstimacionesCliente(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<FilaHistorialEstimacion[]> {
  if (!puedeVerFinancieroCliente(usuario)) throw new SinPermisoError();
  const proyecto = await obtenerProyecto(usuario, proyectoId);

  const estimaciones = await db.estimacionCliente.findMany({
    where: { proyectoId, estatus: "EMITIDA" },
    include: {
      semana: { select: { numero: true, anio: true, fechaInicio: true } },
      movimientosFinancieros: { select: { tipo: true, monto: true } },
    },
    orderBy: { semana: { fechaInicio: "asc" } },
  });

  return estimaciones.map((e) => {
    const importe = Number(e.total);
    const base = {
      id: e.id,
      numero: e.numero,
      semanaNumero: e.semana.numero,
      semanaAnio: e.semana.anio,
      importe,
      emitidoEn: e.emitidoEn?.toISOString() ?? null,
    };

    if (proyecto.esquemaFinanciamientoCliente === "FONDO") {
      const aplicadoAlFondo = e.movimientosFinancieros
        .filter((m) => m.tipo === "APLICACION_ESTIMACION")
        .reduce((t, m) => t + Number(m.monto), 0);
      return { ...base, aplicadoAlFondo, cobrado: null, pendiente: null, estado: null };
    }

    if (proyecto.esquemaFinanciamientoCliente === "PAGO_POR_ESTIMACION") {
      const cobrado = e.movimientosFinancieros
        .filter((m) => m.tipo === "PAGO_ESTIMACION")
        .reduce((t, m) => t + Number(m.monto), 0);
      const pendiente = importe - cobrado;
      const estado: EstadoPagoEstimacion =
        pendiente <= 0 ? "PAGADA" : cobrado > 0 ? "PARCIAL" : "PENDIENTE";
      return { ...base, aplicadoAlFondo: null, cobrado, pendiente, estado };
    }

    return { ...base, aplicadoAlFondo: null, cobrado: null, pendiente: null, estado: null };
  });
}

// ---------------------------------------------------------------------------
// Aportaciones al fondo
// ---------------------------------------------------------------------------

export type FilaAportacionFondo = {
  id: string;
  fecha: string;
  referencia: string | null;
  notas: string | null;
  monto: number;
  registradoPorNombre: string;
};

export async function obtenerAportacionesFondo(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<FilaAportacionFondo[]> {
  if (!puedeVerFinancieroCliente(usuario)) throw new SinPermisoError();
  await obtenerProyecto(usuario, proyectoId);

  const aportaciones = await db.movimientoFinancieroCliente.findMany({
    where: { proyectoId, tipo: "APORTACION_FONDO" },
    include: { registradoPor: { select: { nombre: true } } },
    orderBy: { fecha: "desc" },
  });

  return aportaciones.map((a) => ({
    id: a.id,
    fecha: a.fecha.toISOString(),
    referencia: a.referencia,
    notas: a.notas,
    monto: Number(a.monto),
    registradoPorNombre: a.registradoPor.nombre,
  }));
}

const DatosMovimientoSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a cero."),
  fecha: z.coerce.date(),
  referencia: z.string().trim().optional().nullable(),
  notas: z.string().trim().optional().nullable(),
});

export async function registrarAportacionFondo(
  usuario: UsuarioSesion,
  proyectoId: string,
  datosCrudos: unknown
) {
  if (!puedeRegistrarMovimientoFinancieroCliente(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosMovimientoSchema.parse(datosCrudos);

  const proyecto = await obtenerProyecto(usuario, proyectoId);
  if (proyecto.esquemaFinanciamientoCliente !== "FONDO") {
    throw new ValidacionError("Este proyecto no usa el esquema Fondo.");
  }

  const movimiento = await db.movimientoFinancieroCliente.create({
    data: {
      empresaId,
      proyectoId,
      tipo: "APORTACION_FONDO",
      monto: datos.monto,
      fecha: datos.fecha,
      referencia: datos.referencia || null,
      notas: datos.notas || null,
      registradoPorId: usuario.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "MovimientoFinancieroCliente",
    entidadId: movimiento.id,
    accion: "CREAR",
    valorNuevo: { tipo: "APORTACION_FONDO", monto: datos.monto, fecha: datos.fecha.toISOString() },
  });

  return movimiento;
}

// ---------------------------------------------------------------------------
// Registrar pago de una estimación (PAGO_POR_ESTIMACION) — la secuencia leer
// saldo → validar → insertar corre dentro de una transacción que primero
// toma un candado de fila explícito (SELECT ... FOR UPDATE) sobre la propia
// EstimacionCliente, para que dos pagos concurrentes sobre la MISMA
// estimación nunca puedan sobrepasar el total (sección "Integridad
// financiera" del diseño, agosto 2026).
// ---------------------------------------------------------------------------

export async function registrarPagoEstimacion(
  usuario: UsuarioSesion,
  estimacionId: string,
  datosCrudos: unknown
) {
  if (!puedeRegistrarMovimientoFinancieroCliente(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosMovimientoSchema.parse(datosCrudos);

  return db.$transaction(async (tx) => {
    // Bloqueo de fila — serializa cualquier otro registrarPagoEstimacion
    // concurrente sobre la MISMA estimación hasta que esta transacción
    // termine, así "leer saldo → validar → insertar" es atómico de verdad.
    await tx.$queryRaw`SELECT id FROM estimaciones_cliente WHERE id = ${estimacionId} FOR UPDATE`;

    const estimacion = await tx.estimacionCliente.findFirst({
      where: { id: estimacionId, empresaId },
    });
    if (!estimacion) throw new RegistroNoEncontradoError("La estimación");
    if (estimacion.estatus !== "EMITIDA") {
      throw new ValidacionError("Solo se pueden registrar pagos sobre una estimación emitida.");
    }

    const proyecto = await tx.proyecto.findFirst({ where: { id: estimacion.proyectoId } });
    if (proyecto?.esquemaFinanciamientoCliente !== "PAGO_POR_ESTIMACION") {
      throw new ValidacionError("Este proyecto no usa el esquema Pago por estimación.");
    }

    const agregado = await tx.movimientoFinancieroCliente.aggregate({
      where: { estimacionClienteId: estimacionId, tipo: "PAGO_ESTIMACION" },
      _sum: { monto: true },
    });
    const totalPagado = Number(agregado._sum.monto ?? 0);
    const saldoPendiente = Number(estimacion.total) - totalPagado;

    if (datos.monto > saldoPendiente) {
      throw new ValidacionError(
        `El pago excede el saldo pendiente (${formatMoney(saldoPendiente)}).`
      );
    }

    const movimiento = await tx.movimientoFinancieroCliente.create({
      data: {
        empresaId,
        proyectoId: estimacion.proyectoId,
        tipo: "PAGO_ESTIMACION",
        monto: datos.monto,
        fecha: datos.fecha,
        referencia: datos.referencia || null,
        notas: datos.notas || null,
        estimacionClienteId: estimacionId,
        registradoPorId: usuario.id,
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "MovimientoFinancieroCliente",
      entidadId: movimiento.id,
      accion: "CREAR",
      valorNuevo: {
        tipo: "PAGO_ESTIMACION",
        monto: datos.monto,
        estimacionClienteId: estimacionId,
      },
    });

    return movimiento;
  });
}
