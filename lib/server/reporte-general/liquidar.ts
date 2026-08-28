import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoriaTx } from "@/lib/server/auditoria";
import { puedeLiquidarPagos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

const DatosLiquidacionSchema = z.object({
  fechaPago: z.coerce.date(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA_DEBITO", "TARJETA_CREDITO"]),
  referenciaPago: z.string().trim().optional().nullable(),
  notasPago: z.string().trim().optional().nullable(),
});

// Marca un MovimientoSemanal PENDIENTE_PAGO como LIQUIDADO, guardando la
// evidencia mínima del pago en la misma transacción. Nunca desliquida — un
// movimiento LIQUIDADO queda bloqueado en esta etapa (corrección/ajuste
// auditable queda para más adelante). Mismo patrón que aprobarReposicion/
// autorizarOrdenCompra: bloqueo de fila + transacción + auditoría.
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

    const movimiento = await tx.movimientoSemanal.findFirst({
      where: { id: movimientoId, beneficiarioProyecto: { proyecto: { empresaId } } },
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

    const actualizado = await tx.movimientoSemanal.update({
      where: { id: movimientoId },
      data: {
        estatusPago: "LIQUIDADO",
        fechaPago: datos.fechaPago,
        metodoPago: datos.metodoPago,
        referenciaPago: datos.referenciaPago || null,
        notasPago: datos.notasPago || null,
        liquidadoPorId: usuario.id,
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
      empresaId,
      usuarioId: usuario.id,
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
  });
}
