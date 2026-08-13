import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { ConceptoEstatus } from "@/lib/generated/prisma/enums";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";

export class RegistroNoEncontradoError extends Error {
  constructor(entidad: string) {
    super(`${entidad} no existe o no pertenece a tu empresa.`);
    this.name = "RegistroNoEncontradoError";
  }
}

function requerirAdmin(usuario: UsuarioSesion) {
  if (!puedeAdministrarProyectos(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function obtenerEstructuraContractual(
  usuario: UsuarioSesion,
  proyectoId: string
) {
  // obtenerProyecto ya valida que el proyecto pertenezca a la empresa del
  // usuario — a partir de aquí proyectoId es de confianza.
  await obtenerProyecto(usuario, proyectoId);

  const [partidas, contratos] = await Promise.all([
    db.partida.findMany({
      where: { proyectoId },
      orderBy: { orden: "asc" },
      include: {
        conceptos: {
          orderBy: { orden: "asc" },
          include: {
            asignaciones: {
              include: {
                contratoContratista: {
                  include: {
                    beneficiarioProyecto: { include: { beneficiario: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.contratoContratista.findMany({
      where: { beneficiarioProyecto: { proyectoId } },
      orderBy: { createdAt: "asc" },
      include: {
        beneficiarioProyecto: { include: { beneficiario: true } },
        conceptos: { include: { concepto: true } },
      },
    }),
  ]);

  return { partidas, contratos };
}

export async function listarContratistasDisponibles(usuario: UsuarioSesion) {
  if (!usuario.empresa) throw new SinPermisoError();
  return db.beneficiario.findMany({
    where: { empresaId: usuario.empresa.id, tipo: "CONTRATISTA", activo: true },
    orderBy: { nombre: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------

const DatosPartidaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre de la partida es obligatorio."),
  orden: z.coerce.number().int().default(0),
});

export async function crearPartida(
  usuario: UsuarioSesion,
  proyectoId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  await obtenerProyecto(usuario, proyectoId);
  const datos = DatosPartidaSchema.parse(datosCrudos);

  const partida = await db.partida.create({ data: { ...datos, proyectoId } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Partida",
    entidadId: partida.id,
    accion: "CREAR",
    valorNuevo: partida,
  });

  return partida;
}

export async function editarPartida(
  usuario: UsuarioSesion,
  id: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  const datos = DatosPartidaSchema.parse(datosCrudos);

  const anterior = await db.partida.findFirst({
    where: { id, proyecto: { empresaId } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("La partida");

  const partida = await db.partida.update({ where: { id }, data: datos });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Partida",
    entidadId: partida.id,
    accion: "EDITAR",
    valorAnterior: anterior,
    valorNuevo: partida,
  });

  return partida;
}

// ---------------------------------------------------------------------------
// Conceptos
// ---------------------------------------------------------------------------

const DatosConceptoSchema = z.object({
  codigo: z.string().trim().optional().nullable(),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria."),
  unidad: z.string().trim().min(1, "La unidad es obligatoria."),
  cantidadContratada: z.coerce
    .number()
    .positive("La cantidad debe ser mayor a cero."),
  orden: z.coerce.number().int().default(0),
  notas: z.string().trim().optional().nullable(),
});

export async function crearConcepto(
  usuario: UsuarioSesion,
  partidaId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  const partida = await db.partida.findFirst({
    where: { id: partidaId, proyecto: { empresaId } },
  });
  if (!partida) throw new RegistroNoEncontradoError("La partida");

  const datos = DatosConceptoSchema.parse(datosCrudos);
  const concepto = await db.concepto.create({ data: { ...datos, partidaId } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Concepto",
    entidadId: concepto.id,
    accion: "CREAR",
    valorNuevo: concepto,
  });

  return concepto;
}

export async function editarConcepto(
  usuario: UsuarioSesion,
  id: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  const anterior = await db.concepto.findFirst({
    where: { id, partida: { proyecto: { empresaId } } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El concepto");

  const datos = DatosConceptoSchema.parse(datosCrudos);
  const concepto = await db.concepto.update({ where: { id }, data: datos });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Concepto",
    entidadId: concepto.id,
    accion: "EDITAR",
    valorAnterior: anterior,
    valorNuevo: concepto,
  });

  return concepto;
}

const ESTATUS_CONCEPTO_VALIDOS: ConceptoEstatus[] = ["ACTIVO", "CANCELADO"];

export async function cambiarEstatusConcepto(
  usuario: UsuarioSesion,
  id: string,
  nuevoEstatus: string
) {
  const empresaId = requerirAdmin(usuario);
  if (!ESTATUS_CONCEPTO_VALIDOS.includes(nuevoEstatus as ConceptoEstatus)) {
    throw new ValidacionError(`Estatus inválido: ${nuevoEstatus}`);
  }

  const anterior = await db.concepto.findFirst({
    where: { id, partida: { proyecto: { empresaId } } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El concepto");

  const concepto = await db.concepto.update({
    where: { id },
    data: { estatus: nuevoEstatus as ConceptoEstatus },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Concepto",
    entidadId: concepto.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: anterior.estatus },
    valorNuevo: { estatus: concepto.estatus },
  });

  return concepto;
}

// ---------------------------------------------------------------------------
// Contratos de contratista
// ---------------------------------------------------------------------------

const DatosContratoSchema = z
  .object({
    beneficiarioId: z.string().trim().optional().nullable(),
    nombreNuevoContratista: z.string().trim().optional().nullable(),
    numeroContrato: z.string().trim().optional().nullable(),
    descripcion: z.string().trim().optional().nullable(),
    fecha: z.coerce.date().optional().nullable(),
  })
  .refine((datos) => Boolean(datos.beneficiarioId) !== Boolean(datos.nombreNuevoContratista), {
    message:
      "Elige un contratista existente o escribe el nombre de uno nuevo (no ambos, no ninguno).",
  });

// Resuelve la participación (BeneficiarioProyecto) del contratista en este
// proyecto — crea el Beneficiario y/o la participación si hace falta.
async function obtenerOCrearParticipacionContratista(
  empresaId: string,
  proyectoId: string,
  datos: { beneficiarioId?: string | null; nombreNuevoContratista?: string | null }
) {
  let beneficiarioId = datos.beneficiarioId ?? undefined;

  if (!beneficiarioId && datos.nombreNuevoContratista) {
    const beneficiario = await db.beneficiario.create({
      data: {
        empresaId,
        tipo: "CONTRATISTA",
        nombre: datos.nombreNuevoContratista,
      },
    });
    beneficiarioId = beneficiario.id;
  }

  if (!beneficiarioId) {
    throw new ValidacionError("Falta el contratista.");
  }

  const beneficiario = await db.beneficiario.findFirst({
    where: { id: beneficiarioId, empresaId, tipo: "CONTRATISTA" },
  });
  if (!beneficiario) throw new RegistroNoEncontradoError("El contratista");

  return db.beneficiarioProyecto.upsert({
    where: { beneficiarioId_proyectoId: { beneficiarioId, proyectoId } },
    update: {},
    create: { beneficiarioId, proyectoId },
  });
}

export async function crearContratoContratista(
  usuario: UsuarioSesion,
  proyectoId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  await obtenerProyecto(usuario, proyectoId);
  const datos = DatosContratoSchema.parse(datosCrudos);

  const beneficiarioProyecto = await obtenerOCrearParticipacionContratista(
    empresaId,
    proyectoId,
    datos
  );

  const contrato = await db.contratoContratista.create({
    data: {
      beneficiarioProyectoId: beneficiarioProyecto.id,
      numeroContrato: datos.numeroContrato,
      descripcion: datos.descripcion,
      fecha: datos.fecha,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "ContratoContratista",
    entidadId: contrato.id,
    accion: "CREAR",
    valorNuevo: contrato,
  });

  return contrato;
}

const DatosEditarContratoSchema = z.object({
  numeroContrato: z.string().trim().optional().nullable(),
  descripcion: z.string().trim().optional().nullable(),
  fecha: z.coerce.date().optional().nullable(),
});

export async function editarContratoContratista(
  usuario: UsuarioSesion,
  id: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  const anterior = await db.contratoContratista.findFirst({
    where: { id, beneficiarioProyecto: { proyecto: { empresaId } } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El contrato");

  const datos = DatosEditarContratoSchema.parse(datosCrudos);
  const contrato = await db.contratoContratista.update({
    where: { id },
    data: datos,
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "ContratoContratista",
    entidadId: contrato.id,
    accion: "EDITAR",
    valorAnterior: anterior,
    valorNuevo: contrato,
  });

  return contrato;
}

// ---------------------------------------------------------------------------
// Asignación de conceptos a un contrato
// ---------------------------------------------------------------------------

const DatosAsignacionSchema = z.object({
  conceptoId: z.string().trim().min(1),
  cantidad: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
  precioUnitarioContratista: z.coerce
    .number()
    .positive("El precio unitario debe ser mayor a cero."),
});

export async function asignarConcepto(
  usuario: UsuarioSesion,
  contratoContratistaId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);

  const contrato = await db.contratoContratista.findFirst({
    where: { id: contratoContratistaId, beneficiarioProyecto: { proyecto: { empresaId } } },
    include: { beneficiarioProyecto: true },
  });
  if (!contrato) throw new RegistroNoEncontradoError("El contrato");

  const datos = DatosAsignacionSchema.parse(datosCrudos);

  // El concepto debe pertenecer al MISMO proyecto que el contrato (no solo a
  // la misma empresa) — si no, se estaría asignando trabajo de una obra al
  // contrato de otra.
  const concepto = await db.concepto.findFirst({
    where: {
      id: datos.conceptoId,
      partida: { proyectoId: contrato.beneficiarioProyecto.proyectoId },
    },
  });
  if (!concepto) throw new RegistroNoEncontradoError("El concepto");

  const anterior = await db.contratoConcepto.findUnique({
    where: {
      contratoContratistaId_conceptoId: {
        contratoContratistaId,
        conceptoId: datos.conceptoId,
      },
    },
  });

  const asignacion = await db.contratoConcepto.upsert({
    where: {
      contratoContratistaId_conceptoId: {
        contratoContratistaId,
        conceptoId: datos.conceptoId,
      },
    },
    update: {
      cantidad: datos.cantidad,
      precioUnitarioContratista: datos.precioUnitarioContratista,
    },
    create: {
      contratoContratistaId,
      conceptoId: datos.conceptoId,
      cantidad: datos.cantidad,
      precioUnitarioContratista: datos.precioUnitarioContratista,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "ContratoConcepto",
    entidadId: asignacion.id,
    accion: anterior ? "EDITAR" : "CREAR",
    valorAnterior: anterior,
    valorNuevo: asignacion,
  });

  return asignacion;
}
