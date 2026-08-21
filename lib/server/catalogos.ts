import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeAdministrarCatalogos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// ---------------------------------------------------------------------------
// Activar / desactivar — común a los tres catálogos. Nunca hay borrado físico
// (no existe en ningún lugar del código hoy) — activo/inactivo conserva el
// historial de negocio.
// ---------------------------------------------------------------------------

export async function cambiarEstatusBeneficiario(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  activo: boolean
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const beneficiario = await db.beneficiario.findFirst({ where: { id: beneficiarioId, empresaId } });
  if (!beneficiario) throw new RegistroNoEncontradoError("El beneficiario");
  if (beneficiario.activo === activo) return beneficiario;

  const actualizado = await db.beneficiario.update({
    where: { id: beneficiarioId },
    data: { activo },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: actualizado.id,
    accion: activo ? "ACTIVAR" : "DESACTIVAR",
    valorAnterior: { activo: beneficiario.activo },
    valorNuevo: { activo },
  });

  return actualizado;
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

const DatosProveedorSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  giro: z.string().trim().optional().nullable(),
  vendedor: z.string().trim().optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  credito: z.string().trim().optional().nullable(),
  cuentaBancaria: z.string().trim().optional().nullable(),
  // Solo dato de identidad — sin validación de formato ni lógica fiscal
  // asociada (se reutilizará cuando exista el Estado de Cuenta Fiscal).
  rfc: z.string().trim().optional().nullable(),
});

export type FilaProveedorCatalogo = {
  id: string;
  nombre: string;
  activo: boolean;
  giro: string | null;
  vendedor: string | null;
  telefono: string | null;
  credito: string | null;
  cuentaBancaria: string | null;
  rfc: string | null;
};

function filaProveedor(b: {
  id: string;
  nombre: string;
  activo: boolean;
  proveedor: {
    giro: string | null;
    vendedor: string | null;
    telefono: string | null;
    credito: string | null;
    cuentaBancaria: string | null;
    rfc: string | null;
  } | null;
}): FilaProveedorCatalogo {
  return {
    id: b.id,
    nombre: b.nombre,
    activo: b.activo,
    giro: b.proveedor?.giro ?? null,
    vendedor: b.proveedor?.vendedor ?? null,
    telefono: b.proveedor?.telefono ?? null,
    credito: b.proveedor?.credito ?? null,
    cuentaBancaria: b.proveedor?.cuentaBancaria ?? null,
    rfc: b.proveedor?.rfc ?? null,
  };
}

export async function listarProveedores(usuario: UsuarioSesion): Promise<FilaProveedorCatalogo[]> {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const proveedores = await db.beneficiario.findMany({
    where: { empresaId, tipo: "PROVEEDOR" },
    orderBy: { nombre: "asc" },
    include: { proveedor: true },
  });

  return proveedores.map(filaProveedor);
}

export async function crearProveedor(usuario: UsuarioSesion, datosCrudos: unknown) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosProveedorSchema.parse(datosCrudos);

  const beneficiario = await db.beneficiario.create({
    data: {
      empresaId,
      tipo: "PROVEEDOR",
      nombre: datos.nombre,
      proveedor: {
        create: {
          giro: datos.giro || null,
          vendedor: datos.vendedor || null,
          telefono: datos.telefono || null,
          credito: datos.credito || null,
          cuentaBancaria: datos.cuentaBancaria || null,
          rfc: datos.rfc || null,
        },
      },
    },
    include: { proveedor: true },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "CREAR",
    valorNuevo: { tipo: "PROVEEDOR", nombre: beneficiario.nombre },
  });

  return filaProveedor(beneficiario);
}

export async function editarProveedor(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  datosCrudos: unknown
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosProveedorSchema.parse(datosCrudos);

  const anterior = await db.beneficiario.findFirst({
    where: { id: beneficiarioId, empresaId, tipo: "PROVEEDOR" },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El proveedor");

  const beneficiario = await db.beneficiario.update({
    where: { id: beneficiarioId },
    data: {
      nombre: datos.nombre,
      proveedor: {
        update: {
          giro: datos.giro || null,
          vendedor: datos.vendedor || null,
          telefono: datos.telefono || null,
          credito: datos.credito || null,
          cuentaBancaria: datos.cuentaBancaria || null,
          rfc: datos.rfc || null,
        },
      },
    },
    include: { proveedor: true },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "EDITAR",
    valorAnterior: { nombre: anterior.nombre },
    valorNuevo: { nombre: beneficiario.nombre },
  });

  return filaProveedor(beneficiario);
}

// ---------------------------------------------------------------------------
// Contratistas — catálogo global de identidad. Lo específico de cada obra
// (concepto, montoContrato, ContratoContratista) sigue viviendo exclusivamente
// en BeneficiarioProyecto/ContratoContratista, sin duplicarse aquí.
// ---------------------------------------------------------------------------

const DatosIdentidadSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
});

export type FilaContratistaCatalogo = {
  id: string;
  nombre: string;
  activo: boolean;
  proyectosActivos: number;
};

export async function listarContratistasCatalogo(
  usuario: UsuarioSesion
): Promise<FilaContratistaCatalogo[]> {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const contratistas = await db.beneficiario.findMany({
    where: { empresaId, tipo: "CONTRATISTA" },
    orderBy: { nombre: "asc" },
    include: {
      _count: { select: { proyectos: { where: { activo: true } } } },
    },
  });

  return contratistas.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    activo: c.activo,
    proyectosActivos: c._count.proyectos,
  }));
}

export async function crearContratista(usuario: UsuarioSesion, datosCrudos: unknown) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosIdentidadSchema.parse(datosCrudos);

  // Existe por sí solo, sin necesitar ningún BeneficiarioProyecto — se puede
  // dar de alta en el catálogo sin asignarlo todavía a ninguna obra.
  const beneficiario = await db.beneficiario.create({
    data: { empresaId, tipo: "CONTRATISTA", nombre: datos.nombre },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "CREAR",
    valorNuevo: { tipo: "CONTRATISTA", nombre: beneficiario.nombre },
  });

  return { id: beneficiario.id, nombre: beneficiario.nombre, activo: beneficiario.activo, proyectosActivos: 0 };
}

export async function editarContratista(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  datosCrudos: unknown
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosIdentidadSchema.parse(datosCrudos);

  const anterior = await db.beneficiario.findFirst({
    where: { id: beneficiarioId, empresaId, tipo: "CONTRATISTA" },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El contratista");

  const beneficiario = await db.beneficiario.update({
    where: { id: beneficiarioId },
    data: { nombre: datos.nombre },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "EDITAR",
    valorAnterior: { nombre: anterior.nombre },
    valorNuevo: { nombre: beneficiario.nombre },
  });

  return beneficiario;
}

// ---------------------------------------------------------------------------
// Personal / Administración
// ---------------------------------------------------------------------------

const DatosPersonalSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  nss: z.string().trim().optional().nullable(),
  fechaNacimiento: z.coerce.date().optional().nullable(),
});

export type FilaPersonalAdministrativo = {
  id: string;
  nombre: string;
  activo: boolean;
  nss: string | null;
  fechaNacimiento: string | null;
  usuarioVinculado: { id: string; nombre: string; rol: string } | null;
};

function filaPersonal(b: {
  id: string;
  nombre: string;
  activo: boolean;
  personalAdministrativo: { nss: string | null; fechaNacimiento: Date | null } | null;
  usuario: { id: string; nombre: string; rol: string } | null;
}): FilaPersonalAdministrativo {
  return {
    id: b.id,
    nombre: b.nombre,
    activo: b.activo,
    nss: b.personalAdministrativo?.nss ?? null,
    fechaNacimiento: b.personalAdministrativo?.fechaNacimiento?.toISOString() ?? null,
    usuarioVinculado: b.usuario,
  };
}

export async function listarPersonalAdministrativo(
  usuario: UsuarioSesion
): Promise<FilaPersonalAdministrativo[]> {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const registros = await db.beneficiario.findMany({
    where: { empresaId, tipo: "ADMINISTRACION" },
    orderBy: { nombre: "asc" },
    include: {
      personalAdministrativo: true,
      usuario: { select: { id: true, nombre: true, rol: true } },
    },
  });

  return registros.map(filaPersonal);
}

export async function crearPersonalAdministrativo(usuario: UsuarioSesion, datosCrudos: unknown) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosPersonalSchema.parse(datosCrudos);

  const beneficiario = await db.beneficiario.create({
    data: {
      empresaId,
      tipo: "ADMINISTRACION",
      nombre: datos.nombre,
      personalAdministrativo: {
        create: { nss: datos.nss || null, fechaNacimiento: datos.fechaNacimiento || null },
      },
    },
    include: {
      personalAdministrativo: true,
      usuario: { select: { id: true, nombre: true, rol: true } },
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "CREAR",
    valorNuevo: { tipo: "ADMINISTRACION", nombre: beneficiario.nombre },
  });

  return filaPersonal(beneficiario);
}

export async function editarPersonalAdministrativo(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  datosCrudos: unknown
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosPersonalSchema.parse(datosCrudos);

  const anterior = await db.beneficiario.findFirst({
    where: { id: beneficiarioId, empresaId, tipo: "ADMINISTRACION" },
  });
  if (!anterior) throw new RegistroNoEncontradoError("La persona");

  const beneficiario = await db.beneficiario.update({
    where: { id: beneficiarioId },
    data: {
      nombre: datos.nombre,
      personalAdministrativo: {
        update: { nss: datos.nss || null, fechaNacimiento: datos.fechaNacimiento || null },
      },
    },
    include: {
      personalAdministrativo: true,
      usuario: { select: { id: true, nombre: true, rol: true } },
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "EDITAR",
    valorAnterior: { nombre: anterior.nombre },
    valorNuevo: { nombre: beneficiario.nombre },
  });

  return filaPersonal(beneficiario);
}

// ---------------------------------------------------------------------------
// Vínculo Usuario ↔ Beneficiario — uno-a-uno opcional, explícito, nunca
// inferido por nombre/email (ver comentario en prisma/schema.prisma).
// ---------------------------------------------------------------------------

// Todos los Usuarios activos de la empresa (vinculados o no) — quién ya está
// vinculado a cuál Beneficiario se resuelve en el cliente comparando contra
// `usuarioVinculado` de cada fila de listarPersonalAdministrativo, así cada
// selector de "Usuario relacionado" puede seguir mostrando su propio vínculo
// actual además de las opciones libres, sin una consulta por fila.
export async function listarUsuariosActivos(
  usuario: UsuarioSesion
): Promise<{ id: string; nombre: string; rol: string }[]> {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  return db.usuario.findMany({
    where: { empresaId, activo: true },
    select: { id: true, nombre: true, rol: true },
    orderBy: { nombre: "asc" },
  });
}

export async function vincularUsuarioBeneficiario(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  usuarioVinculadoId: string | null
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const beneficiario = await db.beneficiario.findFirst({ where: { id: beneficiarioId, empresaId } });
  if (!beneficiario) throw new RegistroNoEncontradoError("El beneficiario");

  if (usuarioVinculadoId) {
    const usuarioVinculado = await db.usuario.findFirst({
      where: { id: usuarioVinculadoId, empresaId },
    });
    if (!usuarioVinculado) throw new RegistroNoEncontradoError("El usuario");

    // Camino rápido con mensaje legible — el @unique en Beneficiario.usuarioId
    // es la garantía real ante una carrera.
    const yaVinculado = await db.beneficiario.findFirst({
      where: { usuarioId: usuarioVinculadoId, NOT: { id: beneficiarioId } },
      select: { nombre: true },
    });
    if (yaVinculado) {
      throw new ValidacionError(
        `Este usuario ya está relacionado con el beneficiario "${yaVinculado.nombre}".`
      );
    }
  }

  let actualizado;
  try {
    actualizado = await db.beneficiario.update({
      where: { id: beneficiarioId },
      data: { usuarioId: usuarioVinculadoId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidacionError("Ese usuario ya está relacionado con otro beneficiario.");
    }
    throw error;
  }

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "EDITAR",
    valorAnterior: { usuarioId: beneficiario.usuarioId },
    valorNuevo: { usuarioId: usuarioVinculadoId },
  });

  return actualizado;
}

// Solo lectura — usado por el formulario de Gasto para mostrar el hint
// "Yo pagué (Nombre)" antes de enviar. La resolución real y vinculante ocurre
// de nuevo, server-side, dentro de crearGasto/editarGasto.
export async function obtenerBeneficiarioVinculado(
  usuario: UsuarioSesion
): Promise<{ id: string; nombre: string } | null> {
  if (!usuario.empresa) return null;

  const registro = await db.usuario.findFirst({
    where: { id: usuario.id, empresaId: usuario.empresa.id },
    select: { beneficiario: { select: { id: true, nombre: true } } },
  });

  return registro?.beneficiario ?? null;
}
