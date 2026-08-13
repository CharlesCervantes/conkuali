import "server-only";
import { cache } from "react";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { EstatusProyecto } from "@/lib/generated/prisma/enums";

export class SinPermisoError extends Error {
  constructor() {
    super("No tienes permiso para administrar proyectos.");
    this.name = "SinPermisoError";
  }
}

export class ProyectoNoEncontradoError extends Error {
  constructor() {
    super("El proyecto no existe o no pertenece a tu empresa.");
    this.name = "ProyectoNoEncontradoError";
  }
}

export class ValidacionError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ValidacionError";
  }
}

const DatosProyectoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  tipo: z.enum(["FORMAL", "MOMENTANEA", "OFICINA"]).default("FORMAL"),
  cliente: z.string().trim().optional().nullable(),
  ubicacion: z.string().trim().optional().nullable(),
  numeroContrato: z.string().trim().optional().nullable(),
  descripcion: z.string().trim().optional().nullable(),
  notas: z.string().trim().optional().nullable(),
  fechaInicio: z.coerce.date().optional().nullable(),
  fechaEstimadaTermino: z.coerce.date().optional().nullable(),
});

export type DatosProyecto = z.infer<typeof DatosProyectoSchema>;

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function requerirAdmin(usuario: UsuarioSesion): string {
  if (!puedeAdministrarProyectos(usuario)) throw new SinPermisoError();
  return requerirEmpresa(usuario);
}

export async function listarProyectos(usuario: UsuarioSesion) {
  const empresaId = requerirEmpresa(usuario);
  return db.proyecto.findMany({
    where: { empresaId },
    orderBy: { nombre: "asc" },
  });
}

// cache() evita repetir esta consulta cuando layout.tsx y page.tsx la piden
// ambos dentro del mismo request (mismo patrón que verifySession en dal.ts).
export const obtenerProyecto = cache(async (usuario: UsuarioSesion, id: string) => {
  const empresaId = requerirEmpresa(usuario);
  const proyecto = await db.proyecto.findFirst({ where: { id, empresaId } });
  if (!proyecto) throw new ProyectoNoEncontradoError();
  return proyecto;
});

export async function crearProyecto(usuario: UsuarioSesion, datosCrudos: unknown) {
  const empresaId = requerirAdmin(usuario);
  const datos = DatosProyectoSchema.parse(datosCrudos);

  const proyecto = await db.proyecto.create({
    data: { ...datos, empresaId },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Proyecto",
    entidadId: proyecto.id,
    accion: "CREAR",
    valorNuevo: proyecto,
  });

  return proyecto;
}

export async function editarProyecto(
  usuario: UsuarioSesion,
  id: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  const datos = DatosProyectoSchema.parse(datosCrudos);

  const anterior = await db.proyecto.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new ProyectoNoEncontradoError();

  const proyecto = await db.proyecto.update({
    where: { id },
    data: datos,
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Proyecto",
    entidadId: proyecto.id,
    accion: "EDITAR",
    valorAnterior: anterior,
    valorNuevo: proyecto,
  });

  return proyecto;
}

const ESTATUS_VALIDOS: EstatusProyecto[] = [
  "ACTIVO",
  "PAUSADO",
  "CERRADO",
  "CANCELADO",
];

export async function cambiarEstatusProyecto(
  usuario: UsuarioSesion,
  id: string,
  nuevoEstatus: string
) {
  const empresaId = requerirAdmin(usuario);
  if (!ESTATUS_VALIDOS.includes(nuevoEstatus as EstatusProyecto)) {
    throw new ValidacionError(`Estatus inválido: ${nuevoEstatus}`);
  }
  const estatus = nuevoEstatus as EstatusProyecto;

  const anterior = await db.proyecto.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new ProyectoNoEncontradoError();

  // Al cerrar por primera vez se registra la fecha real de cierre — no se
  // sobreescribe si ya existía (ej. se reabrió y se vuelve a cerrar).
  const fechaCierre =
    estatus === "CERRADO" && !anterior.fechaCierre ? new Date() : undefined;

  const proyecto = await db.proyecto.update({
    where: { id },
    data: { estatus, ...(fechaCierre ? { fechaCierre } : {}) },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Proyecto",
    entidadId: proyecto.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: anterior.estatus },
    valorNuevo: { estatus: proyecto.estatus },
  });

  return proyecto;
}
