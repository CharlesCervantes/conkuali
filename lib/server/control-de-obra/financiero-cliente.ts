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
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";
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

function suma(movs: { tipo: string; monto: Prisma.Decimal }[], tipo: string): number {
  return movs.filter((m) => m.tipo === tipo).reduce((t, m) => t + Number(m.monto), 0);
}

// ---------------------------------------------------------------------------
// Aplicación de fondo contra una estimación — toda obra se cobra por
// Estimación; el fondo es una fuente de recursos opcional (existe si el
// proyecto tiene al menos una APORTACION_FONDO) que puede cubrir total o
// parcialmente cualquier estimación EMITIDA, nunca un esquema alternativo
// (rediseño del modelo financiero del cliente, agosto 2026). Se usa tanto
// automáticamente al emitir (si se elige la casilla) como manualmente desde
// "Aplicar fondo" en el historial — una sola implementación del cálculo.
// Una misma estimación puede acumular varias APLICACION_ESTIMACION en fechas
// distintas; la integridad ("nunca aplicar más de lo aportado") la da el
// bloqueo de fila sobre Proyecto que toma cada llamador antes de leer
// disponible, no un índice único.
// ---------------------------------------------------------------------------

export async function aplicarFondoAEstimacionTx(
  tx: Cliente,
  ctx: { empresaId: string; proyectoId: string; usuarioId: string },
  estimacionId: string,
  // undefined = aplicar el máximo posible; con valor = tope adicional (nunca
  // aplica más de lo disponible ni más del saldo pendiente de esta
  // estimación). Nunca crea un movimiento de $0.
  montoSolicitado?: number
): Promise<{ aplicado: number }> {
  const movimientosProyecto = await tx.movimientoFinancieroCliente.findMany({
    where: { proyectoId: ctx.proyectoId },
    select: { tipo: true, monto: true, estimacionClienteId: true },
  });
  const disponible =
    suma(movimientosProyecto, "APORTACION_FONDO") - suma(movimientosProyecto, "APLICACION_ESTIMACION");
  if (disponible <= 0) return { aplicado: 0 };

  const estimacion = await tx.estimacionCliente.findFirstOrThrow({ where: { id: estimacionId } });
  const cubiertoDeEsta = movimientosProyecto
    .filter((m) => m.estimacionClienteId === estimacionId && m.tipo !== "APORTACION_FONDO")
    .reduce((t, m) => t + Number(m.monto), 0); // aplicaciones + pagos ya existentes de ESTA estimación
  const saldo = Number(estimacion.total) - cubiertoDeEsta;
  if (saldo <= 0) return { aplicado: 0 };

  const tope = montoSolicitado !== undefined ? Math.min(montoSolicitado, disponible) : disponible;
  const aplicar = Math.min(tope, saldo);
  if (aplicar <= 0) return { aplicado: 0 };

  const movimiento = await tx.movimientoFinancieroCliente.create({
    data: {
      empresaId: ctx.empresaId,
      proyectoId: ctx.proyectoId,
      tipo: "APLICACION_ESTIMACION",
      monto: aplicar,
      fecha: new Date(),
      estimacionClienteId: estimacionId,
      registradoPorId: ctx.usuarioId,
    },
  });
  await registrarAuditoriaTx(tx, {
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    entidad: "MovimientoFinancieroCliente",
    entidadId: movimiento.id,
    accion: "CREAR",
    valorNuevo: { tipo: "APLICACION_ESTIMACION", monto: aplicar, estimacionClienteId: estimacionId },
  });
  return { aplicado: aplicar };
}

const MontoAplicacionSchema = z.coerce.number().positive("El monto debe ser mayor a cero.").optional();

// Acción manual "Aplicar fondo" — decisión explícita de Administrador/
// Director sobre CUÁNDO usar el fondo disponible contra una estimación
// pendiente específica (nunca automático al registrar una aportación).
// `montoCrudo` opcional: sin valor, aplica el máximo posible.
export async function aplicarFondoAEstimacion(
  usuario: UsuarioSesion,
  estimacionId: string,
  montoCrudo?: unknown
): Promise<{ aplicado: number }> {
  if (!puedeRegistrarMovimientoFinancieroCliente(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const monto = MontoAplicacionSchema.parse(montoCrudo);

  const referencia = await db.estimacionCliente.findFirst({
    where: { id: estimacionId, empresaId },
    select: { proyectoId: true },
  });
  if (!referencia) throw new RegistroNoEncontradoError("La estimación");

  return db.$transaction(async (tx) => {
    // Mismo orden de bloqueo en las tres transacciones financieras
    // (proyecto primero, luego la estimación) — evita deadlock.
    await tx.$queryRaw`SELECT id FROM proyectos WHERE id = ${referencia.proyectoId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM estimaciones_cliente WHERE id = ${estimacionId} FOR UPDATE`;

    const estimacion = await tx.estimacionCliente.findFirst({ where: { id: estimacionId, empresaId } });
    if (!estimacion) throw new RegistroNoEncontradoError("La estimación");
    if (estimacion.estatus !== "EMITIDA") {
      throw new ValidacionError("Solo se puede aplicar fondo a una estimación emitida.");
    }

    const resultado = await aplicarFondoAEstimacionTx(
      tx,
      { empresaId, proyectoId: referencia.proyectoId, usuarioId: usuario.id },
      estimacionId,
      monto
    );
    if (resultado.aplicado === 0) {
      throw new ValidacionError("No hay fondo disponible, o esta estimación ya está cubierta.");
    }
    return resultado;
  });
}

// ---------------------------------------------------------------------------
// Control Contractual — resumen de proyecto, sin acumulados persistidos:
// todo se agrega en la lectura a partir de EstimacionCliente (EMITIDA) y del
// ledger de movimientos. Una sola vista para todo proyecto — el fondo es un
// bloque adicional que aparece solo si existen aportaciones (dato, nunca un
// esquema elegido de antemano).
// ---------------------------------------------------------------------------

export type ControlContractual = {
  proyecto: {
    nombre: string;
    montoContrato: number;
    esquemaContractual: EsquemaContractual | null;
    fechaInicio: string | null;
  };
  contrato: {
    totalEstimado: number;
    totalCubierto: number; // aplicado de fondo + pagado directo
    pendienteCobro: number;
    saldoPorEjercer: number; // montoContrato - totalEstimado
    porcentajeEjercido: number;
  };
  // null únicamente si el proyecto nunca ha recibido una aportación.
  fondo: { aportado: number; aplicado: number; disponible: number } | null;
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

  const aportado = suma(movimientos, "APORTACION_FONDO");
  const aplicado = suma(movimientos, "APLICACION_ESTIMACION");
  const pagado = suma(movimientos, "PAGO_ESTIMACION");
  const totalCubierto = aplicado + pagado;

  return {
    proyecto: {
      nombre: proyecto.nombre,
      montoContrato,
      esquemaContractual: proyecto.esquemaContractual,
      fechaInicio: proyecto.fechaInicio?.toISOString() ?? null,
    },
    contrato: {
      totalEstimado: totalEmitido,
      totalCubierto,
      pendienteCobro: totalEmitido - totalCubierto,
      saldoPorEjercer,
      porcentajeEjercido,
    },
    fondo: aportado > 0 ? { aportado, aplicado, disponible: aportado - aplicado } : null,
  };
}

// ---------------------------------------------------------------------------
// Historial semanal — una fila por EstimacionCliente EMITIDA, misma
// estructura para cualquier proyecto (con o sin fondo). Estado siempre
// derivado, nunca persistido.
// ---------------------------------------------------------------------------

export type EstadoPagoEstimacion = "PENDIENTE" | "PARCIAL" | "CUBIERTA";

export type FilaHistorialEstimacion = {
  id: string;
  numero: number;
  semanaNumero: number;
  semanaAnio: number;
  importe: number;
  emitidoEn: string | null;
  aplicadoFondo: number;
  pagoDirecto: number;
  pendiente: number;
  estado: EstadoPagoEstimacion;
};

export async function obtenerHistorialEstimacionesCliente(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<FilaHistorialEstimacion[]> {
  if (!puedeVerFinancieroCliente(usuario)) throw new SinPermisoError();
  await obtenerProyecto(usuario, proyectoId);

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
    const aplicadoFondo = suma(e.movimientosFinancieros, "APLICACION_ESTIMACION");
    const pagoDirecto = suma(e.movimientosFinancieros, "PAGO_ESTIMACION");
    const pendiente = importe - aplicadoFondo - pagoDirecto;
    const estado: EstadoPagoEstimacion =
      pendiente <= 0 ? "CUBIERTA" : aplicadoFondo > 0 || pagoDirecto > 0 ? "PARCIAL" : "PENDIENTE";

    return {
      id: e.id,
      numero: e.numero,
      semanaNumero: e.semana.numero,
      semanaAnio: e.semana.anio,
      importe,
      emitidoEn: e.emitidoEn?.toISOString() ?? null,
      aplicadoFondo,
      pagoDirecto,
      pendiente,
      estado,
    };
  });
}

// ---------------------------------------------------------------------------
// Aportaciones al fondo — solo aumentan lo disponible; nunca aplican nada
// por sí solas (decisión de sesión, agosto 2026: Administrador/Director
// decide cuándo usar el fondo, vía "Aplicar fondo" en el historial).
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
  await obtenerProyecto(usuario, proyectoId);

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
// Registrar pago directo de una estimación — cualquier proyecto, con o sin
// fondo. El saldo pendiente descuenta TANTO aplicaciones de fondo como
// pagos ya registrados (una estimación puede tener ambos a la vez). Toma el
// lock del proyecto además del de la propia estimación: el saldo depende de
// aplicaciones de fondo que "Aplicar fondo" también escribe bajo el lock del
// proyecto, así que leerlo de forma segura requiere el mismo candado.
// ---------------------------------------------------------------------------

export async function registrarPagoEstimacion(
  usuario: UsuarioSesion,
  estimacionId: string,
  datosCrudos: unknown
) {
  if (!puedeRegistrarMovimientoFinancieroCliente(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosMovimientoSchema.parse(datosCrudos);

  const referencia = await db.estimacionCliente.findFirst({
    where: { id: estimacionId, empresaId },
    select: { proyectoId: true },
  });
  if (!referencia) throw new RegistroNoEncontradoError("La estimación");

  return db.$transaction(async (tx) => {
    // Mismo orden de bloqueo que aplicarFondoAEstimacion/emitirEstimacion:
    // proyecto primero, luego la estimación.
    await tx.$queryRaw`SELECT id FROM proyectos WHERE id = ${referencia.proyectoId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM estimaciones_cliente WHERE id = ${estimacionId} FOR UPDATE`;

    const estimacion = await tx.estimacionCliente.findFirst({
      where: { id: estimacionId, empresaId },
    });
    if (!estimacion) throw new RegistroNoEncontradoError("La estimación");
    if (estimacion.estatus !== "EMITIDA") {
      throw new ValidacionError("Solo se pueden registrar pagos sobre una estimación emitida.");
    }

    const movimientosPrevios = await tx.movimientoFinancieroCliente.findMany({
      where: { estimacionClienteId: estimacionId, tipo: { in: ["PAGO_ESTIMACION", "APLICACION_ESTIMACION"] } },
      select: { tipo: true, monto: true },
    });
    const totalPagado = suma(movimientosPrevios, "PAGO_ESTIMACION");
    const totalAplicado = suma(movimientosPrevios, "APLICACION_ESTIMACION");
    const saldoPendiente = Number(estimacion.total) - totalPagado - totalAplicado;

    if (datos.monto > saldoPendiente) {
      throw new ValidacionError(
        `El pago excede el saldo pendiente (${formatMoney(saldoPendiente)}).`
      );
    }

    const movimiento = await tx.movimientoFinancieroCliente.create({
      data: {
        empresaId,
        proyectoId: referencia.proyectoId,
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
