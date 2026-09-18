import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeVerContabilidad } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

// Catálogo simple por Empresa de "por qué medio entró/salió el dinero" (ej.
// "BBVA — Cuenta fiscal", "Caja / Efectivo") — deliberadamente sin saldos,
// sin conciliación, sin movimientos propios (Contabilidad, septiembre 2026).

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

export type FilaMedioFinanciero = {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
};

export async function listarMediosFinancieros(
  usuario: UsuarioSesion,
  soloActivos = false
): Promise<FilaMedioFinanciero[]> {
  const empresaId = requerirContabilidad(usuario);
  const medios = await db.medioFinanciero.findMany({
    where: { empresaId, ...(soloActivos ? { activo: true } : {}) },
    orderBy: { nombre: "asc" },
  });
  return medios.map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo, activo: m.activo }));
}

const DatosMedioFinancieroSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  tipo: z.enum(["BANCO", "TARJETA", "EFECTIVO"]),
});

export async function crearMedioFinanciero(usuario: UsuarioSesion, datosCrudos: unknown) {
  const empresaId = requerirContabilidad(usuario);
  const datos = DatosMedioFinancieroSchema.parse(datosCrudos);

  const medio = await db.medioFinanciero.create({ data: { ...datos, empresaId } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "MedioFinanciero",
    entidadId: medio.id,
    accion: "CREAR",
    valorNuevo: { nombre: medio.nombre, tipo: medio.tipo },
  });

  return medio;
}

export async function editarMedioFinanciero(usuario: UsuarioSesion, id: string, datosCrudos: unknown) {
  const empresaId = requerirContabilidad(usuario);
  const datos = DatosMedioFinancieroSchema.parse(datosCrudos);

  const anterior = await db.medioFinanciero.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El medio financiero");

  const medio = await db.medioFinanciero.update({ where: { id }, data: datos });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "MedioFinanciero",
    entidadId: medio.id,
    accion: "EDITAR",
    valorAnterior: { nombre: anterior.nombre, tipo: anterior.tipo },
    valorNuevo: { nombre: medio.nombre, tipo: medio.tipo },
  });

  return medio;
}

export async function cambiarEstatusMedioFinanciero(usuario: UsuarioSesion, id: string, activo: boolean) {
  const empresaId = requerirContabilidad(usuario);
  const anterior = await db.medioFinanciero.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El medio financiero");

  const medio = await db.medioFinanciero.update({ where: { id }, data: { activo } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "MedioFinanciero",
    entidadId: medio.id,
    accion: activo ? "ACTIVAR" : "DESACTIVAR",
    valorAnterior: { activo: anterior.activo },
    valorNuevo: { activo },
  });

  return medio;
}
