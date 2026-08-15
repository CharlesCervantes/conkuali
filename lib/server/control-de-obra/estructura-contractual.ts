import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { ConceptoEstatus, EsquemaContractual } from "@/lib/generated/prisma/enums";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { CLAVES_ICONOS_PARTIDA, CLAVES_COLORES_PARTIDA } from "@/lib/control-de-obra/iconos-partida";

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
    partidasConConceptos(proyectoId),
    contratosConConceptos(proyectoId),
  ]);

  return { partidas, contratos };
}

// Solo lo que necesita la pestaña "Contrato General" (operativa, visible a
// los 4 roles): descripción, unidad, cantidad, P.U., materiales — nunca
// Indirectos/Herramienta/%/precio comercial. La protección de lo privado se
// aplica aquí, en el select de la consulta — no solo ocultando columnas en el
// componente (sección 49.6/49.9 de la documentación de negocio).
export async function obtenerPartidasProyecto(
  usuario: UsuarioSesion,
  proyectoId: string
) {
  await obtenerProyecto(usuario, proyectoId);
  return partidasConConceptosOperativo(proyectoId);
}

// Lo que necesita la pestaña "Contrato General Priv.": la estructura completa
// (incluye los campos privados). Quién puede llamar a esto se valida en la
// página (puedeVerContratoGeneralPrivado), no aquí — igual que
// obtenerPartidasProyecto no valida por sí sola quién puede ver lo operativo,
// porque eso ya es público para las 4 roles.
export async function obtenerPartidasProyectoPrivado(
  usuario: UsuarioSesion,
  proyectoId: string
) {
  await obtenerProyecto(usuario, proyectoId);
  return partidasConConceptos(proyectoId);
}

function partidasConConceptosOperativo(proyectoId: string) {
  return db.partida.findMany({
    where: { proyectoId },
    // `orden` casi siempre es 0 (nada en la UI lo captura hoy) — sin un
    // desempate estable, Postgres puede devolver los empates en distinto
    // orden entre una consulta y otra (más notorio justo después de un
    // UPDATE), lo que se veía como "el concepto se mueve de lugar solo".
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      nombre: true,
      orden: true,
      icono: true,
      color: true,
      conceptos: {
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          descripcion: true,
          unidad: true,
          cantidadContratada: true,
          orden: true,
          estatus: true,
          precioUnitarioContratista: true,
          precioUnitarioMateriales: true,
          // % Administración NO es privado (a diferencia de % Utilidad en
          // Precio Alzado) — el cliente/Supervisor sí puede verlo en este
          // esquema (sección 49.9 de la documentación de negocio, confirmado
          // de nuevo en sesión al revisar Contrato General de MEZQUITAL).
          porcentajeAdministracion: true,
        },
      },
    },
  });
}

// Lo que necesita la pestaña "Contratistas": los contratos con sus conceptos
// asignados, más las partidas/conceptos (sin datos de asignación) para poder
// ofrecer el selector "asignar concepto existente".
export async function obtenerContratistasProyecto(
  usuario: UsuarioSesion,
  proyectoId: string
) {
  await obtenerProyecto(usuario, proyectoId);

  const [partidas, contratos] = await Promise.all([
    partidasConConceptos(proyectoId),
    contratosConConceptos(proyectoId),
  ]);

  return { partidas, contratos };
}

// Exportado: lo reutiliza también lib/server/control-de-obra/avance.ts (misma
// consulta, evita duplicarla).
export function partidasConConceptos(proyectoId: string) {
  return db.partida.findMany({
    where: { proyectoId },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    include: { conceptos: { orderBy: [{ orden: "asc" }, { createdAt: "asc" }] } },
  });
}

// select explícito en vez de include profundo: Contratistas (única pantalla
// que consume esto) solo pinta estos campos — traer el resto (timestamps,
// notas, sueldo, etc.) es peso de red que nadie usa.
function contratosConConceptos(proyectoId: string) {
  return db.contratoContratista.findMany({
    where: { beneficiarioProyecto: { proyectoId } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      numeroContrato: true,
      descripcion: true,
      beneficiarioProyecto: {
        select: { beneficiario: { select: { nombre: true } } },
      },
      conceptos: {
        select: {
          id: true,
          conceptoId: true,
          cantidad: true,
          precioUnitarioContratista: true,
          concepto: { select: { descripcion: true, unidad: true } },
        },
      },
    },
  });
}

export type ResolucionContratista = {
  contratistasAsignados: number;
  // Solo tiene valor cuando contratistasAsignados === 1 — con más de un
  // contratista no hay forma inequívoca de saber qué precio aplica, y no se
  // inventa un promedio (ver sección 49.8 de la documentación de negocio).
  precioUnitarioContratista: number | null;
};

// Cuántos ContratoConcepto (contratistas) tiene cada Concepto del proyecto, y
// su precio unitario cuando es uno solo. Lo usan tanto Contratistas (avance
// atribuible) como Avance de obra (P.U./monto por concepto).
export async function resolverContratistaPorConcepto(
  proyectoId: string
): Promise<Map<string, ResolucionContratista>> {
  const asignaciones = await db.contratoConcepto.findMany({
    where: { concepto: { partida: { proyectoId } } },
    select: { conceptoId: true, precioUnitarioContratista: true },
  });

  const conteo = new Map<string, { count: number; precio: number | null }>();
  for (const a of asignaciones) {
    const actual = conteo.get(a.conceptoId) ?? { count: 0, precio: null };
    actual.count += 1;
    actual.precio = actual.count === 1 ? Number(a.precioUnitarioContratista) : null;
    conteo.set(a.conceptoId, actual);
  }

  const resultado = new Map<string, ResolucionContratista>();
  for (const [conceptoId, v] of conteo) {
    resultado.set(conceptoId, {
      contratistasAsignados: v.count,
      precioUnitarioContratista: v.count === 1 ? v.precio : null,
    });
  }
  return resultado;
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

// icono/color se validan contra el catálogo curado — nunca un string libre
// (evita que alguien mande cualquier valor directo a la API).
const DatosPartidaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre de la partida es obligatorio."),
  orden: z.coerce.number().int().default(0),
  icono: z.enum(CLAVES_ICONOS_PARTIDA as [string, ...string[]]).optional().nullable(),
  color: z.enum(CLAVES_COLORES_PARTIDA as [string, ...string[]]).optional().nullable(),
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
  descripcion: z.string().trim().min(1, "La descripción es obligatoria."),
  unidad: z.string().trim().min(1, "La unidad es obligatoria."),
  cantidadContratada: z.coerce
    .number()
    .positive("La cantidad debe ser mayor a cero."),
  orden: z.coerce.number().int().default(0),
  notas: z.string().trim().optional().nullable(),
  // Contrato General (sección 49.9) — todos opcionales, un concepto puede
  // existir sin costeo todavía.
  precioUnitarioContratista: z.coerce.number().nonnegative().optional().nullable(),
  precioUnitarioMateriales: z.coerce.number().nonnegative().optional().nullable(),
  precioUnitarioIndirectos: z.coerce.number().nonnegative().optional().nullable(),
  precioUnitarioHerramienta: z.coerce.number().nonnegative().optional().nullable(),
  // Contrato General Privado — override del % default del proyecto, y del
  // precio final calculado.
  porcentajeUtilidad: z.coerce.number().nonnegative().optional().nullable(),
  porcentajeAdministracion: z.coerce.number().nonnegative().optional().nullable(),
  precioUnitarioClienteOverride: z.coerce.number().nonnegative().optional().nullable(),
});

// El esquema del proyecto manda sobre lo que el cliente haya enviado: en
// Administración, Materiales/Indirectos/Herramienta/%Utilidad no aplican como
// presupuesto contractual y se fuerzan a null aunque alguien los mande — "el
// modelo debe saber que no aplican", no basta con ocultarlos en la interfaz
// (decisión de sesión, sección 49.9). En Precio Alzado, %Administración no
// aplica.
//
// Solo se usa al CREAR un concepto — nunca al editar uno existente. Un campo
// que no aplica al esquema "no se captura, no se presenta y no participa en
// cálculos", pero eso no autoriza a sobreescribir con null un valor que ya
// existiera en base de datos por otra vía (precisión de sesión, agosto 2026):
// al crear no hay nada que destruir, así que forzar null aquí es seguro; al
// editar sí podría haberlo, por eso editarConcepto NO llama a esta función —
// la separación real de qué campos son editables desde dónde (Contrato
// General vs. Contrato General Privado, cada uno con su propio esquema
// validado) se resuelve en la etapa de edición todavía pendiente.
function normalizarCostosParaCreacion<
  T extends {
    precioUnitarioMateriales?: number | null;
    precioUnitarioIndirectos?: number | null;
    precioUnitarioHerramienta?: number | null;
    porcentajeUtilidad?: number | null;
    porcentajeAdministracion?: number | null;
  },
>(datos: T, esquema: EsquemaContractual | null): T {
  if (esquema === "ADMINISTRACION") {
    return {
      ...datos,
      precioUnitarioMateriales: null,
      precioUnitarioIndirectos: null,
      precioUnitarioHerramienta: null,
      porcentajeUtilidad: null,
    };
  }
  if (esquema === "PRECIO_ALZADO") {
    return { ...datos, porcentajeAdministracion: null };
  }
  return datos;
}

export async function crearConcepto(
  usuario: UsuarioSesion,
  partidaId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  const partida = await db.partida.findFirst({
    where: { id: partidaId, proyecto: { empresaId } },
    include: { proyecto: { select: { esquemaContractual: true } } },
  });
  if (!partida) throw new RegistroNoEncontradoError("La partida");

  const datos = normalizarCostosParaCreacion(
    DatosConceptoSchema.parse(datosCrudos),
    partida.proyecto.esquemaContractual
  );
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
    include: { partida: { include: { proyecto: { select: { esquemaContractual: true } } } } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El concepto");

  // No se normaliza por esquema aquí (a diferencia de crearConcepto) — hacerlo
  // forzaría a null cualquier valor ya existente que no aplique al esquema
  // actual, y eso es exactamente lo que la precisión de sesión de agosto 2026
  // prohíbe. Esta función todavía no tiene ningún caller en la UI; la partición
  // real por pestaña (qué campos son editables desde Contrato General vs.
  // Contrato General Privado, cada uno con su propio esquema validado y sin
  // tocar los campos del otro) se resuelve en la etapa de edición pendiente.
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

// ---------------------------------------------------------------------------
// Conceptos — capa privada (Contrato General Priv.)
// ---------------------------------------------------------------------------

const DatosConceptoPrivadoSchema = z.object({
  precioUnitarioContratistaPrivado: z.coerce.number().nonnegative().optional().nullable(),
  precioUnitarioIndirectos: z.coerce.number().nonnegative().optional().nullable(),
  precioUnitarioHerramienta: z.coerce.number().nonnegative().optional().nullable(),
  porcentajeUtilidad: z.coerce.number().nonnegative().optional().nullable(),
  porcentajeAdministracion: z.coerce.number().nonnegative().optional().nullable(),
  precioUnitarioClienteOverride: z.coerce.number().nonnegative().optional().nullable(),
});

// Edita los campos privados de un concepto — descripción, unidad, cantidad y
// el P.U. de Contrato General (precioUnitarioContratista) NO se tocan aquí.
// El P.U. que se edita desde esta pantalla es precioUnitarioContratistaPrivado
// — una copia propia de Contrato General Privado, independiente desde que se
// edita por primera vez: nunca se sincroniza de vuelta hacia
// precioUnitarioContratista (decisión de sesión, agosto 2026 — editar aquí no
// debe afectar el Contrato General original). Tampoco toca
// ContratoConcepto.precioUnitarioContratista, que ya quedó congelado al
// asignar el contratista (ver asignarConcepto). El mismo rol-set que
// puedeVerContratoGeneralPrivado (requerirAdmin ya lo verifica hoy).
//
// Los campos de costo/porcentaje que NO aplican al esquema actual ni siquiera
// se incluyen en el `data` del update, así que un valor legado que ya
// existiera (de un cambio de esquema anterior a esta regla, por ejemplo) no
// se toca ni se destruye (precisión de sesión, agosto 2026).
export async function editarConceptoPrivado(
  usuario: UsuarioSesion,
  id: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdmin(usuario);
  const anterior = await db.concepto.findFirst({
    where: { id, partida: { proyecto: { empresaId } } },
    include: { partida: { include: { proyecto: { select: { esquemaContractual: true } } } } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El concepto");

  const datos = DatosConceptoPrivadoSchema.parse(datosCrudos);
  const esquema = anterior.partida.proyecto.esquemaContractual;

  // El P.U. privado aplica a los dos esquemas (sección D de la propuesta) —
  // se escribe siempre, no solo cuando se manda un valor, para poder también
  // borrarlo (volver a "igual que Contrato General") desde este formulario.
  const data: {
    precioUnitarioContratistaPrivado: number | null;
    precioUnitarioClienteOverride: number | null;
    precioUnitarioIndirectos?: number | null;
    precioUnitarioHerramienta?: number | null;
    porcentajeUtilidad?: number | null;
    porcentajeAdministracion?: number | null;
  } = {
    precioUnitarioContratistaPrivado: datos.precioUnitarioContratistaPrivado ?? null,
    precioUnitarioClienteOverride: datos.precioUnitarioClienteOverride ?? null,
  };
  if (esquema === "PRECIO_ALZADO") {
    data.precioUnitarioIndirectos = datos.precioUnitarioIndirectos ?? null;
    data.precioUnitarioHerramienta = datos.precioUnitarioHerramienta ?? null;
    data.porcentajeUtilidad = datos.porcentajeUtilidad ?? null;
  } else if (esquema === "ADMINISTRACION") {
    data.porcentajeAdministracion = datos.porcentajeAdministracion ?? null;
  }

  const concepto = await db.concepto.update({ where: { id }, data });

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
});

// Asigna un concepto ya existente del Contrato General a un contratista.
// Cantidad y P.U. se HEREDAN del concepto (nunca se vuelven a capturar a
// mano) y quedan congelados en el momento de asignar — si después cambia el
// presupuesto del Contrato General, no afecta lo ya formalizado. Un concepto
// solo puede pertenecer a un contratista a la vez, nunca se reparte
// (decisión de sesión, agosto 2026, sección 49.9) — por eso esta operación es
// crear, no editar: no hay nada que un usuario pueda modificar aquí después.
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

  if (concepto.precioUnitarioContratista === null) {
    throw new ValidacionError(
      `"${concepto.descripcion}" todavía no tiene P.U. de contratista definido en Contrato General.`
    );
  }

  const yaAsignado = await db.contratoConcepto.findUnique({
    where: { conceptoId: datos.conceptoId },
  });
  if (yaAsignado) {
    throw new ValidacionError(
      yaAsignado.contratoContratistaId === contratoContratistaId
        ? `"${concepto.descripcion}" ya está asignado a este contrato.`
        : `"${concepto.descripcion}" ya está asignado a otro contratista.`
    );
  }

  const asignacion = await db.contratoConcepto.create({
    data: {
      contratoContratistaId,
      conceptoId: datos.conceptoId,
      cantidad: concepto.cantidadContratada,
      precioUnitarioContratista: concepto.precioUnitarioContratista,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "ContratoConcepto",
    entidadId: asignacion.id,
    accion: "CREAR",
    valorNuevo: asignacion,
  });

  return asignacion;
}
