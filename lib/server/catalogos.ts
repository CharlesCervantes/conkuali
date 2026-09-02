import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import { puedeAdministrarCatalogos, puedeEliminarCatalogo } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// ---------------------------------------------------------------------------
// Vínculo "misma persona que" — resuelve duplicados de identidad de pago
// (ej. alguien que ya existe como Personal y se agregó también como
// Contratista temporal). Nunca se infiere por nombre — siempre explícito
// desde el formulario, y siempre validado server-side antes de guardarlo.
// ---------------------------------------------------------------------------

// - No puede apuntar a sí mismo.
// - El candidato debe pertenecer a la misma empresa (nunca se confía en el
//   id que llega del formulario).
// - Siempre se guarda la RAÍZ canónica del candidato, nunca un alias
//   intermedio: si el candidato ya es alias de otro beneficiario, se sigue
//   la cadena hasta el final antes de guardar.
// - Se rechaza cualquier ciclo (A→B→A o más largo), detectado mientras se
//   sigue la cadena hacia la raíz.
// El histórico (GastoObra.pagadorBeneficiarioId, BeneficiarioProyecto, etc.)
// nunca se reescribe — este vínculo solo afecta selectores futuros (ver
// listarBeneficiariosParaGasto en gastos.ts), agosto 2026.
async function resolverMismaPersonaQueId(
  tx: Prisma.TransactionClient,
  empresaId: string,
  beneficiarioId: string,
  candidatoId: string | null | undefined
): Promise<string | null> {
  if (!candidatoId) return null;
  if (candidatoId === beneficiarioId) {
    throw new ValidacionError("Un beneficiario no puede ser la misma persona que sí mismo.");
  }

  let actual = await tx.beneficiario.findFirst({
    where: { id: candidatoId, empresaId },
    select: { id: true, mismaPersonaQueId: true },
  });
  if (!actual) throw new RegistroNoEncontradoError("El beneficiario seleccionado");

  const visitados = new Set<string>([beneficiarioId]);
  while (actual.mismaPersonaQueId) {
    if (visitados.has(actual.mismaPersonaQueId)) {
      throw new ValidacionError("Esa vinculación crearía un ciclo entre beneficiarios.");
    }
    visitados.add(actual.mismaPersonaQueId);
    const siguiente: { id: string; mismaPersonaQueId: string | null } | null =
      await tx.beneficiario.findFirst({
        where: { id: actual.mismaPersonaQueId, empresaId },
        select: { id: true, mismaPersonaQueId: true },
      });
    if (!siguiente) break; // dato inconsistente defensivo — no debería pasar
    actual = siguiente;
  }

  return actual.id; // siempre la raíz
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
// Eliminar definitivamente — solo si el Beneficiario no tiene absolutamente
// ningún historial de negocio. Mismo helper para Proveedor/Contratista/
// Personal (comparten la tabla Beneficiario y ninguna de estas relaciones
// está restringida por `tipo` en el schema).
//
// Por qué estas 4 relaciones son suficientes — no hace falta consultar
// Aditiva/ContratoContratista/ContratoConcepto/CorteSemanal/CorteSemanalConcepto/
// ReciboPago una por una: todas exigen una fila de BeneficiarioProyecto
// (RESTRICT), así que si BeneficiarioProyecto está en cero, esa cadena
// completa está garantizada en cero también — es una consecuencia del propio
// schema, no una suposición (auditoría de la etapa "Eliminar en Catálogos",
// agosto 2026). GastoObra es la única relación con onDelete: SetNull —la
// única que el motor de la base de datos NO bloquearía solo, así que su
// verificación aquí es la que de verdad importa.
// ---------------------------------------------------------------------------

export type EvaluacionEliminacionBeneficiario = { puedeEliminar: boolean; motivos: string[] };

async function evaluarEliminacionEnLote(
  beneficiarioIds: string[]
): Promise<Map<string, EvaluacionEliminacionBeneficiario>> {
  const resultado = new Map<string, EvaluacionEliminacionBeneficiario>();
  if (beneficiarioIds.length === 0) return resultado;

  const [participaciones, ordenesCompra, gastosPagador, gastosProveedor, reposiciones] = await Promise.all([
    db.beneficiarioProyecto.groupBy({
      by: ["beneficiarioId"],
      where: { beneficiarioId: { in: beneficiarioIds } },
      _count: { _all: true },
    }),
    db.ordenCompra.groupBy({
      by: ["proveedorBeneficiarioId"],
      where: { proveedorBeneficiarioId: { in: beneficiarioIds } },
      _count: { _all: true },
    }),
    db.gastoObra.groupBy({
      by: ["pagadorBeneficiarioId"],
      where: { pagadorBeneficiarioId: { in: beneficiarioIds } },
      _count: { _all: true },
    }),
    db.gastoObra.groupBy({
      by: ["proveedorBeneficiarioId"],
      where: { proveedorBeneficiarioId: { in: beneficiarioIds } },
      _count: { _all: true },
    }),
    db.reposicionGastos.groupBy({
      by: ["beneficiarioId"],
      where: { beneficiarioId: { in: beneficiarioIds } },
      _count: { _all: true },
    }),
  ]);

  const participacionesPorId = new Map(participaciones.map((p) => [p.beneficiarioId, p._count._all]));
  const ordenesPorId = new Map(
    ordenesCompra.map((o) => [o.proveedorBeneficiarioId, o._count._all])
  );
  const gastosPagadorPorId = new Map(
    gastosPagador.map((g) => [g.pagadorBeneficiarioId, g._count._all])
  );
  const gastosProveedorPorId = new Map(
    gastosProveedor.map((g) => [g.proveedorBeneficiarioId, g._count._all])
  );
  const reposicionesPorId = new Map(reposiciones.map((r) => [r.beneficiarioId, r._count._all]));

  for (const id of beneficiarioIds) {
    const motivos: string[] = [];
    const nParticipaciones = participacionesPorId.get(id) ?? 0;
    const nOrdenes = ordenesPorId.get(id) ?? 0;
    const nGastosPagador = gastosPagadorPorId.get(id) ?? 0;
    const nGastosProveedor = gastosProveedorPorId.get(id) ?? 0;
    const nReposiciones = reposicionesPorId.get(id) ?? 0;

    if (nParticipaciones > 0) motivos.push(`Participa en ${nParticipaciones} proyecto(s)`);
    if (nOrdenes > 0) motivos.push(`Tiene ${nOrdenes} orden(es) de compra`);
    if (nGastosPagador > 0) motivos.push(`Tiene gastos registrados como pagador`);
    if (nGastosProveedor > 0) motivos.push(`Tiene gastos registrados como proveedor`);
    if (nReposiciones > 0) motivos.push(`Tiene reposiciones de gastos registradas`);

    resultado.set(id, { puedeEliminar: motivos.length === 0, motivos });
  }

  return resultado;
}

async function evaluarEliminacionBeneficiario(
  beneficiarioId: string
): Promise<EvaluacionEliminacionBeneficiario> {
  const mapa = await evaluarEliminacionEnLote([beneficiarioId]);
  return mapa.get(beneficiarioId) ?? { puedeEliminar: false, motivos: [] };
}

// Vínculo Usuario↔Beneficiario: el FK vive en Beneficiario.usuarioId →
// Usuario.id, así que borrar el Beneficiario es inofensivo para el Usuario
// (la fila entera desaparece con su propia columna usuarioId, sin dejar nada
// huérfano) — un vínculo activo NO cuenta como historial de negocio y no
// bloquea la eliminación (decisión de sesión, agosto 2026). El Usuario nunca
// se toca ni se elimina desde Catálogos.
export async function eliminarBeneficiario(usuario: UsuarioSesion, beneficiarioId: string) {
  if (!puedeEliminarCatalogo(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const beneficiario = await db.beneficiario.findFirst({
    where: { id: beneficiarioId, empresaId },
    include: { proveedor: true, personalAdministrativo: true },
  });
  if (!beneficiario) throw new RegistroNoEncontradoError("El beneficiario");

  const evaluacion = await evaluarEliminacionBeneficiario(beneficiarioId);
  if (!evaluacion.puedeEliminar) {
    throw new ValidacionError(
      `No se puede eliminar "${beneficiario.nombre}" porque tiene historial: ${evaluacion.motivos.join(", ")}. Puedes desactivarlo.`
    );
  }

  try {
    await db.$transaction(async (tx) => {
      // Explícito aunque Proveedor/PersonalAdministrativo ya son
      // onDelete: Cascade — nunca depender silenciosamente de la cascada
      // para datos de catálogo.
      if (beneficiario.proveedor) await tx.proveedor.delete({ where: { beneficiarioId } });
      if (beneficiario.personalAdministrativo) {
        await tx.personalAdministrativo.delete({ where: { beneficiarioId } });
      }
      await tx.beneficiario.delete({ where: { id: beneficiarioId } });

      // Auditoría dentro de la misma transacción: si el borrado falla (p.ej.
      // una fila RESTRICT se creó justo entre el check y el delete), la
      // auditoría tampoco se escribe. entidadId no tiene FK — el registro
      // sigue siendo válido para siempre aunque el Beneficiario ya no exista.
      await registrarAuditoriaTx(tx, {
        empresaId,
        usuarioId: usuario.id,
        entidad: "Beneficiario",
        entidadId: beneficiario.id,
        accion: "ELIMINAR",
        valorAnterior: { nombre: beneficiario.nombre, tipo: beneficiario.tipo, activo: beneficiario.activo },
      });
    });
  } catch (error) {
    // Respaldo final ante una carrera real: alguien creó una fila RESTRICT
    // (BeneficiarioProyecto/OrdenCompra/ReposicionGastos) justo entre el
    // check y el delete. La base de datos lo bloquea sola; solo se traduce
    // a un mensaje legible en vez de dejar pasar el error crudo de Postgres.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new ValidacionError(
        `No se puede eliminar "${beneficiario.nombre}" porque tiene historial. Puedes desactivarlo.`
      );
    }
    throw error;
  }
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
  mismaPersonaQueId: z.string().trim().optional().nullable(),
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
  mismaPersonaQue: { id: string; nombre: string } | null;
  puedeEliminar: boolean;
  motivosBloqueoEliminacion: string[];
};

function filaProveedor(
  b: {
    id: string;
    nombre: string;
    activo: boolean;
    mismaPersonaQue: { id: string; nombre: string } | null;
    proveedor: {
      giro: string | null;
      vendedor: string | null;
      telefono: string | null;
      credito: string | null;
      cuentaBancaria: string | null;
      rfc: string | null;
    } | null;
  },
  evaluacion: EvaluacionEliminacionBeneficiario
): FilaProveedorCatalogo {
  return {
    id: b.id,
    nombre: b.nombre,
    activo: b.activo,
    mismaPersonaQue: b.mismaPersonaQue,
    giro: b.proveedor?.giro ?? null,
    vendedor: b.proveedor?.vendedor ?? null,
    telefono: b.proveedor?.telefono ?? null,
    credito: b.proveedor?.credito ?? null,
    cuentaBancaria: b.proveedor?.cuentaBancaria ?? null,
    rfc: b.proveedor?.rfc ?? null,
    puedeEliminar: evaluacion.puedeEliminar,
    motivosBloqueoEliminacion: evaluacion.motivos,
  };
}

export async function listarProveedores(usuario: UsuarioSesion): Promise<FilaProveedorCatalogo[]> {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const proveedores = await db.beneficiario.findMany({
    where: { empresaId, tipo: "PROVEEDOR" },
    orderBy: { nombre: "asc" },
    include: { proveedor: true, mismaPersonaQue: { select: { id: true, nombre: true } } },
  });
  const evaluaciones = await evaluarEliminacionEnLote(proveedores.map((p) => p.id));

  return proveedores.map((p) =>
    filaProveedor(p, evaluaciones.get(p.id) ?? { puedeEliminar: false, motivos: [] })
  );
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
    include: { proveedor: true, mismaPersonaQue: { select: { id: true, nombre: true } } },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "CREAR",
    valorNuevo: { tipo: "PROVEEDOR", nombre: beneficiario.nombre },
  });

  return filaProveedor(beneficiario, { puedeEliminar: true, motivos: [] });
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

  const beneficiario = await db.$transaction(async (tx) => {
    const mismaPersonaQueId = await resolverMismaPersonaQueId(
      tx,
      empresaId,
      beneficiarioId,
      datos.mismaPersonaQueId
    );

    const editado = await tx.beneficiario.update({
      where: { id: beneficiarioId },
      data: {
        nombre: datos.nombre,
        mismaPersonaQueId,
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
      include: { proveedor: true, mismaPersonaQue: { select: { id: true, nombre: true } } },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "Beneficiario",
      entidadId: editado.id,
      accion: "EDITAR",
      valorAnterior: { nombre: anterior.nombre, mismaPersonaQueId: anterior.mismaPersonaQueId },
      valorNuevo: { nombre: editado.nombre, mismaPersonaQueId },
    });

    return editado;
  });

  return filaProveedor(beneficiario, await evaluarEliminacionBeneficiario(beneficiario.id));
}

// ---------------------------------------------------------------------------
// Contratistas — catálogo global de identidad, más un dato general de
// especialidad (Contratista.descripcion) que solo sirve de sugerencia: el
// contrato de cada obra sigue teniendo su propia Descripción, editable sin
// tocar este catálogo (ver crearContratoContratista en
// estructura-contractual.ts). Lo específico de cada obra (concepto,
// montoContrato, ContratoContratista) sigue viviendo exclusivamente en
// BeneficiarioProyecto/ContratoContratista, sin duplicarse aquí.
// ---------------------------------------------------------------------------

const DatosContratistaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio."),
  descripcion: z.string().trim().optional().nullable(),
  mismaPersonaQueId: z.string().trim().optional().nullable(),
});

export type FilaContratistaCatalogo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  proyectosActivos: number;
  mismaPersonaQue: { id: string; nombre: string } | null;
  puedeEliminar: boolean;
  motivosBloqueoEliminacion: string[];
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
      contratista: { select: { descripcion: true } },
      _count: { select: { proyectos: { where: { activo: true } } } },
      mismaPersonaQue: { select: { id: true, nombre: true } },
    },
  });
  const evaluaciones = await evaluarEliminacionEnLote(contratistas.map((c) => c.id));

  return contratistas.map((c) => {
    const evaluacion = evaluaciones.get(c.id) ?? { puedeEliminar: false, motivos: [] };
    return {
      id: c.id,
      nombre: c.nombre,
      descripcion: c.contratista?.descripcion ?? null,
      activo: c.activo,
      proyectosActivos: c._count.proyectos,
      mismaPersonaQue: c.mismaPersonaQue,
      puedeEliminar: evaluacion.puedeEliminar,
      motivosBloqueoEliminacion: evaluacion.motivos,
    };
  });
}

export async function crearContratista(usuario: UsuarioSesion, datosCrudos: unknown) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosContratistaSchema.parse(datosCrudos);

  // Existe por sí solo, sin necesitar ningún BeneficiarioProyecto — se puede
  // dar de alta en el catálogo sin asignarlo todavía a ninguna obra.
  const beneficiario = await db.beneficiario.create({
    data: {
      empresaId,
      tipo: "CONTRATISTA",
      nombre: datos.nombre,
      contratista: { create: { descripcion: datos.descripcion || null } },
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "CREAR",
    valorNuevo: { tipo: "CONTRATISTA", nombre: beneficiario.nombre, descripcion: datos.descripcion ?? null },
  });

  return {
    id: beneficiario.id,
    nombre: beneficiario.nombre,
    descripcion: datos.descripcion ?? null,
    activo: beneficiario.activo,
    proyectosActivos: 0,
    mismaPersonaQue: null,
    puedeEliminar: true,
    motivosBloqueoEliminacion: [] as string[],
  };
}

export async function editarContratista(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  datosCrudos: unknown
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosContratistaSchema.parse(datosCrudos);

  const anterior = await db.beneficiario.findFirst({
    where: { id: beneficiarioId, empresaId, tipo: "CONTRATISTA" },
    include: { contratista: { select: { descripcion: true } } },
  });
  if (!anterior) throw new RegistroNoEncontradoError("El contratista");

  const beneficiario = await db.$transaction(async (tx) => {
    const mismaPersonaQueId = await resolverMismaPersonaQueId(
      tx,
      empresaId,
      beneficiarioId,
      datos.mismaPersonaQueId
    );

    const editado = await tx.beneficiario.update({
      where: { id: beneficiarioId },
      data: {
        nombre: datos.nombre,
        mismaPersonaQueId,
        contratista: {
          upsert: {
            create: { descripcion: datos.descripcion || null },
            update: { descripcion: datos.descripcion || null },
          },
        },
      },
      include: { contratista: { select: { descripcion: true } } },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "Beneficiario",
      entidadId: editado.id,
      accion: "EDITAR",
      valorAnterior: {
        nombre: anterior.nombre,
        mismaPersonaQueId: anterior.mismaPersonaQueId,
        descripcion: anterior.contratista?.descripcion ?? null,
      },
      valorNuevo: { nombre: editado.nombre, mismaPersonaQueId, descripcion: editado.contratista?.descripcion ?? null },
    });

    return editado;
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
  mismaPersonaQueId: z.string().trim().optional().nullable(),
});

export type FilaPersonalAdministrativo = {
  id: string;
  nombre: string;
  activo: boolean;
  nss: string | null;
  fechaNacimiento: string | null;
  usuarioVinculado: { id: string; nombre: string; rol: string } | null;
  mismaPersonaQue: { id: string; nombre: string } | null;
  puedeEliminar: boolean;
  motivosBloqueoEliminacion: string[];
};

function filaPersonal(
  b: {
    id: string;
    nombre: string;
    activo: boolean;
    personalAdministrativo: { nss: string | null; fechaNacimiento: Date | null } | null;
    usuario: { id: string; nombre: string; rol: string } | null;
    mismaPersonaQue: { id: string; nombre: string } | null;
  },
  evaluacion: EvaluacionEliminacionBeneficiario
): FilaPersonalAdministrativo {
  return {
    id: b.id,
    nombre: b.nombre,
    activo: b.activo,
    nss: b.personalAdministrativo?.nss ?? null,
    fechaNacimiento: b.personalAdministrativo?.fechaNacimiento?.toISOString() ?? null,
    usuarioVinculado: b.usuario,
    mismaPersonaQue: b.mismaPersonaQue,
    puedeEliminar: evaluacion.puedeEliminar,
    motivosBloqueoEliminacion: evaluacion.motivos,
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
      mismaPersonaQue: { select: { id: true, nombre: true } },
    },
  });
  const evaluaciones = await evaluarEliminacionEnLote(registros.map((r) => r.id));

  return registros.map((r) =>
    filaPersonal(r, evaluaciones.get(r.id) ?? { puedeEliminar: false, motivos: [] })
  );
}

// Crear la identidad de Personal y, si se indicó, su vínculo con Usuario son
// una sola operación atómica: si el vínculo falla (usuario ya vinculado a
// otro beneficiario, usuario inexistente, etc.), la creación completa se
// revierte — nunca queda un Beneficiario huérfano sin vínculo cuando el
// formulario sí pedía uno (hallazgo de integridad, auditoría de rendimiento,
// agosto 2026).
export async function crearPersonalAdministrativo(
  usuario: UsuarioSesion,
  datosCrudos: unknown,
  usuarioVinculadoId?: string | null
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosPersonalSchema.parse(datosCrudos);

  const beneficiario = await db.$transaction(async (tx) => {
    const creado = await tx.beneficiario.create({
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
        mismaPersonaQue: { select: { id: true, nombre: true } },
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "Beneficiario",
      entidadId: creado.id,
      accion: "CREAR",
      valorNuevo: { tipo: "ADMINISTRACION", nombre: creado.nombre },
    });

    if (!usuarioVinculadoId) return creado;

    await vincularUsuarioBeneficiarioTx(tx, empresaId, usuario.id, creado.id, usuarioVinculadoId);
    return tx.beneficiario.findUniqueOrThrow({
      where: { id: creado.id },
      include: {
        personalAdministrativo: true,
        usuario: { select: { id: true, nombre: true, rol: true } },
        mismaPersonaQue: { select: { id: true, nombre: true } },
      },
    });
  });

  return filaPersonal(beneficiario, { puedeEliminar: true, motivos: [] });
}

// Mismo criterio de atomicidad que crearPersonalAdministrativo — editar la
// identidad y actualizar el vínculo (incluido desvincular, cuando
// usuarioVinculadoId llega null) ocurren en la misma transacción.
export async function editarPersonalAdministrativo(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  datosCrudos: unknown,
  usuarioVinculadoId: string | null
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosPersonalSchema.parse(datosCrudos);

  const anterior = await db.beneficiario.findFirst({
    where: { id: beneficiarioId, empresaId, tipo: "ADMINISTRACION" },
  });
  if (!anterior) throw new RegistroNoEncontradoError("La persona");

  const beneficiario = await db.$transaction(async (tx) => {
    const mismaPersonaQueId = await resolverMismaPersonaQueId(
      tx,
      empresaId,
      beneficiarioId,
      datos.mismaPersonaQueId
    );

    const editado = await tx.beneficiario.update({
      where: { id: beneficiarioId },
      data: {
        nombre: datos.nombre,
        mismaPersonaQueId,
        personalAdministrativo: {
          update: { nss: datos.nss || null, fechaNacimiento: datos.fechaNacimiento || null },
        },
      },
      include: {
        personalAdministrativo: true,
        usuario: { select: { id: true, nombre: true, rol: true } },
        mismaPersonaQue: { select: { id: true, nombre: true } },
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "Beneficiario",
      entidadId: editado.id,
      accion: "EDITAR",
      valorAnterior: { nombre: anterior.nombre, mismaPersonaQueId: anterior.mismaPersonaQueId },
      valorNuevo: { nombre: editado.nombre, mismaPersonaQueId },
    });

    await vincularUsuarioBeneficiarioTx(tx, empresaId, usuario.id, beneficiarioId, usuarioVinculadoId);
    return tx.beneficiario.findUniqueOrThrow({
      where: { id: editado.id },
      include: {
        personalAdministrativo: true,
        usuario: { select: { id: true, nombre: true, rol: true } },
        mismaPersonaQue: { select: { id: true, nombre: true } },
      },
    });
  });

  return filaPersonal(beneficiario, await evaluarEliminacionBeneficiario(beneficiario.id));
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

// Todos los beneficiarios de la empresa (cualquier tipo) — alimenta el
// selector "¿Es la misma persona que...?" en los 3 formularios de edición.
// Deliberadamente sin filtrar por `mismaPersonaQueId` — resolverMismaPersonaQueId
// ya resuelve un candidato alias hasta su raíz, así que ofrecer también los
// alias existentes en el selector no es incorrecto, solo redundante; cada
// vista filtra su propia fila (no puede ser "la misma persona que sí misma").
export async function listarBeneficiariosParaVincular(
  usuario: UsuarioSesion
): Promise<{ id: string; nombre: string; tipo: string }[]> {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  return db.beneficiario.findMany({
    where: { empresaId, activo: true },
    select: { id: true, nombre: true, tipo: true },
    orderBy: { nombre: "asc" },
  });
}

type Cliente = Prisma.TransactionClient;

// Lógica compartida — la usan tanto el vínculo standalone (vincularUsuarioBeneficiario)
// como crearPersonalAdministrativo/editarPersonalAdministrativo, que la
// invocan dentro de su propia transacción para que identidad + vínculo
// queden atómicos. Sin chequeo de permiso propio: el caller ya lo validó.
async function vincularUsuarioBeneficiarioTx(
  tx: Cliente,
  empresaId: string,
  usuarioId: string,
  beneficiarioId: string,
  usuarioVinculadoId: string | null
) {
  const beneficiario = await tx.beneficiario.findFirst({ where: { id: beneficiarioId, empresaId } });
  if (!beneficiario) throw new RegistroNoEncontradoError("El beneficiario");

  if (usuarioVinculadoId) {
    const usuarioVinculado = await tx.usuario.findFirst({
      where: { id: usuarioVinculadoId, empresaId },
    });
    if (!usuarioVinculado) throw new RegistroNoEncontradoError("El usuario");

    // Camino rápido con mensaje legible — el @unique en Beneficiario.usuarioId
    // es la garantía real ante una carrera.
    const yaVinculado = await tx.beneficiario.findFirst({
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
    actualizado = await tx.beneficiario.update({
      where: { id: beneficiarioId },
      data: { usuarioId: usuarioVinculadoId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidacionError("Ese usuario ya está relacionado con otro beneficiario.");
    }
    throw error;
  }

  await registrarAuditoriaTx(tx, {
    empresaId,
    usuarioId,
    entidad: "Beneficiario",
    entidadId: beneficiario.id,
    accion: "EDITAR",
    valorAnterior: { usuarioId: beneficiario.usuarioId },
    valorNuevo: { usuarioId: usuarioVinculadoId },
  });

  return actualizado;
}

export async function vincularUsuarioBeneficiario(
  usuario: UsuarioSesion,
  beneficiarioId: string,
  usuarioVinculadoId: string | null
) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  return db.$transaction((tx) =>
    vincularUsuarioBeneficiarioTx(tx, empresaId, usuario.id, beneficiarioId, usuarioVinculadoId)
  );
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
