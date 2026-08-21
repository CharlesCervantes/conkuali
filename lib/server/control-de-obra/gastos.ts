import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeCapturarGastos, puedeAprobarGastos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { CATEGORIAS_GASTO } from "@/lib/control-de-obra/categorias-gasto";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { RegistroNoEncontradoError } from "./estructura-contractual";

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// Editable mientras no haya salido de la revisión inicial — igual que el
// resto del sistema, "aprobado" es un punto sin retorno para el monto.
const ESTATUS_EDITABLES = ["BORRADOR", "PENDIENTE_REVISION"] as const;

export type EstatusFiscalGasto = "NO_APLICA" | "PENDIENTE_FACTURA" | "FACTURADO";

// No es columna — se deriva de requiereFactura + facturaUrl (sección 24 del
// diseño de Gastos de Obra, agosto 2026).
export function calcularEstatusFiscal(g: {
  requiereFactura: boolean;
  facturaUrl: string | null;
}): EstatusFiscalGasto {
  if (!g.requiereFactura) return "NO_APLICA";
  return g.facturaUrl ? "FACTURADO" : "PENDIENTE_FACTURA";
}

const DatosGastoSchema = z.object({
  fecha: z.coerce.date(),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria."),
  categoria: z.enum(CATEGORIAS_GASTO),
  monto: z.coerce.number().positive("El monto debe ser mayor a cero."),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA_DEBITO", "TARJETA_CREDITO"]),
  // "YO" nunca confía en pagadorBeneficiarioId del cliente — se resuelve
  // server-side contra el Usuario de la sesión (ver resolverPagadorBeneficiarioId).
  // "OTRO" sí usa pagadorBeneficiarioId (quien captura no necesariamente
  // pagó). "EMPRESA" = sin reposición para nadie.
  quienPagoModo: z.enum(["YO", "OTRO", "EMPRESA"]).default("OTRO"),
  pagadorBeneficiarioId: z.string().trim().optional().nullable(),
  proveedorBeneficiarioId: z.string().trim().optional().nullable(),
  comentario: z.string().trim().optional().nullable(),
  requiereFactura: z.coerce.boolean().default(false),
  tratamientoCliente: z
    .enum(["INCLUIDO_EN_CONTRATO", "COBRABLE_EN_ESTIMACION", "NO_COBRABLE"])
    .default("NO_COBRABLE"),
  ticketUrl: z.string().trim().optional().nullable(),
  ticketNombre: z.string().trim().optional().nullable(),
});

export type DatosGasto = z.infer<typeof DatosGastoSchema>;

// Resuelve a quién reponerle sin confiar en el cliente para el caso "YO" —
// el beneficiario vinculado al usuario en sesión se consulta aquí mismo,
// nunca se toma de un id que venga en el FormData (decisión de sesión,
// agosto 2026: la semántica "yo pagué" no puede depender de un valor que el
// cliente podría manipular).
async function resolverPagadorBeneficiarioId(
  usuario: UsuarioSesion,
  empresaId: string,
  datos: Pick<DatosGasto, "quienPagoModo" | "pagadorBeneficiarioId">
): Promise<string | null> {
  if (datos.quienPagoModo === "EMPRESA") return null;

  if (datos.quienPagoModo === "YO") {
    const usuarioConBeneficiario = await db.usuario.findFirst({
      where: { id: usuario.id, empresaId },
      select: { beneficiario: { select: { id: true } } },
    });
    if (!usuarioConBeneficiario?.beneficiario) {
      throw new ValidacionError(
        "Este usuario no tiene un beneficiario de pago relacionado. Configúralo antes de generar la reposición."
      );
    }
    return usuarioConBeneficiario.beneficiario.id;
  }

  // "OTRO"
  if (!datos.pagadorBeneficiarioId) return null;
  const beneficiario = await db.beneficiario.findFirst({
    where: { id: datos.pagadorBeneficiarioId, empresaId },
  });
  if (!beneficiario) throw new RegistroNoEncontradoError("El beneficiario seleccionado");
  return beneficiario.id;
}

export async function crearGasto(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string,
  datosCrudos: unknown
) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  await obtenerProyecto(usuario, proyectoId);
  const datos = DatosGastoSchema.parse(datosCrudos);

  const semana = await db.semana.findFirst({ where: { id: semanaId, empresaId } });
  if (!semana) throw new RegistroNoEncontradoError("La semana");

  const pagadorBeneficiarioId = await resolverPagadorBeneficiarioId(usuario, empresaId, datos);

  // Nace siempre PENDIENTE_REVISION, sin importar el rol que captura — misma
  // consistencia que AvanceConcepto: aprobar es siempre una acción explícita
  // separada de capturar (decisión de sesión, agosto 2026).
  const gasto = await db.gastoObra.create({
    data: {
      empresaId,
      proyectoId,
      semanaId,
      fecha: datos.fecha,
      descripcion: datos.descripcion,
      categoria: datos.categoria,
      monto: datos.monto,
      metodoPago: datos.metodoPago,
      pagadorBeneficiarioId,
      proveedorBeneficiarioId: datos.proveedorBeneficiarioId || null,
      comentario: datos.comentario || null,
      requiereFactura: datos.requiereFactura,
      tratamientoCliente: datos.tratamientoCliente,
      ticketUrl: datos.ticketUrl || null,
      ticketNombre: datos.ticketNombre || null,
      capturadoPorId: usuario.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoObra",
    entidadId: gasto.id,
    accion: "CREAR",
    valorNuevo: { descripcion: gasto.descripcion, monto: datos.monto, categoria: gasto.categoria },
  });

  return gasto;
}

export async function editarGasto(usuario: UsuarioSesion, gastoId: string, datosCrudos: unknown) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosGastoSchema.parse(datosCrudos);

  const anterior = await db.gastoObra.findFirst({ where: { id: gastoId, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El gasto");

  if (!ESTATUS_EDITABLES.includes(anterior.estatus as (typeof ESTATUS_EDITABLES)[number])) {
    throw new ValidacionError("Este gasto ya no se puede editar — su revisión ya avanzó.");
  }
  // Solo quien lo capturó puede editarlo, salvo Administrador/Director/Master
  // (mismo criterio que el resto del sistema: capturar no da acceso a editar
  // lo de alguien más, revisar sí).
  if (anterior.capturadoPorId !== usuario.id && !puedeAprobarGastos(usuario)) {
    throw new SinPermisoError();
  }

  const pagadorBeneficiarioId = await resolverPagadorBeneficiarioId(usuario, empresaId, datos);

  const gasto = await db.gastoObra.update({
    where: { id: gastoId },
    data: {
      fecha: datos.fecha,
      descripcion: datos.descripcion,
      categoria: datos.categoria,
      monto: datos.monto,
      metodoPago: datos.metodoPago,
      pagadorBeneficiarioId,
      proveedorBeneficiarioId: datos.proveedorBeneficiarioId || null,
      comentario: datos.comentario || null,
      requiereFactura: datos.requiereFactura,
      tratamientoCliente: datos.tratamientoCliente,
      ticketUrl: datos.ticketUrl || anterior.ticketUrl,
      ticketNombre: datos.ticketNombre || anterior.ticketNombre,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoObra",
    entidadId: gasto.id,
    accion: "EDITAR",
    valorAnterior: { descripcion: anterior.descripcion, monto: Number(anterior.monto) },
    valorNuevo: { descripcion: gasto.descripcion, monto: Number(gasto.monto) },
  });

  return gasto;
}

// Enviar a revisión — de BORRADOR a PENDIENTE_REVISION. En la práctica un
// gasto capturado por el formulario normal ya nace PENDIENTE_REVISION; este
// paso solo aplica a un BORRADOR guardado a medias.
export async function enviarGastoARevision(usuario: UsuarioSesion, gastoId: string) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const gasto = await db.gastoObra.findFirst({ where: { id: gastoId, empresaId } });
  if (!gasto) throw new RegistroNoEncontradoError("El gasto");
  if (gasto.capturadoPorId !== usuario.id && !puedeAprobarGastos(usuario)) {
    throw new SinPermisoError();
  }
  if (gasto.estatus !== "BORRADOR") return gasto;

  const actualizado = await db.gastoObra.update({
    where: { id: gastoId },
    data: { estatus: "PENDIENTE_REVISION" },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoObra",
    entidadId: actualizado.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: "BORRADOR" },
    valorNuevo: { estatus: "PENDIENTE_REVISION" },
  });

  return actualizado;
}

export async function aprobarGasto(usuario: UsuarioSesion, gastoId: string) {
  if (!puedeAprobarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const gasto = await db.gastoObra.findFirst({ where: { id: gastoId, empresaId } });
  if (!gasto) throw new RegistroNoEncontradoError("El gasto");
  if (gasto.estatus !== "PENDIENTE_REVISION") {
    throw new ValidacionError("Solo se puede aprobar un gasto pendiente de revisión.");
  }

  const actualizado = await db.gastoObra.update({
    where: { id: gastoId },
    data: {
      estatus: "APROBADO",
      revisadoPorId: usuario.id,
      revisadoEn: new Date(),
      motivoRechazo: null,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoObra",
    entidadId: actualizado.id,
    accion: "CONFIRMAR",
    valorAnterior: { estatus: "PENDIENTE_REVISION" },
    valorNuevo: { estatus: "APROBADO" },
  });

  return actualizado;
}

const MotivoRechazoSchema = z.string().trim().min(1, "El motivo del rechazo es obligatorio.");

export async function rechazarGasto(usuario: UsuarioSesion, gastoId: string, motivoCrudo: unknown) {
  if (!puedeAprobarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const motivo = MotivoRechazoSchema.parse(motivoCrudo);

  const gasto = await db.gastoObra.findFirst({ where: { id: gastoId, empresaId } });
  if (!gasto) throw new RegistroNoEncontradoError("El gasto");
  if (gasto.estatus !== "PENDIENTE_REVISION") {
    throw new ValidacionError("Solo se puede rechazar un gasto pendiente de revisión.");
  }

  // Un gasto rechazado no se elimina — conserva quién, cuándo y por qué
  // (sección 9 del diseño de Gastos de Obra).
  const actualizado = await db.gastoObra.update({
    where: { id: gastoId },
    data: {
      estatus: "RECHAZADO",
      revisadoPorId: usuario.id,
      revisadoEn: new Date(),
      motivoRechazo: motivo,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoObra",
    entidadId: actualizado.id,
    accion: "RECHAZAR",
    valorAnterior: { estatus: "PENDIENTE_REVISION" },
    valorNuevo: { estatus: "RECHAZADO", motivo },
  });

  return actualizado;
}

export async function registrarFacturaGasto(
  usuario: UsuarioSesion,
  gastoId: string,
  datos: { facturaUrl: string; facturaNombre: string }
) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const gasto = await db.gastoObra.findFirst({ where: { id: gastoId, empresaId } });
  if (!gasto) throw new RegistroNoEncontradoError("El gasto");

  const actualizado = await db.gastoObra.update({
    where: { id: gastoId },
    data: { facturaUrl: datos.facturaUrl, facturaNombre: datos.facturaNombre },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoObra",
    entidadId: actualizado.id,
    accion: "EDITAR",
    valorAnterior: { facturaUrl: gasto.facturaUrl },
    valorNuevo: { facturaUrl: actualizado.facturaUrl },
  });

  return actualizado;
}

// ---------------------------------------------------------------------------
// Lectura — listado de Gastos de un proyecto+semana, con lo necesario para
// el dashboard (sección 36) y para elegir qué incluir en una Reposición.
// ---------------------------------------------------------------------------

export type FilaGasto = {
  id: string;
  fecha: string;
  descripcion: string;
  categoria: string;
  monto: number;
  metodoPago: string;
  pagadorBeneficiarioId: string | null;
  pagadorNombre: string | null;
  proveedorBeneficiarioId: string | null;
  proveedorNombre: string | null;
  comentario: string | null;
  requiereFactura: boolean;
  estatusFiscal: EstatusFiscalGasto;
  tratamientoCliente: string;
  ticketUrl: string | null;
  ticketNombre: string | null;
  facturaUrl: string | null;
  facturaNombre: string | null;
  estatus: string;
  capturadoPorId: string;
  capturadoPorNombre: string;
  revisadoPorNombre: string | null;
  motivoRechazo: string | null;
  reposicionGastosId: string | null;
  ordenCompraId: string | null;
};

export async function obtenerGastos(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<FilaGasto[]> {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  await obtenerProyecto(usuario, proyectoId);

  const gastos = await db.gastoObra.findMany({
    where: { proyectoId, semanaId },
    include: {
      pagador: { select: { nombre: true } },
      proveedor: { select: { nombre: true } },
      capturadoPor: { select: { nombre: true } },
      revisadoPor: { select: { nombre: true } },
    },
    orderBy: { fecha: "desc" },
  });

  return gastos.map((g) => ({
    id: g.id,
    fecha: g.fecha.toISOString(),
    descripcion: g.descripcion,
    categoria: g.categoria,
    monto: Number(g.monto),
    metodoPago: g.metodoPago,
    pagadorBeneficiarioId: g.pagadorBeneficiarioId,
    pagadorNombre: g.pagador?.nombre ?? null,
    proveedorBeneficiarioId: g.proveedorBeneficiarioId,
    proveedorNombre: g.proveedor?.nombre ?? null,
    comentario: g.comentario,
    requiereFactura: g.requiereFactura,
    estatusFiscal: calcularEstatusFiscal(g),
    tratamientoCliente: g.tratamientoCliente,
    ticketUrl: g.ticketUrl,
    ticketNombre: g.ticketNombre,
    facturaUrl: g.facturaUrl,
    facturaNombre: g.facturaNombre,
    estatus: g.estatus,
    capturadoPorId: g.capturadoPorId,
    capturadoPorNombre: g.capturadoPor.nombre,
    revisadoPorNombre: g.revisadoPor?.nombre ?? null,
    motivoRechazo: g.motivoRechazo,
    reposicionGastosId: g.reposicionGastosId,
    ordenCompraId: g.ordenCompraId,
  }));
}

export type DashboardGastos = {
  capturados: number;
  pendientesRevision: number;
  aprobados: number;
  totalAprobado: number;
};

// Catálogo de beneficiarios seleccionables para pagador/proveedor — mismo
// criterio que listarContratistasDisponibles (estructura-contractual.ts):
// catálogo de la empresa completa, no solo los ya asignados a este proyecto,
// porque un pagador/proveedor puede no tener todavía un BeneficiarioProyecto
// formal en esta obra específica.
export async function listarBeneficiariosParaGasto(
  usuario: UsuarioSesion
): Promise<{ id: string; nombre: string; tipo: string }[]> {
  if (!usuario.empresa) throw new SinPermisoError();
  return db.beneficiario.findMany({
    where: { empresaId: usuario.empresa.id, activo: true },
    select: { id: true, nombre: true, tipo: true },
    orderBy: { nombre: "asc" },
  });
}

export function calcularDashboardGastos(filas: FilaGasto[]): DashboardGastos {
  const aprobados = filas.filter((f) => f.estatus === "APROBADO");
  return {
    capturados: filas.length,
    pendientesRevision: filas.filter((f) => f.estatus === "PENDIENTE_REVISION").length,
    aprobados: aprobados.length,
    totalAprobado: aprobados.reduce((t, f) => t + f.monto, 0),
  };
}
