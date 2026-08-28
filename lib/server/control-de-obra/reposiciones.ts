import "server-only";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoriaTx } from "@/lib/server/auditoria";
import { puedeCapturarGastos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, obtenerProyecto } from "./proyectos";

type Cliente = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// La Reposición ya no es un segundo flujo de aprobación — es el agrupador de
// pago que se arma solo cuando se aprueba un gasto pagado personalmente
// (aprobarGasto, en gastos.ts, es el único punto de entrada; nunca se llama
// directamente desde una Server Action ni desde la UI). Colapso de doble
// aprobación Gastos→Reposiciones, agosto 2026.
// ---------------------------------------------------------------------------

async function crearReposicionAutomaticaTx(
  tx: Cliente,
  ctx: { empresaId: string; usuarioId: string; proyectoId: string; semanaId: string; beneficiarioId: string }
) {
  const empresa = await tx.empresa.update({
    where: { id: ctx.empresaId },
    data: { ultimoFolioReposicion: { increment: 1 } },
  });
  const folio = `REP-${String(empresa.ultimoFolioReposicion).padStart(6, "0")}`;

  try {
    const reposicion = await tx.reposicionGastos.create({
      data: {
        empresaId: ctx.empresaId,
        proyectoId: ctx.proyectoId,
        semanaId: ctx.semanaId,
        beneficiarioId: ctx.beneficiarioId,
        folio,
        numeroFolio: empresa.ultimoFolioReposicion,
        // Ya no hay borrador/envío a revisión — el contenido de una
        // reposición siempre está aprobado por construcción (cada gasto que
        // entra ya pasó su propia aprobación).
        estatus: "APROBADA",
        creadoPorId: ctx.usuarioId,
      },
    });
    await registrarAuditoriaTx(tx, {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      entidad: "ReposicionGastos",
      entidadId: reposicion.id,
      accion: "CREAR",
      valorNuevo: { folio: reposicion.folio, beneficiarioId: ctx.beneficiarioId },
    });
    return reposicion;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Carrera real contra el índice único parcial (dos gastos del mismo
      // beneficiario aprobados casi al mismo tiempo) — nunca se duplica,
      // se reutiliza la que ganó la carrera.
      return tx.reposicionGastos.findFirstOrThrow({
        where: {
          proyectoId: ctx.proyectoId,
          semanaId: ctx.semanaId,
          beneficiarioId: ctx.beneficiarioId,
          cerrada: false,
          estatus: { not: "RECHAZADA" },
        },
      });
    }
    throw error;
  }
}

// Llamada exclusivamente desde aprobarGasto (gastos.ts), dentro de su misma
// transacción — nunca expuesta como Server Action propia. Encuentra o crea
// la reposición abierta de este beneficiario+proyecto+semana, le agrega el
// gasto y crea/reconcilia su MovimientoSemanal en un solo paso.
export async function asignarGastoAReposicionTx(
  tx: Cliente,
  ctx: {
    empresaId: string;
    usuarioId: string;
    proyectoId: string;
    semanaId: string;
    beneficiarioId: string;
    gastoId: string;
  }
): Promise<void> {
  let reposicion = await tx.reposicionGastos.findFirst({
    where: {
      empresaId: ctx.empresaId,
      proyectoId: ctx.proyectoId,
      semanaId: ctx.semanaId,
      beneficiarioId: ctx.beneficiarioId,
      cerrada: false,
      estatus: { not: "RECHAZADA" },
    },
  });

  if (reposicion) {
    await tx.$queryRaw`SELECT id FROM reposiciones_gastos WHERE id = ${reposicion.id} FOR UPDATE`;
    reposicion = await tx.reposicionGastos.findUniqueOrThrow({ where: { id: reposicion.id } });

    // Defensivo: liquidarMovimiento ya marca `cerrada` en el momento real de
    // liquidar, pero nunca se confía ciegamente en la columna — si se
    // encuentra desincronizada (datos históricos u otra vía), se cierra aquí
    // mismo antes de continuar.
    if (!reposicion.cerrada && reposicion.movimientoSemanalId) {
      const movimiento = await tx.movimientoSemanal.findUnique({
        where: { id: reposicion.movimientoSemanalId },
        select: { estatusPago: true },
      });
      if (movimiento?.estatusPago === "LIQUIDADO") {
        await tx.reposicionGastos.update({ where: { id: reposicion.id }, data: { cerrada: true } });
        reposicion = null;
      }
    }
  }

  if (!reposicion) {
    reposicion = await crearReposicionAutomaticaTx(tx, ctx);
  }

  await tx.gastoObra.update({
    where: { id: ctx.gastoId },
    data: { reposicionGastosId: reposicion.id },
  });

  const gastosIncluidos = await tx.gastoObra.findMany({
    where: { reposicionGastosId: reposicion.id },
    select: { monto: true },
  });
  const total = gastosIncluidos.reduce((t, g) => t + Number(g.monto), 0);

  // Requerido por MovimientoSemanal.beneficiarioProyectoId — nunca crea un
  // ContratoContratista, así que nunca hace que este beneficiario aparezca
  // como Contratista solo por tener una reposición.
  const beneficiarioProyecto = await tx.beneficiarioProyecto.upsert({
    where: {
      beneficiarioId_proyectoId: { beneficiarioId: ctx.beneficiarioId, proyectoId: ctx.proyectoId },
    },
    update: {},
    create: { beneficiarioId: ctx.beneficiarioId, proyectoId: ctx.proyectoId },
  });

  if (reposicion.movimientoSemanalId) {
    const anterior = await tx.movimientoSemanal.findUniqueOrThrow({
      where: { id: reposicion.movimientoSemanalId },
    });
    if (Number(anterior.montoFinSemana) !== total) {
      await tx.movimientoSemanal.update({
        where: { id: reposicion.movimientoSemanalId },
        data: { montoFinSemana: total },
      });
      await registrarAuditoriaTx(tx, {
        empresaId: ctx.empresaId,
        usuarioId: ctx.usuarioId,
        entidad: "MovimientoSemanal",
        entidadId: reposicion.movimientoSemanalId,
        accion: "EDITAR",
        valorAnterior: { montoFinSemana: Number(anterior.montoFinSemana) },
        valorNuevo: { montoFinSemana: total },
      });
    }
  } else {
    const movimiento = await tx.movimientoSemanal.create({
      data: {
        beneficiarioProyectoId: beneficiarioProyecto.id,
        semanaId: ctx.semanaId,
        origen: "REPOSICION_GASTOS",
        montoFinSemana: total,
        estatusAprobacion: "APROBADO",
        estatusPago: "PENDIENTE_PAGO",
        enviadoPorId: ctx.usuarioId,
        aprobadoPorId: ctx.usuarioId,
      },
    });
    await tx.reposicionGastos.update({
      where: { id: reposicion.id },
      data: { movimientoSemanalId: movimiento.id },
    });
    await registrarAuditoriaTx(tx, {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      entidad: "MovimientoSemanal",
      entidadId: movimiento.id,
      accion: "CREAR",
      valorNuevo: { origen: "REPOSICION_GASTOS", montoFinSemana: total, reposicionId: reposicion.id },
    });
  }
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export type FilaGastoReposicion = {
  id: string;
  descripcion: string;
  fecha: string;
  monto: number;
};

export type FilaReposicion = {
  id: string;
  folio: string;
  beneficiarioNombre: string;
  total: number;
  cantidadGastos: number;
  estatusPago: string | null;
  cerrada: boolean;
  creadoPorNombre: string;
  createdAt: string;
  gastos: FilaGastoReposicion[];
};

export async function obtenerReposiciones(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<FilaReposicion[]> {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  await obtenerProyecto(usuario, proyectoId);

  const reposiciones = await db.reposicionGastos.findMany({
    where: { proyectoId, semanaId },
    include: {
      beneficiario: { select: { nombre: true } },
      creadoPor: { select: { nombre: true } },
      gastos: { select: { id: true, descripcion: true, fecha: true, monto: true } },
      movimientoSemanal: { select: { estatusPago: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return reposiciones.map((r) => ({
    id: r.id,
    folio: r.folio,
    beneficiarioNombre: r.beneficiario.nombre,
    total: r.gastos.reduce((t, g) => t + Number(g.monto), 0),
    cantidadGastos: r.gastos.length,
    estatusPago: r.movimientoSemanal?.estatusPago ?? null,
    cerrada: r.cerrada,
    creadoPorNombre: r.creadoPor.nombre,
    createdAt: r.createdAt.toISOString(),
    gastos: r.gastos.map((g) => ({
      id: g.id,
      descripcion: g.descripcion,
      fecha: g.fecha.toISOString(),
      monto: Number(g.monto),
    })),
  }));
}
