import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import { puedeCapturarGastos, puedeAprobarGastos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { RegistroNoEncontradoError } from "./estructura-contractual";

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// ---------------------------------------------------------------------------
// Crear — agrupa gastos APROBADOs del mismo proyecto+semana+beneficiario que
// todavía no estén en otra reposición. Folio atómico por empresa (mismo
// mecanismo que Empresa.ultimoFolioRecibo/ultimoNumeroEstimacion).
// ---------------------------------------------------------------------------

export async function crearReposicion(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string,
  beneficiarioId: string,
  gastoIds: string[]
) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  await obtenerProyecto(usuario, proyectoId);

  if (gastoIds.length === 0) {
    throw new ValidacionError("Selecciona al menos un gasto para incluir en la reposición.");
  }

  return db.$transaction(async (tx) => {
    // Camino rápido con mensaje legible — el índice único parcial (WHERE
    // estatus != 'RECHAZADA') es la garantía real ante una carrera.
    const activaExistente = await tx.reposicionGastos.findFirst({
      where: { proyectoId, semanaId, beneficiarioId, estatus: { not: "RECHAZADA" } },
      select: { folio: true },
    });
    if (activaExistente) {
      throw new ValidacionError(
        `Ya existe una reposición activa (${activaExistente.folio}) para este beneficiario en esta semana.`
      );
    }

    const gastos = await tx.gastoObra.findMany({
      where: { id: { in: gastoIds }, empresaId },
    });
    if (gastos.length !== gastoIds.length) {
      throw new RegistroNoEncontradoError("Alguno de los gastos seleccionados");
    }

    for (const gasto of gastos) {
      if (gasto.proyectoId !== proyectoId || gasto.semanaId !== semanaId) {
        throw new ValidacionError(
          `"${gasto.descripcion}" no pertenece a este proyecto/semana.`
        );
      }
      if (gasto.estatus !== "APROBADO") {
        throw new ValidacionError(`"${gasto.descripcion}" todavía no está aprobado.`);
      }
      if (gasto.pagadorBeneficiarioId !== beneficiarioId) {
        throw new ValidacionError(
          `"${gasto.descripcion}" no fue pagado por este beneficiario.`
        );
      }
      if (gasto.reposicionGastosId) {
        throw new ValidacionError(`"${gasto.descripcion}" ya está incluido en otra reposición.`);
      }
      // Un Supervisor solo arma reposiciones a partir de lo que ÉL capturó —
      // Administrador/Director pueden incluir gastos de cualquiera (sección
      // 13 del diseño de Gastos de Obra).
      if (gasto.capturadoPorId !== usuario.id && !puedeAprobarGastos(usuario)) {
        throw new SinPermisoError();
      }
    }

    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: { ultimoFolioReposicion: { increment: 1 } },
    });
    const folio = `REP-${String(empresa.ultimoFolioReposicion).padStart(6, "0")}`;

    let reposicion;
    try {
      reposicion = await tx.reposicionGastos.create({
        data: {
          empresaId,
          proyectoId,
          semanaId,
          folio,
          numeroFolio: empresa.ultimoFolioReposicion,
          beneficiarioId,
          creadoPorId: usuario.id,
          gastos: { connect: gastoIds.map((id) => ({ id })) },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Carrera real contra el índice único parcial — el pre-check de
        // arriba no la alcanzó a atrapar.
        throw new ValidacionError(
          "Ya existe una reposición activa para este beneficiario en esta semana."
        );
      }
      throw error;
    }

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "ReposicionGastos",
      entidadId: reposicion.id,
      accion: "CREAR",
      valorNuevo: {
        folio: reposicion.folio,
        beneficiarioId,
        gastos: gastoIds.length,
        total: gastos.reduce((t, g) => t + Number(g.monto), 0),
      },
    });

    return reposicion;
  });
}

export async function enviarReposicionARevision(usuario: UsuarioSesion, reposicionId: string) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const reposicion = await db.reposicionGastos.findFirst({ where: { id: reposicionId, empresaId } });
  if (!reposicion) throw new RegistroNoEncontradoError("La reposición");
  if (reposicion.creadoPorId !== usuario.id && !puedeAprobarGastos(usuario)) {
    throw new SinPermisoError();
  }
  if (reposicion.estatus !== "BORRADOR") {
    throw new ValidacionError("Esta reposición ya fue enviada a revisión.");
  }

  const actualizada = await db.reposicionGastos.update({
    where: { id: reposicionId },
    data: { estatus: "ENVIADA_REVISION" },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "ReposicionGastos",
    entidadId: actualizada.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: "BORRADOR" },
    valorNuevo: { estatus: "ENVIADA_REVISION" },
  });

  return actualizada;
}

// ---------------------------------------------------------------------------
// Aprobar — crea el MovimientoSemanal en Reporte General dentro de la misma
// transacción. Bloqueo de fila + índice único de movimientoSemanalId
// garantizan que nunca se genere dos veces, incluso con doble clic o
// requests concurrentes (mismo patrón que registrarPagoEstimacion/
// emitirEstimacion en Control Contractual).
// ---------------------------------------------------------------------------

export async function aprobarReposicion(usuario: UsuarioSesion, reposicionId: string) {
  if (!puedeAprobarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM reposiciones_gastos WHERE id = ${reposicionId} FOR UPDATE`;

    const reposicion = await tx.reposicionGastos.findFirst({
      where: { id: reposicionId, empresaId },
      include: { gastos: true },
    });
    if (!reposicion) throw new RegistroNoEncontradoError("La reposición");
    if (reposicion.estatus === "APROBADA") return reposicion;
    if (reposicion.estatus !== "ENVIADA_REVISION") {
      throw new ValidacionError("Solo se puede aprobar una reposición enviada a revisión.");
    }

    // Si el beneficiario todavía no tiene participación en este proyecto
    // (típico de una reposición ADMINISTRACION — nunca se le exige entrar
    // como Contratista para poder reponerle un gasto), se crea aquí mismo.
    // Idempotente por el @@unique([beneficiarioId, proyectoId]) — mismo
    // patrón que obtenerOCrearParticipacionContratista en
    // estructura-contractual.ts. No crea ningún ContratoContratista, así que
    // nunca hace que este beneficiario aparezca como Contratista.
    const beneficiarioProyecto = await tx.beneficiarioProyecto.upsert({
      where: {
        beneficiarioId_proyectoId: {
          beneficiarioId: reposicion.beneficiarioId,
          proyectoId: reposicion.proyectoId,
        },
      },
      update: {},
      create: {
        beneficiarioId: reposicion.beneficiarioId,
        proyectoId: reposicion.proyectoId,
      },
    });

    const total = reposicion.gastos.reduce((t, g) => t + Number(g.monto), 0);

    const movimiento = await tx.movimientoSemanal.create({
      data: {
        beneficiarioProyectoId: beneficiarioProyecto.id,
        semanaId: reposicion.semanaId,
        origen: "REPOSICION_GASTOS",
        montoFinSemana: total,
        estatusAprobacion: "APROBADO",
        estatusPago: "PENDIENTE_PAGO",
        enviadoPorId: usuario.id,
        aprobadoPorId: usuario.id,
      },
    });

    const actualizada = await tx.reposicionGastos.update({
      where: { id: reposicionId },
      data: {
        estatus: "APROBADA",
        revisadoPorId: usuario.id,
        revisadoEn: new Date(),
        motivoRechazo: null,
        movimientoSemanalId: movimiento.id,
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "ReposicionGastos",
      entidadId: actualizada.id,
      accion: "CONFIRMAR",
      valorAnterior: { estatus: "ENVIADA_REVISION" },
      valorNuevo: { estatus: "APROBADA", total, movimientoSemanalId: movimiento.id },
    });
    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "MovimientoSemanal",
      entidadId: movimiento.id,
      accion: "CREAR",
      valorNuevo: { origen: "REPOSICION_GASTOS", montoFinSemana: total, reposicionId },
    });

    return actualizada;
  });
}

const MotivoRechazoSchema = z.string().trim().min(1, "El motivo del rechazo es obligatorio.");

// Libera los gastos incluidos (reposicionGastosId -> null) para que puedan
// entrar en una reposición futura — un rechazo no debe dejarlos atrapados.
export async function rechazarReposicion(
  usuario: UsuarioSesion,
  reposicionId: string,
  motivoCrudo: unknown
) {
  if (!puedeAprobarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const motivo = MotivoRechazoSchema.parse(motivoCrudo);

  return db.$transaction(async (tx) => {
    const reposicion = await tx.reposicionGastos.findFirst({ where: { id: reposicionId, empresaId } });
    if (!reposicion) throw new RegistroNoEncontradoError("La reposición");
    if (reposicion.estatus !== "ENVIADA_REVISION") {
      throw new ValidacionError("Solo se puede rechazar una reposición enviada a revisión.");
    }

    await tx.gastoObra.updateMany({
      where: { reposicionGastosId: reposicionId },
      data: { reposicionGastosId: null },
    });

    const actualizada = await tx.reposicionGastos.update({
      where: { id: reposicionId },
      data: {
        estatus: "RECHAZADA",
        revisadoPorId: usuario.id,
        revisadoEn: new Date(),
        motivoRechazo: motivo,
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "ReposicionGastos",
      entidadId: actualizada.id,
      accion: "RECHAZAR",
      valorAnterior: { estatus: "ENVIADA_REVISION" },
      valorNuevo: { estatus: "RECHAZADA", motivo },
    });

    return actualizada;
  });
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export type FilaReposicion = {
  id: string;
  folio: string;
  beneficiarioNombre: string;
  estatus: string;
  total: number;
  cantidadGastos: number;
  estatusPago: string | null;
  creadoPorNombre: string;
  motivoRechazo: string | null;
  createdAt: string;
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
      gastos: { select: { monto: true } },
      movimientoSemanal: { select: { estatusPago: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return reposiciones.map((r) => ({
    id: r.id,
    folio: r.folio,
    beneficiarioNombre: r.beneficiario.nombre,
    estatus: r.estatus,
    total: r.gastos.reduce((t, g) => t + Number(g.monto), 0),
    cantidadGastos: r.gastos.length,
    estatusPago: r.movimientoSemanal?.estatusPago ?? null,
    creadoPorNombre: r.creadoPor.nombre,
    motivoRechazo: r.motivoRechazo,
    createdAt: r.createdAt.toISOString(),
  }));
}
