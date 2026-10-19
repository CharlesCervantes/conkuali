import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import {
  puedeVerContabilidad,
  puedeRegistrarMovimientoContable,
  puedeCancelarRegistroContable,
  puedeVerInformacionPrivada,
} from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";
import { EMPRESA_PROYECTO_LABEL } from "@/lib/server/control-de-obra/proyecto-oficina";
import { CLASIFICACIONES_INGRESO_MANUAL } from "./estado-resultados";

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
  datos: { proyectoId?: string | null; cuentaReceptoraId?: string | null; facturaId?: string | null },
  cliente: Prisma.TransactionClient = db
): Promise<void> {
  const [proyecto, cuentaReceptora, factura] = await Promise.all([
    datos.proyectoId ? cliente.proyecto.findFirst({ where: { id: datos.proyectoId, empresaId }, select: { id: true } }) : null,
    datos.cuentaReceptoraId
      ? cliente.medioFinanciero.findFirst({ where: { id: datos.cuentaReceptoraId, empresaId }, select: { id: true } })
      : null,
    datos.facturaId ? cliente.factura.findFirst({ where: { id: datos.facturaId, empresaId }, select: { id: true } }) : null,
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
  cobroPago: "COBRADO" | "POR_COBRAR";
  cfdi: "NO_REQUERIDO" | "PENDIENTE" | "VINCULADO";
  // Valores actuales para precargar los formularios (corrección de pérdida
  // de datos, octubre 2026) — sin ellos, guardar sin tocar un campo lo
  // borraba. Nada nuevo se expone: son datos de filas que el usuario ya ve.
  cuentaReceptoraId: string | null;
  proyectoId: string | null;
  clasificacionManual: string | null;
  fechaCobro: string | null;
  comentarios: string | null;
  facturaEsperada: boolean;
};

export async function obtenerIngresos(usuario: UsuarioSesion, anio: number, mes: number): Promise<FilaIngreso[]> {
  const empresaId = requerirContabilidad(usuario);
  const { desde, hasta } = rangoMes(anio, mes);
  const incluyePrivado = puedeVerInformacionPrivada(usuario);

  // Se listan también los pagos CANCELADOS (nunca se borran) para
  // trazabilidad — el resumen fiscal es el que los excluye de los totales,
  // no esta lista. Privado (decisión 4, docs/negocio/05-modulo-contabilidad.md
  // sección 17): un usuario sin puedeVerInformacionPrivada NUNCA ve una fila
  // ligada a la capa PRIVADO aquí, filtrado server-side antes de devolver
  // nada — no solo agregados.
  const [pagosCliente, ingresosManuales] = await Promise.all([
    db.movimientoFinancieroCliente.findMany({
      where: {
        empresaId,
        tipo: { in: ["PAGO_ESTIMACION", "APORTACION_FONDO"] },
        fecha: { gte: desde, lt: hasta },
        ...(incluyePrivado
          ? {}
          : { OR: [{ estimacionClienteCapaId: null }, { estimacionClienteCapa: { capa: "OPERATIVO" } }] }),
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
    // MovimientoFinancieroCliente solo existe cuando el dinero ya entró —
    // siempre cobrado, por definición del modelo.
    cobroPago: "COBRADO",
    cfdi: m.ingreso?.facturaId ? "VINCULADO" : m.ingreso?.facturaEsperada ? "PENDIENTE" : "NO_REQUERIDO",
    cuentaReceptoraId: m.ingreso?.cuentaReceptoraId ?? null,
    // Proyecto, clasificación y fecha de cobro de un pago de cliente viven
    // en el movimiento (Control de Obra), no en su decoración.
    proyectoId: null,
    clasificacionManual: null,
    fechaCobro: null,
    comentarios: m.ingreso?.comentarios ?? null,
    facturaEsperada: m.ingreso?.facturaEsperada ?? false,
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
    cobroPago: i.fechaCobro ? "COBRADO" : "POR_COBRAR",
    cfdi: i.facturaId ? "VINCULADO" : i.facturaEsperada ? "PENDIENTE" : "NO_REQUERIDO",
    cuentaReceptoraId: i.cuentaReceptoraId,
    proyectoId: i.proyectoId,
    clasificacionManual: i.clasificacionManual,
    fechaCobro: i.fechaCobro ? i.fechaCobro.toISOString() : null,
    comentarios: i.comentarios,
    facturaEsperada: i.facturaEsperada,
  }));

  return [...filasDePago, ...filasManuales].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Contrato de actualización PARCIAL (corrección de pérdida de datos, octubre
// 2026) — mismo criterio que guardarDecoracionEgreso, para la decoración de
// un pago de cliente y para la edición de un ingreso manual:
// - campo omitido (propiedad ausente o undefined) → se conserva lo guardado,
//   exactamente (sin reescribirlo ni normalizar su fecha/hora);
// - campo explícito en null o "" → se limpia;
// - campo con valor → se actualiza.
// Al crear la decoración, los campos omitidos quedan vacíos. Solo se escriben
// y se auditan (valor anterior → nuevo) los campos que cambian de verdad.
// Antes de esta corrección, el formulario no precargaba varios campos y el
// servidor reemplazaba todo: guardar sin tocarlos borraba la cuenta
// receptora (y el cobro salía del saldo de Bancos), la factura, los
// comentarios, "se espera factura", y en un ingreso manual el proyecto y la
// fecha de cobro.
// ---------------------------------------------------------------------------

type ValorCampo = string | number | boolean | Date | null;

const mismoValor = (a: ValorCampo | undefined, b: ValorCampo | undefined) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

const paraAuditoria = (valores: Record<string, ValorCampo>) =>
  Object.fromEntries(Object.entries(valores).map(([campo, valor]) => [campo, valor instanceof Date ? valor.toISOString() : valor]));

// "" explícito = limpiar (mismo significado que null).
function vaciosANull(datosCrudos: unknown, campos: readonly string[]): Record<string, unknown> {
  const crudo = { ...((datosCrudos ?? {}) as Record<string, unknown>) };
  for (const campo of campos) if (crudo[campo] === "") crudo[campo] = null;
  return crudo;
}

// Solo lo que el llamador envió (undefined = omitido).
function camposEnviados<T extends Record<string, unknown>>(datos: T, campos: readonly (keyof T)[]): Partial<T> {
  const enviados: Partial<T> = {};
  for (const campo of campos) if (datos[campo] !== undefined) enviados[campo] = datos[campo];
  return enviados;
}

// Privacidad (D-a, octubre 2026): un cobro ligado a la capa PRIVADO solo lo
// decora quien puede ver información privada — mismo criterio que
// obtenerIngresos. Para cualquier otro usuario el cobro "no existe".
function cobroVisiblePara(usuario: UsuarioSesion, capa: string | null | undefined): boolean {
  return capa !== "PRIVADO" || puedeVerInformacionPrivada(usuario);
}

const METODOS_INGRESO = ["TRANSFERENCIA", "DEPOSITO", "CHEQUE", "OTRO"] as const;

const DatosDecoracionIngresoSchema = z.object({
  clienteNombre: z.string().trim().optional().nullable(),
  metodoIngreso: z.enum(METODOS_INGRESO).optional().nullable(),
  cuentaReceptoraId: z.string().trim().optional().nullable(),
  // Sin `referencia` — un Ingreso ligado a un MovimientoFinancieroCliente
  // nunca tiene su propia referencia bancaria, siempre se lee la del
  // movimiento (fuente única, Cobros de cliente, septiembre 2026); el
  // formulario la muestra como solo lectura (D-b).
  // `comprobanteRef`/`comprobanteNombre` en `undefined` (no se subió un
  // archivo nuevo) = conservar el que ya hubiera, nunca borrarlo.
  comprobanteRef: z.string().trim().optional().nullable(),
  comprobanteNombre: z.string().trim().optional().nullable(),
  facturaId: z.string().trim().optional().nullable(),
  facturaEsperada: z.boolean().optional(),
  comentarios: z.string().trim().optional().nullable(),
});

const CAMPOS_DECORACION_INGRESO = [
  "clienteNombre",
  "metodoIngreso",
  "cuentaReceptoraId",
  "comprobanteRef",
  "comprobanteNombre",
  "facturaId",
  "facturaEsperada",
  "comentarios",
] as const;

type ValoresDecoracionIngreso = {
  clienteNombre: string | null;
  metodoIngreso: (typeof METODOS_INGRESO)[number] | null;
  cuentaReceptoraId: string | null;
  comprobanteRef: string | null;
  comprobanteNombre: string | null;
  facturaId: string | null;
  facturaEsperada: boolean;
  comentarios: string | null;
};

// Crea o actualiza la decoración fiscal de un MovimientoFinancieroCliente
// existente — nunca toca monto/fecha/proyecto/referencia del pago. El otro
// camino que la escribe (editar el cobro desde Control de Obra,
// actualizarDecoracionIngresoParcial) y vincularFacturaAIngreso ya eran
// parciales y no cambian.
export async function guardarDecoracionIngreso(
  usuario: UsuarioSesion,
  movimientoFinancieroClienteId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const datos = DatosDecoracionIngresoSchema.parse(vaciosANull(datosCrudos, CAMPOS_DECORACION_INGRESO));
  const enviados = camposEnviados(datos, CAMPOS_DECORACION_INGRESO) as Partial<ValoresDecoracionIngreso>;

  return db.$transaction(async (tx) => {
    // Serializa las decoraciones del mismo cobro (lectura → validación → escritura).
    await tx.$queryRaw`SELECT id FROM movimientos_financieros_cliente WHERE id = ${movimientoFinancieroClienteId} FOR UPDATE`;
    const movimiento = await tx.movimientoFinancieroCliente.findFirst({
      where: { id: movimientoFinancieroClienteId, empresaId },
      select: { id: true, estimacionClienteCapa: { select: { capa: true } } },
    });
    if (!movimiento || !cobroVisiblePara(usuario, movimiento.estimacionClienteCapa?.capa)) {
      throw new RegistroNoEncontradoError("El pago de cliente");
    }
    await validarReferenciasIngreso(empresaId, { cuentaReceptoraId: enviados.cuentaReceptoraId, facturaId: enviados.facturaId }, tx);

    const anterior = await tx.ingreso.findUnique({ where: { movimientoFinancieroClienteId } });
    const actuales: ValoresDecoracionIngreso = {
      clienteNombre: anterior?.clienteNombre ?? null,
      metodoIngreso: anterior?.metodoIngreso ?? null,
      cuentaReceptoraId: anterior?.cuentaReceptoraId ?? null,
      comprobanteRef: anterior?.comprobanteRef ?? null,
      comprobanteNombre: anterior?.comprobanteNombre ?? null,
      facturaId: anterior?.facturaId ?? null,
      facturaEsperada: anterior?.facturaEsperada ?? false,
      comentarios: anterior?.comentarios ?? null,
    };
    const finales: ValoresDecoracionIngreso = { ...actuales, ...enviados };
    const cambios = CAMPOS_DECORACION_INGRESO.filter((campo) => !mismoValor(finales[campo], actuales[campo]));
    const elegir = (valores: ValoresDecoracionIngreso) => Object.fromEntries(cambios.map((campo) => [campo, valores[campo]]));

    let ingreso;
    if (!anterior) {
      ingreso = await tx.ingreso.create({
        data: { empresaId, movimientoFinancieroClienteId, registradoPorId: usuario.id, ...finales },
      });
    } else if (cambios.length > 0) {
      ingreso = await tx.ingreso.update({ where: { movimientoFinancieroClienteId }, data: elegir(finales) });
    } else {
      return anterior;
    }

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "Ingreso",
      entidadId: ingreso.id,
      accion: "EDITAR",
      valorAnterior: anterior ? paraAuditoria(elegir(actuales)) : undefined,
      valorNuevo: { movimientoFinancieroClienteId, ...paraAuditoria(elegir(finales)) },
    });

    return ingreso;
  });
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
  // Eje 4 — null/ausente = reconocido, todavía por cobrar (Contabilidad —
  // reconocimiento, septiembre 2026). No se asume que un ingreso manual ya
  // significa dinero movido.
  fechaCobro: z.coerce.date().optional().nullable(),
  // Clasificación exclusiva — obligatoria, mismo invariante que
  // Egreso.clasificacionManual (una operación reconocida → una sola línea).
  clasificacionManual: z.enum(CLASIFICACIONES_INGRESO_MANUAL, {
    error: "Selecciona a qué línea del Estado de Resultados pertenece este ingreso.",
  }),
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
      fechaCobro: datos.fechaCobro || null,
      clasificacionManual: datos.clasificacionManual,
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

// Edición de un ingreso manual — mismo contrato PARCIAL que la decoración
// (ver arriba). Fecha, concepto, monto y clasificación siguen siendo
// obligatorios: si se envían deben ser válidos, y nunca se pueden vaciar.
const DatosEdicionIngresoManualSchema = z.object({
  fecha: z.coerce.date().optional(),
  concepto: z.string().trim().min(1, "El concepto es obligatorio.").optional(),
  monto: z.coerce.number().positive("El monto debe ser mayor a cero.").optional(),
  proyectoId: z.string().trim().optional().nullable(),
  clienteNombre: z.string().trim().optional().nullable(),
  metodoIngreso: z.enum(METODOS_INGRESO).optional().nullable(),
  cuentaReceptoraId: z.string().trim().optional().nullable(),
  referencia: z.string().trim().optional().nullable(),
  comprobanteRef: z.string().trim().optional().nullable(),
  comprobanteNombre: z.string().trim().optional().nullable(),
  facturaId: z.string().trim().optional().nullable(),
  facturaEsperada: z.boolean().optional(),
  comentarios: z.string().trim().optional().nullable(),
  // null explícito = vuelve a "por cobrar"; omitido = conserva la fecha de
  // cobro histórica exacta.
  fechaCobro: z.coerce.date().optional().nullable(),
  clasificacionManual: z.enum(CLASIFICACIONES_INGRESO_MANUAL).optional(),
});

const OBLIGATORIOS_INGRESO_MANUAL = {
  fecha: "La fecha es obligatoria.",
  concepto: "El concepto es obligatorio.",
  monto: "El monto es obligatorio.",
  clasificacionManual: "Selecciona a qué línea del Estado de Resultados pertenece este ingreso.",
} as const;

const CAMPOS_INGRESO_MANUAL = [
  "fecha",
  "concepto",
  "monto",
  "proyectoId",
  "clienteNombre",
  "metodoIngreso",
  "cuentaReceptoraId",
  "referencia",
  "comprobanteRef",
  "comprobanteNombre",
  "facturaId",
  "facturaEsperada",
  "comentarios",
  "fechaCobro",
  "clasificacionManual",
] as const;

type ValoresIngresoManual = {
  fecha: Date | null;
  concepto: string | null;
  monto: number | null;
  proyectoId: string | null;
  clienteNombre: string | null;
  metodoIngreso: (typeof METODOS_INGRESO)[number] | null;
  cuentaReceptoraId: string | null;
  referencia: string | null;
  comprobanteRef: string | null;
  comprobanteNombre: string | null;
  facturaId: string | null;
  facturaEsperada: boolean;
  comentarios: string | null;
  fechaCobro: Date | null;
  clasificacionManual: string | null;
};

export async function editarIngresoManual(usuario: UsuarioSesion, id: string, datosCrudos: unknown) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const crudo = vaciosANull(datosCrudos, CAMPOS_INGRESO_MANUAL);
  for (const [campo, mensaje] of Object.entries(OBLIGATORIOS_INGRESO_MANUAL)) {
    if (crudo[campo] === null) throw new ValidacionError(mensaje);
  }
  const datos = DatosEdicionIngresoManualSchema.parse(crudo);
  const enviados = camposEnviados(datos, CAMPOS_INGRESO_MANUAL) as Partial<ValoresIngresoManual>;

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ingresos WHERE id = ${id} FOR UPDATE`;
    const anterior = await tx.ingreso.findFirst({ where: { id, empresaId } });
    if (!anterior) throw new RegistroNoEncontradoError("El ingreso");
    if (anterior.movimientoFinancieroClienteId) {
      throw new ValidacionError(
        "Este ingreso proviene de un pago de cliente ya trackeado — sus datos operativos se editan desde Cliente."
      );
    }
    await validarReferenciasIngreso(
      empresaId,
      { proyectoId: enviados.proyectoId, cuentaReceptoraId: enviados.cuentaReceptoraId, facturaId: enviados.facturaId },
      tx
    );

    const actuales: ValoresIngresoManual = {
      fecha: anterior.fecha,
      concepto: anterior.concepto,
      monto: anterior.monto === null ? null : Number(anterior.monto),
      proyectoId: anterior.proyectoId,
      clienteNombre: anterior.clienteNombre,
      metodoIngreso: anterior.metodoIngreso,
      cuentaReceptoraId: anterior.cuentaReceptoraId,
      referencia: anterior.referencia,
      comprobanteRef: anterior.comprobanteRef,
      comprobanteNombre: anterior.comprobanteNombre,
      facturaId: anterior.facturaId,
      facturaEsperada: anterior.facturaEsperada,
      comentarios: anterior.comentarios,
      fechaCobro: anterior.fechaCobro,
      clasificacionManual: anterior.clasificacionManual,
    };
    const finales: ValoresIngresoManual = { ...actuales, ...enviados };
    const cambios = CAMPOS_INGRESO_MANUAL.filter((campo) => !mismoValor(finales[campo], actuales[campo]));
    if (cambios.length === 0) return anterior;
    const elegir = (valores: ValoresIngresoManual) => Object.fromEntries(cambios.map((campo) => [campo, valores[campo]]));

    const ingreso = await tx.ingreso.update({ where: { id }, data: elegir(finales) });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "Ingreso",
      entidadId: ingreso.id,
      accion: "EDITAR",
      valorAnterior: paraAuditoria(elegir(actuales)),
      valorNuevo: paraAuditoria(elegir(finales)),
    });

    return ingreso;
  });
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
