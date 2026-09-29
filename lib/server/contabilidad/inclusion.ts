import "server-only";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeMarcarInclusionContable } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

// Eje 1 — inclusión en Contabilidad. Cambiar este flag es una decisión con
// impacto directo en el Estado de Resultados: siempre auditado (Contabilidad
// — reconocimiento, septiembre 2026, ver docs/negocio/05-modulo-contabilidad.md).

function requerirPermiso(usuario: UsuarioSesion): string {
  if (!puedeMarcarInclusionContable(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

export async function marcarInclusionGasto(usuario: UsuarioSesion, gastoObraId: string, incluido: boolean) {
  const empresaId = requerirPermiso(usuario);

  const anterior = await db.gastoObra.findFirst({ where: { id: gastoObraId, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El gasto");

  const gasto = await db.gastoObra.update({ where: { id: gastoObraId }, data: { incluidoEnContabilidad: incluido } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoObra",
    entidadId: gasto.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { incluidoEnContabilidad: anterior.incluidoEnContabilidad },
    valorNuevo: { incluidoEnContabilidad: incluido },
  });

  return gasto;
}

export async function marcarInclusionCapa(usuario: UsuarioSesion, capaId: string, incluido: boolean) {
  const empresaId = requerirPermiso(usuario);

  const anterior = await db.estimacionClienteCapa.findFirst({
    where: { id: capaId, estimacionCliente: { empresaId } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("La estimación");

  const capa = await db.estimacionClienteCapa.update({ where: { id: capaId }, data: { incluidoEnContabilidad: incluido } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "EstimacionClienteCapa",
    entidadId: capa.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { incluidoEnContabilidad: anterior.incluidoEnContabilidad },
    valorNuevo: { incluidoEnContabilidad: incluido },
  });

  return capa;
}

// Solo tiene efecto real sobre movimientos APORTACION_FONDO (sin capa) — ver
// MovimientoFinancieroCliente.incluidoEnContabilidad en el schema. Se
// permite llamar sobre cualquier movimiento por simplicidad del endpoint,
// pero el motor del Estado de Resultados nunca lee este campo para
// movimientos con capa (siempre hereda de la capa).
export async function marcarInclusionMovimientoFondo(usuario: UsuarioSesion, movimientoId: string, incluido: boolean) {
  const empresaId = requerirPermiso(usuario);

  const anterior = await db.movimientoFinancieroCliente.findFirst({ where: { id: movimientoId, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El movimiento");

  const movimiento = await db.movimientoFinancieroCliente.update({
    where: { id: movimientoId },
    data: { incluidoEnContabilidad: incluido },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "MovimientoFinancieroCliente",
    entidadId: movimiento.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { incluidoEnContabilidad: anterior.incluidoEnContabilidad },
    valorNuevo: { incluidoEnContabilidad: incluido },
  });

  return movimiento;
}
