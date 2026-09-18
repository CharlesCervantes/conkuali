import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeVerContabilidad, puedeRegistrarMovimientoContable, puedeCancelarRegistroContable } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";
import { EMPRESA_PROYECTO_LABEL } from "@/lib/server/control-de-obra/proyecto-oficina";

// Ingreso decora un MovimientoFinancieroCliente existente (pago de cliente ya
// trackeado — SIN duplicar monto/fecha/proyecto) o representa un ingreso
// manual sin origen previo. Mismo criterio de decoración perezosa que Egreso
// (Contabilidad, septiembre 2026). Solo PAGO_ESTIMACION y APORTACION_FONDO
// son dinero real entrando — APLICACION_ESTIMACION es un movimiento interno
// (fondo ya contado como ingreso al aportarse) y nunca se cuenta aquí, para
// no duplicar el ingreso.

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function rangoMes(anio: number, mes: number): { desde: Date; hasta: Date } {
  return { desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 1) };
}

// Aislamiento multiempresa (Preparación de Producción — Etapa 1, septiembre
// 2026) — mismo criterio y mismo patrón que validarReferenciasEgreso
// (egresos.ts): toda referencia opcional que llegue del cliente (cuenta
// receptora, factura, proyecto) se comprueba contra la Empresa del usuario
// antes de vincularla.
async function validarReferenciasIngreso(
  empresaId: string,
  datos: { proyectoId?: string | null; cuentaReceptoraId?: string | null; facturaId?: string | null }
): Promise<void> {
  const [proyecto, cuentaReceptora, factura] = await Promise.all([
    datos.proyectoId ? db.proyecto.findFirst({ where: { id: datos.proyectoId, empresaId }, select: { id: true } }) : null,
    datos.cuentaReceptoraId
      ? db.medioFinanciero.findFirst({ where: { id: datos.cuentaReceptoraId, empresaId }, select: { id: true } })
      : null,
    datos.facturaId ? db.factura.findFirst({ where: { id: datos.facturaId, empresaId }, select: { id: true } }) : null,
  ]);
  if (datos.proyectoId && !proyecto) throw new RegistroNoEncontradoError("El proyecto");
  if (datos.cuentaReceptoraId && !cuentaReceptora) throw new RegistroNoEncontradoError("La cuenta receptora");
  if (datos.facturaId && !factura) throw new RegistroNoEncontradoError("La factura");
}

export type FilaIngreso = {
  ingresoId: string | null;
  movimientoFinancieroClienteId: string | null;
  fecha: string;
  concepto: string;
  proyectoNombre: string | null;
  monto: number;
  clienteNombre: string | null;
  medioIngreso: string | null;
  cuentaReceptoraNombre: string | null;
  // Una sola referencia bancaria por cobro (Cobros de cliente, septiembre
  // 2026) — si el Ingreso decora un MovimientoFinancieroCliente, SIEMPRE se
  // lee la referencia de ese movimiento (fuente única); Ingreso.referencia
  // solo tiene significado propio para un ingreso manual sin origen.
  referencia: string | null;
  facturaId: string | null;
  facturaUuid: string | null;
  estatus: "VIGENTE" | "CANCELADO";
  motivoCancelacion: string | null;
};

export async function obtenerIngresos(usuario: UsuarioSesion, anio: number, mes: number): Promise<FilaIngreso[]> {
  const empresaId = requerirContabilidad(usuario);
  const { desde, hasta } = rangoMes(anio, mes);

  // Se listan también los pagos CANCELADOS (nunca se borran) para
  // trazabilidad — el resumen fiscal (obtenerResumenFiscalPeriodo) es el que
  // los excluye de los totales, no esta lista.
  const [pagosCliente, ingresosManuales] = await Promise.all([
    db.movimientoFinancieroCliente.findMany({
      where: {
        empresaId,
        tipo: { in: ["PAGO_ESTIMACION", "APORTACION_FONDO"] },
        fecha: { gte: desde, lt: hasta },
      },
      include: {
        proyecto: { select: { nombre: true, tipo: true } },
        ingreso: {
          include: {
            cuentaReceptora: { select: { nombre: true } },
            factura: { select: { id: true, uuid: true } },
          },
        },
      },
      orderBy: { fecha: "desc" },
    }),
    db.ingreso.findMany({
      where: {
        empresaId,
        movimientoFinancieroClienteId: null,
        estatus: "VIGENTE",
        fecha: { gte: desde, lt: hasta },
      },
      include: {
        proyecto: { select: { nombre: true, tipo: true } },
        cuentaReceptora: { select: { nombre: true } },
        factura: { select: { id: true, uuid: true } },
      },
      orderBy: { fecha: "desc" },
    }),
  ]);

  const filasDePago: FilaIngreso[] = pagosCliente.map((m) => ({
    ingresoId: m.ingreso?.id ?? null,
    movimientoFinancieroClienteId: m.id,
    fecha: m.fecha.toISOString(),
    concepto: m.tipo === "APORTACION_FONDO" ? "Aportación de fondo" : "Pago de estimación",
    proyectoNombre: m.proyecto.tipo === "OFICINA" ? EMPRESA_PROYECTO_LABEL : m.proyecto.nombre,
    monto: Number(m.monto),
    clienteNombre: m.ingreso?.clienteNombre ?? null,
    medioIngreso: m.ingreso?.metodoIngreso ?? null,
    cuentaReceptoraNombre: m.ingreso?.cuentaReceptora?.nombre ?? null,
    referencia: m.referencia,
    facturaId: m.ingreso?.factura?.id ?? null,
    facturaUuid: m.ingreso?.factura?.uuid ?? null,
    estatus: m.estatus,
    motivoCancelacion: m.motivoCancelacion,
  }));

  const filasManuales: FilaIngreso[] = ingresosManuales.map((i) => ({
    ingresoId: i.id,
    movimientoFinancieroClienteId: null,
    fecha: (i.fecha ?? i.createdAt).toISOString(),
    concepto: i.concepto ?? "Ingreso manual",
    proyectoNombre: i.proyecto ? (i.proyecto.tipo === "OFICINA" ? EMPRESA_PROYECTO_LABEL : i.proyecto.nombre) : null,
    monto: Number(i.monto ?? 0),
    clienteNombre: i.clienteNombre,
    medioIngreso: i.metodoIngreso,
    cuentaReceptoraNombre: i.cuentaReceptora?.nombre ?? null,
    referencia: i.referencia,
    facturaId: i.factura?.id ?? null,
    facturaUuid: i.factura?.uuid ?? null,
    estatus: i.estatus,
    motivoCancelacion: null,
  }));

  return [...filasDePago, ...filasManuales].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

const DatosDecoracionIngresoSchema = z.object({
  clienteNombre: z.string().trim().optional().nullable(),
  metodoIngreso: z.enum(["TRANSFERENCIA", "DEPOSITO", "CHEQUE", "OTRO"]).optional().nullable(),
  cuentaReceptoraId: z.string().trim().optional().nullable(),
  // Sin `referencia` — un Ingreso ligado a un MovimientoFinancieroCliente
  // nunca tiene su propia referencia bancaria, siempre se lee la del
  // movimiento (fuente única, Cobros de cliente, septiembre 2026).
  // `comprobanteRef`/`comprobanteNombre` en `undefined` (clave ausente en el
  // FormData, ver guardarDecoracionIngresoAction) significa "no se subió un
  // archivo nuevo — conservar el que ya hubiera", nunca "borrar" — antes de
  // este cambio, re-guardar cualquier otro campo sin volver a adjuntar el
  // archivo BORRABA el comprobante ya guardado.
  comprobanteRef: z.string().trim().optional().nullable(),
  comprobanteNombre: z.string().trim().optional().nullable(),
  facturaId: z.string().trim().optional().nullable(),
  facturaEsperada: z.coerce.boolean().default(false),
  comentarios: z.string().trim().optional().nullable(),
});

// Crea o actualiza la decoración fiscal de un MovimientoFinancieroCliente
// existente — nunca toca monto/fecha/proyecto del pago.
export async function guardarDecoracionIngreso(
  usuario: UsuarioSesion,
  movimientoFinancieroClienteId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const datos = DatosDecoracionIngresoSchema.parse(datosCrudos);

  const movimiento = await db.movimientoFinancieroCliente.findFirst({
    where: { id: movimientoFinancieroClienteId, empresaId },
  });
  if (!movimiento) throw new RegistroNoEncontradoError("El pago de cliente");
  await validarReferenciasIngreso(empresaId, datos);

  const data = {
    clienteNombre: datos.clienteNombre || null,
    metodoIngreso: datos.metodoIngreso || null,
    cuentaReceptoraId: datos.cuentaReceptoraId || null,
    // undefined = no tocar (conservar lo que ya hubiera) — ver comentario en
    // el schema.
    comprobanteRef: datos.comprobanteRef === undefined ? undefined : datos.comprobanteRef || null,
    comprobanteNombre: datos.comprobanteNombre === undefined ? undefined : datos.comprobanteNombre || null,
    facturaId: datos.facturaId || null,
    facturaEsperada: datos.facturaEsperada,
    comentarios: datos.comentarios || null,
  };

  const ingreso = await db.ingreso.upsert({
    where: { movimientoFinancieroClienteId },
    update: data,
    create: {
      empresaId,
      movimientoFinancieroClienteId,
      registradoPorId: usuario.id,
      ...data,
      comprobanteRef: data.comprobanteRef ?? null,
      comprobanteNombre: data.comprobanteNombre ?? null,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Ingreso",
    entidadId: ingreso.id,
    accion: "EDITAR",
    valorNuevo: { movimientoFinancieroClienteId, ...data },
  });

  return ingreso;
}

const DatosIngresoManualSchema = z.object({
  fecha: z.coerce.date(),
  concepto: z.string().trim().min(1, "El concepto es obligatorio."),
  monto: z.coerce.number().positive("El monto debe ser mayor a cero."),
  proyectoId: z.string().trim().optional().nullable(),
  clienteNombre: z.string().trim().optional().nullable(),
  metodoIngreso: z.enum(["TRANSFERENCIA", "DEPOSITO", "CHEQUE", "OTRO"]).optional().nullable(),
  cuentaReceptoraId: z.string().trim().optional().nullable(),
  referencia: z.string().trim().optional().nullable(),
  comprobanteRef: z.string().trim().optional().nullable(),
  comprobanteNombre: z.string().trim().optional().nullable(),
  facturaId: z.string().trim().optional().nullable(),
  facturaEsperada: z.coerce.boolean().default(false),
  comentarios: z.string().trim().optional().nullable(),
});

export async function crearIngresoManual(usuario: UsuarioSesion, datosCrudos: unknown) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const datos = DatosIngresoManualSchema.parse(datosCrudos);
  await validarReferenciasIngreso(empresaId, datos);

  const ingreso = await db.ingreso.create({
    data: {
      empresaId,
      fecha: datos.fecha,
      concepto: datos.concepto,
      monto: datos.monto,
      proyectoId: datos.proyectoId || null,
      clienteNombre: datos.clienteNombre || null,
      metodoIngreso: datos.metodoIngreso || null,
      cuentaReceptoraId: datos.cuentaReceptoraId || null,
      referencia: datos.referencia || null,
      comprobanteRef: datos.comprobanteRef || null,
      comprobanteNombre: datos.comprobanteNombre || null,
      facturaId: datos.facturaId || null,
      facturaEsperada: datos.facturaEsperada,
      comentarios: datos.comentarios || null,
      registradoPorId: usuario.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Ingreso",
    entidadId: ingreso.id,
    accion: "CREAR",
    valorNuevo: { concepto: ingreso.concepto, monto: datos.monto },
  });

  return ingreso;
}

export async function editarIngresoManual(usuario: UsuarioSesion, id: string, datosCrudos: unknown) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const datos = DatosIngresoManualSchema.parse(datosCrudos);

  const anterior = await db.ingreso.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El ingreso");
  if (anterior.movimientoFinancieroClienteId) {
    throw new ValidacionError(
      "Este ingreso proviene de un pago de cliente ya trackeado — sus datos operativos se editan desde Cliente."
    );
  }
  await validarReferenciasIngreso(empresaId, datos);

  const ingreso = await db.ingreso.update({
    where: { id },
    data: {
      fecha: datos.fecha,
      concepto: datos.concepto,
      monto: datos.monto,
      proyectoId: datos.proyectoId || null,
      clienteNombre: datos.clienteNombre || null,
      metodoIngreso: datos.metodoIngreso || null,
      cuentaReceptoraId: datos.cuentaReceptoraId || null,
      referencia: datos.referencia || null,
      // undefined (no se volvió a adjuntar archivo — este formulario no
      // permite reemplazarlo todavía) = conservar el comprobante ya
      // guardado, nunca borrarlo (mismo criterio que guardarDecoracionIngreso).
      comprobanteRef: datos.comprobanteRef === undefined ? undefined : datos.comprobanteRef || null,
      comprobanteNombre: datos.comprobanteNombre === undefined ? undefined : datos.comprobanteNombre || null,
      facturaId: datos.facturaId || null,
      facturaEsperada: datos.facturaEsperada,
      comentarios: datos.comentarios || null,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Ingreso",
    entidadId: ingreso.id,
    accion: "EDITAR",
    valorAnterior: { concepto: anterior.concepto, monto: Number(anterior.monto ?? 0) },
    valorNuevo: { concepto: ingreso.concepto, monto: datos.monto },
  });

  return ingreso;
}

export async function cancelarIngreso(usuario: UsuarioSesion, id: string) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeCancelarRegistroContable(usuario)) throw new SinPermisoError();

  const anterior = await db.ingreso.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El ingreso");

  const ingreso = await db.ingreso.update({ where: { id }, data: { estatus: "CANCELADO" } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Ingreso",
    entidadId: ingreso.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: anterior.estatus },
    valorNuevo: { estatus: "CANCELADO" },
  });

  return ingreso;
}
