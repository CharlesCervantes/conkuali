import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoriaTx } from "@/lib/server/auditoria";
import { puedeLiquidarPagos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";
import { motivosDeRevision } from "@/lib/control-de-obra/reposicion-estado";

type Cliente = Prisma.TransactionClient;

const DatosLiquidacionSchema = z.object({
  fechaPago: z.coerce.date(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA_DEBITO", "TARJETA_CREDITO"]),
  referenciaPago: z.string().trim().optional().nullable(),
  notasPago: z.string().trim().optional().nullable(),
});

// R2 — abono final de una reposición al liquidarla. Orden de bloqueo único
// en todo el ciclo de reposiciones: primero el MovimientoSemanal (ya lo tomó
// el llamador), después la ReposicionGastos. Se relee todo con el bloqueo
// tomado. El abono final y el movimiento LIQUIDADO son dos representaciones
// de la MISMA obligación — nunca dos pagos (ver reposicion-estado.ts; C7:
// Tesorería debe usar una sola fuente de pagos por reposición).
async function registrarAbonoFinalReposicionTx(
  tx: Cliente,
  ctx: { empresaId: string; usuarioId: string },
  movimientoId: string,
  montoMovimiento: number,
  datos: z.infer<typeof DatosLiquidacionSchema>
) {
  const ref = await tx.reposicionGastos.findFirst({
    where: { movimientoSemanalId: movimientoId, empresaId: ctx.empresaId },
    select: { id: true },
  });
  // Movimiento de reposición sin ReposicionGastos ligada (dato histórico):
  // se liquida como siempre, sin abono.
  if (!ref) return;

  await tx.$queryRaw`SELECT id FROM reposiciones_gastos WHERE id = ${ref.id} FOR UPDATE`;
  const reposicion = await tx.reposicionGastos.findUniqueOrThrow({
    where: { id: ref.id },
    include: { gastos: { select: { monto: true } }, abonos: { select: { monto: true } } },
  });
  const total = reposicion.gastos.reduce((t, g) => t + Number(g.monto), 0);
  const abonado = reposicion.abonos.reduce((t, a) => t + Number(a.monto), 0);

  // Una inconsistencia histórica (clase B) nunca se corrige sola ni se agrava
  // con un pago nuevo: se bloquea la liquidación hasta revisarla.
  const motivos = motivosDeRevision({
    total,
    abonado,
    cerrada: reposicion.cerrada,
    estatusPago: "PENDIENTE_PAGO",
    montoMovimiento,
  });
  if (motivos.length > 0) {
    throw new ValidacionError(
      "Esta reposición tiene inconsistencias entre sus abonos, su cierre o su importe y requiere revisión antes de liquidarla. No se registró ningún pago."
    );
  }

  const saldo = Math.round((total - abonado) * 100) / 100;
  if (saldo <= 0) return;

  const abono = await tx.abonoReposicion.create({
    data: {
      reposicionGastosId: reposicion.id,
      monto: saldo,
      fecha: datos.fechaPago,
      metodoPago: datos.metodoPago,
      referencia: datos.referenciaPago || null,
      notas: datos.notasPago || null,
      registradoPorId: ctx.usuarioId,
    },
  });
  await registrarAuditoriaTx(tx, {
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    entidad: "AbonoReposicion",
    entidadId: abono.id,
    accion: "CREAR",
    valorNuevo: {
      reposicionGastosId: reposicion.id,
      monto: saldo,
      fecha: datos.fechaPago.toISOString(),
      origen: "LIQUIDACION_REPORTE_GENERAL",
      movimientoSemanalId: movimientoId,
    },
  });
}

// Núcleo reutilizable — asume que el llamador YA tomó el bloqueo de fila del
// movimiento dentro de SU PROPIA transacción (ver liquidarMovimiento, o
// registrarAbonoReposicion en reposiciones.ts, que lo llama cuando el último
// abono deja el saldo en $0 — reposiciones parciales, septiembre 2026).
// Nunca desliquida — un movimiento LIQUIDADO queda bloqueado en esta etapa.
export async function liquidarMovimientoTx(
  tx: Cliente,
  ctx: { empresaId: string; usuarioId: string },
  movimientoId: string,
  datos: z.infer<typeof DatosLiquidacionSchema>
) {
  const movimiento = await tx.movimientoSemanal.findFirst({
    where: { id: movimientoId, beneficiarioProyecto: { proyecto: { empresaId: ctx.empresaId } } },
  });
  if (!movimiento) throw new RegistroNoEncontradoError("El movimiento");

  // Idempotente: doble clic/reintento sobre uno ya liquidado no falla ni
  // vuelve a escribir — regresa el estado actual tal cual.
  if (movimiento.estatusPago === "LIQUIDADO") return movimiento;

  if (movimiento.estatusAprobacion !== "APROBADO") {
    throw new ValidacionError("Solo se puede liquidar un movimiento aprobado.");
  }
  if (movimiento.estatusPago !== "PENDIENTE_PAGO") {
    throw new ValidacionError("Solo se puede liquidar un movimiento pendiente de pago.");
  }
  const monto = Number(movimiento.montoEntreSemana) + Number(movimiento.montoFinSemana);
  if (monto <= 0) {
    throw new ValidacionError("Este movimiento no tiene importe qué liquidar.");
  }

  // R2 (octubre 2026) — una reposición se paga SIEMPRE con abonos: liquidarla
  // aquí registra el abono final por el saldo pendiente (nunca el total
  // original otra vez), dentro de esta misma transacción.
  if (movimiento.origen === "REPOSICION_GASTOS") {
    await registrarAbonoFinalReposicionTx(tx, ctx, movimientoId, monto, datos);
  }

  const actualizado = await tx.movimientoSemanal.update({
    where: { id: movimientoId },
    data: {
      estatusPago: "LIQUIDADO",
      fechaPago: datos.fechaPago,
      metodoPago: datos.metodoPago,
      referenciaPago: datos.referenciaPago || null,
      notasPago: datos.notasPago || null,
      liquidadoPorId: ctx.usuarioId,
      liquidadoEn: new Date(),
    },
  });

  // Cierra la Reposición que este movimiento paga, en el mismo instante de
  // liquidar — no de forma perezosa. Deja el índice único parcial libre de
  // inmediato para una complementaria futura, sin depender de que otra
  // función "descubra" después que ya estaba liquidada (colapso de doble
  // aprobación Gastos→Reposiciones, agosto 2026). Único cambio a esta
  // función — ninguna otra regla de liquidación se toca.
  if (movimiento.origen === "REPOSICION_GASTOS") {
    await tx.reposicionGastos.updateMany({
      where: { movimientoSemanalId: movimientoId },
      data: { cerrada: true },
    });
  }

  await registrarAuditoriaTx(tx, {
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    entidad: "MovimientoSemanal",
    entidadId: movimientoId,
    accion: "CONFIRMAR",
    valorAnterior: { estatusPago: "PENDIENTE_PAGO" },
    valorNuevo: {
      estatusPago: "LIQUIDADO",
      monto,
      metodoPago: datos.metodoPago,
      referenciaPago: datos.referenciaPago ?? null,
      fechaPago: datos.fechaPago,
    },
  });

  return actualizado;
}

// Marca un MovimientoSemanal PENDIENTE_PAGO como LIQUIDADO, guardando la
// evidencia mínima del pago en la misma transacción. Mismo patrón que
// aprobarReposicion/autorizarOrdenCompra: bloqueo de fila + transacción +
// auditoría.
export async function liquidarMovimiento(
  usuario: UsuarioSesion,
  movimientoId: string,
  datosCrudos: unknown
) {
  if (!puedeLiquidarPagos(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  const empresaId = usuario.empresa.id;
  const datos = DatosLiquidacionSchema.parse(datosCrudos);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM movimientos_semanales WHERE id = ${movimientoId} FOR UPDATE`;
    return liquidarMovimientoTx(tx, { empresaId, usuarioId: usuario.id }, movimientoId, datos);
  });
}
