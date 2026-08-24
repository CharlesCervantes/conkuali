import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import {
  puedeCapturarGastos,
  puedeAutorizarOrdenesCompra,
} from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { RegistroNoEncontradoError } from "./estructura-contractual";
import { CATEGORIAS_GASTO } from "@/lib/control-de-obra/categorias-gasto";

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

const ESTATUS_EDITABLES = ["BORRADOR", "PENDIENTE_AUTORIZACION"] as const;

const LineaSchema = z.object({
  concepto: z.string().trim().min(1, "El concepto es obligatorio."),
  descripcion: z.string().trim().optional().nullable(),
  unidad: z.string().trim().min(1, "La unidad es obligatoria."),
  cantidad: z.coerce.number().positive("La cantidad debe ser mayor a cero."),
  precioUnitario: z.coerce.number().nonnegative(),
});

const DatosOrdenCompraSchema = z.object({
  proveedorBeneficiarioId: z.string().trim().min(1, "Selecciona un proveedor."),
  fecha: z.coerce.date(),
  metodoPago: z
    .enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA_DEBITO", "TARJETA_CREDITO"])
    .optional()
    .nullable(),
  requiereFactura: z.coerce.boolean().default(false),
  notas: z.string().trim().optional().nullable(),
  tratamientoCliente: z
    .enum(["INCLUIDO_EN_CONTRATO", "COBRABLE_EN_ESTIMACION", "NO_COBRABLE"])
    .default("NO_COBRABLE"),
  detalle: z.array(LineaSchema).min(1, "Agrega al menos una línea."),
});

function totalDetalle(detalle: { cantidad: number; precioUnitario: number }[]): number {
  return detalle.reduce((t, l) => t + l.cantidad * l.precioUnitario, 0);
}

export async function crearOrdenCompra(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string,
  datosCrudos: unknown
) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  await obtenerProyecto(usuario, proyectoId);
  const datos = DatosOrdenCompraSchema.parse(datosCrudos);

  const semana = await db.semana.findFirst({ where: { id: semanaId, empresaId } });
  if (!semana) throw new RegistroNoEncontradoError("La semana");

  return db.$transaction(async (tx) => {
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: { ultimoFolioOrdenCompra: { increment: 1 } },
    });
    const folio = `OC-${String(empresa.ultimoFolioOrdenCompra).padStart(6, "0")}`;

    // Nace siempre PENDIENTE_AUTORIZACION, sin importar el rol que la
    // captura — misma consistencia que GastoObra/AvanceConcepto.
    const oc = await tx.ordenCompra.create({
      data: {
        empresaId,
        proyectoId,
        semanaId,
        folio,
        numeroFolio: empresa.ultimoFolioOrdenCompra,
        proveedorBeneficiarioId: datos.proveedorBeneficiarioId,
        fecha: datos.fecha,
        metodoPago: datos.metodoPago || null,
        requiereFactura: datos.requiereFactura,
        notas: datos.notas || null,
        tratamientoCliente: datos.tratamientoCliente,
        creadoPorId: usuario.id,
        detalle: { create: datos.detalle },
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "OrdenCompra",
      entidadId: oc.id,
      accion: "CREAR",
      valorNuevo: { folio: oc.folio, total: totalDetalle(datos.detalle) },
    });

    return oc;
  });
}

export async function editarOrdenCompra(usuario: UsuarioSesion, ocId: string, datosCrudos: unknown) {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosOrdenCompraSchema.parse(datosCrudos);

  const anterior = await db.ordenCompra.findFirst({ where: { id: ocId, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("La orden de compra");
  if (!ESTATUS_EDITABLES.includes(anterior.estatus as (typeof ESTATUS_EDITABLES)[number])) {
    throw new ValidacionError("Esta orden de compra ya no se puede editar.");
  }
  if (anterior.creadoPorId !== usuario.id && !puedeAutorizarOrdenesCompra(usuario)) {
    throw new SinPermisoError();
  }

  return db.$transaction(async (tx) => {
    await tx.ordenCompraConcepto.deleteMany({ where: { ordenCompraId: ocId } });
    const oc = await tx.ordenCompra.update({
      where: { id: ocId },
      data: {
        proveedorBeneficiarioId: datos.proveedorBeneficiarioId,
        fecha: datos.fecha,
        metodoPago: datos.metodoPago || null,
        requiereFactura: datos.requiereFactura,
        notas: datos.notas || null,
        tratamientoCliente: datos.tratamientoCliente,
        detalle: { create: datos.detalle },
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "OrdenCompra",
      entidadId: oc.id,
      accion: "EDITAR",
      valorAnterior: { total: null },
      valorNuevo: { total: totalDetalle(datos.detalle) },
    });

    return oc;
  });
}

// ---------------------------------------------------------------------------
// Autorizar — congela el total, crea el MovimientoSemanal en Reporte
// General. Mismo candado/idempotencia que aprobarReposicion.
// ---------------------------------------------------------------------------

export async function autorizarOrdenCompra(usuario: UsuarioSesion, ocId: string) {
  if (!puedeAutorizarOrdenesCompra(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ordenes_compra WHERE id = ${ocId} FOR UPDATE`;

    const oc = await tx.ordenCompra.findFirst({
      where: { id: ocId, empresaId },
      include: { detalle: true },
    });
    if (!oc) throw new RegistroNoEncontradoError("La orden de compra");
    if (oc.estatus === "AUTORIZADA") return oc;
    if (oc.estatus !== "PENDIENTE_AUTORIZACION") {
      throw new ValidacionError("Solo se puede autorizar una orden de compra pendiente.");
    }

    const total = oc.detalle.reduce((t, l) => t + Number(l.cantidad) * Number(l.precioUnitario), 0);
    if (total <= 0) {
      throw new ValidacionError("No se puede autorizar una orden de compra sin importe.");
    }

    // El proveedor del catálogo global no necesita haber sido asignado antes
    // a este proyecto — se crea aquí su participación si hace falta.
    // Idempotente por el @@unique([beneficiarioId, proyectoId]), mismo
    // patrón que obtenerOCrearParticipacionContratista/aprobarReposicion.
    const beneficiarioProyecto = await tx.beneficiarioProyecto.upsert({
      where: {
        beneficiarioId_proyectoId: {
          beneficiarioId: oc.proveedorBeneficiarioId,
          proyectoId: oc.proyectoId,
        },
      },
      update: {},
      create: {
        beneficiarioId: oc.proveedorBeneficiarioId,
        proyectoId: oc.proyectoId,
      },
    });

    const movimiento = await tx.movimientoSemanal.create({
      data: {
        beneficiarioProyectoId: beneficiarioProyecto.id,
        semanaId: oc.semanaId,
        origen: "ORDEN_COMPRA",
        montoFinSemana: total,
        estatusAprobacion: "APROBADO",
        estatusPago: "PENDIENTE_PAGO",
        enviadoPorId: usuario.id,
        aprobadoPorId: usuario.id,
      },
    });

    const actualizada = await tx.ordenCompra.update({
      where: { id: ocId },
      data: {
        estatus: "AUTORIZADA",
        totalAutorizado: total,
        autorizadoPorId: usuario.id,
        autorizadoEn: new Date(),
        movimientoSemanalId: movimiento.id,
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "OrdenCompra",
      entidadId: actualizada.id,
      accion: "CAMBIAR_ESTATUS",
      valorAnterior: { estatus: "PENDIENTE_AUTORIZACION" },
      valorNuevo: { estatus: "AUTORIZADA", total, movimientoSemanalId: movimiento.id },
    });
    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "MovimientoSemanal",
      entidadId: movimiento.id,
      accion: "CREAR",
      valorNuevo: { origen: "ORDEN_COMPRA", montoFinSemana: total, ordenCompraId: ocId },
    });

    return actualizada;
  });
}

const MotivoRechazoSchema = z.string().trim().min(1, "El motivo del rechazo es obligatorio.");

export async function rechazarOrdenCompra(usuario: UsuarioSesion, ocId: string, motivoCrudo: unknown) {
  if (!puedeAutorizarOrdenesCompra(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const motivo = MotivoRechazoSchema.parse(motivoCrudo);

  const oc = await db.ordenCompra.findFirst({ where: { id: ocId, empresaId } });
  if (!oc) throw new RegistroNoEncontradoError("La orden de compra");
  if (oc.estatus !== "PENDIENTE_AUTORIZACION") {
    throw new ValidacionError("Solo se puede rechazar una orden de compra pendiente.");
  }

  const actualizada = await db.ordenCompra.update({
    where: { id: ocId },
    data: { estatus: "RECHAZADA", notas: [oc.notas, `Rechazada: ${motivo}`].filter(Boolean).join(" — ") },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "OrdenCompra",
    entidadId: actualizada.id,
    accion: "RECHAZAR",
    valorAnterior: { estatus: "PENDIENTE_AUTORIZACION" },
    valorNuevo: { estatus: "RECHAZADA", motivo },
  });

  return actualizada;
}

export async function cancelarOrdenCompra(usuario: UsuarioSesion, ocId: string) {
  if (!puedeAutorizarOrdenesCompra(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const oc = await db.ordenCompra.findFirst({ where: { id: ocId, empresaId } });
  if (!oc) throw new RegistroNoEncontradoError("La orden de compra");
  if (oc.estatus === "AUTORIZADA") {
    throw new ValidacionError("Una orden de compra ya autorizada no se puede cancelar aquí.");
  }

  const actualizada = await db.ordenCompra.update({
    where: { id: ocId },
    data: { estatus: "CANCELADA" },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "OrdenCompra",
    entidadId: actualizada.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: oc.estatus },
    valorNuevo: { estatus: "CANCELADA" },
  });

  return actualizada;
}

// ---------------------------------------------------------------------------
// Generar gasto desde una OC ejecutada (sección 28, opción B) — nace
// APROBADO directamente porque ya pasó por la autorización de la OC, no
// tiene sentido pedir una segunda revisión. pagadorBeneficiarioId siempre
// null: Conkuali pagó directo vía la OC, no hay reposición a nadie.
// ---------------------------------------------------------------------------

const DatosGastoDesdeOCSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a cero."),
  fecha: z.coerce.date(),
  categoria: z.enum(CATEGORIAS_GASTO).default("MATERIAL"),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA_DEBITO", "TARJETA_CREDITO"]),
  comentario: z.string().trim().optional().nullable(),
  comprobantePagoUrl: z.string().trim().optional().nullable(),
  comprobantePagoNombre: z.string().trim().optional().nullable(),
});

export async function generarGastoDesdeOrdenCompra(
  usuario: UsuarioSesion,
  ocId: string,
  datosCrudos: unknown
) {
  if (!puedeAutorizarOrdenesCompra(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  const datos = DatosGastoDesdeOCSchema.parse(datosCrudos);

  const oc = await db.ordenCompra.findFirst({ where: { id: ocId, empresaId } });
  if (!oc) throw new RegistroNoEncontradoError("La orden de compra");
  if (oc.estatus !== "AUTORIZADA") {
    throw new ValidacionError("Solo se puede generar el gasto real de una orden de compra autorizada.");
  }

  return db.$transaction(async (tx) => {
    if (datos.comprobantePagoUrl) {
      await tx.ordenCompra.update({
        where: { id: ocId },
        data: {
          comprobantePagoUrl: datos.comprobantePagoUrl,
          comprobantePagoNombre: datos.comprobantePagoNombre || null,
        },
      });
    }

    const gasto = await tx.gastoObra.create({
      data: {
        empresaId,
        proyectoId: oc.proyectoId,
        semanaId: oc.semanaId,
        fecha: datos.fecha,
        descripcion: `Compra ${oc.folio}`,
        categoria: datos.categoria,
        monto: datos.monto,
        metodoPago: datos.metodoPago,
        pagadorBeneficiarioId: null,
        proveedorBeneficiarioId: oc.proveedorBeneficiarioId,
        comentario: datos.comentario || null,
        requiereFactura: oc.requiereFactura,
        tratamientoCliente: oc.tratamientoCliente,
        ordenCompraId: oc.id,
        estatus: "APROBADO",
        capturadoPorId: usuario.id,
        revisadoPorId: usuario.id,
        revisadoEn: new Date(),
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "GastoObra",
      entidadId: gasto.id,
      accion: "CREAR",
      valorNuevo: { descripcion: gasto.descripcion, monto: datos.monto, ordenCompraId: oc.id },
    });

    return gasto;
  });
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export type LineaOrdenCompra = {
  id: string;
  concepto: string;
  descripcion: string | null;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  importe: number;
};

export type FilaOrdenCompra = {
  id: string;
  folio: string;
  proveedorBeneficiarioId: string;
  proveedorNombre: string;
  fecha: string;
  estatus: string;
  total: number;
  estatusPago: string | null;
  requiereFactura: boolean;
  tratamientoCliente: string;
  creadoPorNombre: string;
  autorizadoPorNombre: string | null;
  detalle: LineaOrdenCompra[];
};

export async function obtenerOrdenesCompra(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<FilaOrdenCompra[]> {
  if (!puedeCapturarGastos(usuario)) throw new SinPermisoError();
  await obtenerProyecto(usuario, proyectoId);

  const ordenes = await db.ordenCompra.findMany({
    where: { proyectoId, semanaId },
    include: {
      proveedor: { select: { nombre: true } },
      creadoPor: { select: { nombre: true } },
      autorizadoPor: { select: { nombre: true } },
      movimientoSemanal: { select: { estatusPago: true } },
      detalle: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return ordenes.map((oc) => {
    const detalle = oc.detalle.map((l) => ({
      id: l.id,
      concepto: l.concepto,
      descripcion: l.descripcion,
      unidad: l.unidad,
      cantidad: Number(l.cantidad),
      precioUnitario: Number(l.precioUnitario),
      importe: Number(l.cantidad) * Number(l.precioUnitario),
    }));
    const total = oc.totalAutorizado !== null ? Number(oc.totalAutorizado) : detalle.reduce((t, l) => t + l.importe, 0);

    return {
      id: oc.id,
      folio: oc.folio,
      proveedorBeneficiarioId: oc.proveedorBeneficiarioId,
      proveedorNombre: oc.proveedor.nombre,
      fecha: oc.fecha.toISOString(),
      estatus: oc.estatus,
      total,
      estatusPago: oc.movimientoSemanal?.estatusPago ?? null,
      requiereFactura: oc.requiereFactura,
      tratamientoCliente: oc.tratamientoCliente,
      creadoPorNombre: oc.creadoPor.nombre,
      autorizadoPorNombre: oc.autorizadoPor?.nombre ?? null,
      detalle,
    };
  });
}
