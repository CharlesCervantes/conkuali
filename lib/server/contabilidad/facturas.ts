import "server-only";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeVerContabilidad, puedeCargarFacturaCFDI } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";
import { registrarFacturaGasto } from "@/lib/server/control-de-obra/gastos";
import { parsearCfdi } from "./cfdi";

// El XML es SIEMPRE la fuente fiscal principal — se parsea y valida ANTES de
// guardar nada; el PDF es solo la representación adjunta (Contabilidad,
// septiembre 2026).

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

export type FilaFactura = {
  id: string;
  direccion: "EMITIDA" | "RECIBIDA";
  uuid: string;
  rfcEmisor: string;
  razonSocialEmisor: string;
  rfcReceptor: string;
  fechaEmision: string;
  total: number;
  moneda: string;
  estatus: "VIGENTE" | "CANCELADO";
  pdfRef: string | null;
  xmlRef: string;
  vinculadaAEgresos: number;
  vinculadaAIngresos: number;
  createdAt: string;
}

// Sube y parsea un CFDI — el llamador (Server Action) ya subió xmlRef/pdfRef
// vía subirArchivo() y leyó el contenido del XML como texto para pasarlo
// aquí. Lanza CfdiInvalidoError/CfdiNotaCreditoError (ver cfdi.ts) o
// ValidacionError si el UUID ya existe en esta Empresa.
export async function cargarFactura(
  usuario: UsuarioSesion,
  datos: {
    direccion: "EMITIDA" | "RECIBIDA";
    xmlContenido: string;
    xmlRef: string;
    xmlNombre: string;
    pdfRef: string | null;
    pdfNombre: string | null;
  }
) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeCargarFacturaCFDI(usuario)) throw new SinPermisoError();

  const cfdi = parsearCfdi(datos.xmlContenido);

  const existente = await db.factura.findUnique({
    where: { empresaId_uuid: { empresaId, uuid: cfdi.uuid } },
  });
  if (existente) {
    throw new ValidacionError("Ya existe una factura cargada con este UUID en esta Empresa.");
  }

  const factura = await db.factura.create({
    data: {
      empresaId,
      direccion: datos.direccion,
      xmlRef: datos.xmlRef,
      xmlNombre: datos.xmlNombre,
      pdfRef: datos.pdfRef,
      pdfNombre: datos.pdfNombre,
      uuid: cfdi.uuid,
      rfcEmisor: cfdi.rfcEmisor,
      razonSocialEmisor: cfdi.razonSocialEmisor,
      rfcReceptor: cfdi.rfcReceptor,
      razonSocialReceptor: cfdi.razonSocialReceptor,
      fechaEmision: cfdi.fechaEmision,
      subtotal: cfdi.subtotal,
      totalImpuestos: cfdi.totalImpuestos,
      total: cfdi.total,
      moneda: cfdi.moneda,
      metodoPago: cfdi.metodoPago,
      formaPago: cfdi.formaPago,
      serie: cfdi.serie,
      folio: cfdi.folio,
      subidoPorId: usuario.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Factura",
    entidadId: factura.id,
    accion: "CREAR",
    valorNuevo: { direccion: factura.direccion, uuid: factura.uuid, total: cfdi.total },
  });

  return factura;
}

export async function listarFacturas(usuario: UsuarioSesion): Promise<FilaFactura[]> {
  const empresaId = requerirContabilidad(usuario);
  const facturas = await db.factura.findMany({
    where: { empresaId },
    include: { _count: { select: { egresos: true, ingresos: true } } },
    orderBy: { createdAt: "desc" },
  });
  return facturas.map((f) => ({
    id: f.id,
    direccion: f.direccion,
    uuid: f.uuid,
    rfcEmisor: f.rfcEmisor,
    razonSocialEmisor: f.razonSocialEmisor,
    rfcReceptor: f.rfcReceptor,
    fechaEmision: f.fechaEmision.toISOString(),
    total: Number(f.total),
    moneda: f.moneda,
    estatus: f.estatus,
    pdfRef: f.pdfRef,
    xmlRef: f.xmlRef,
    vinculadaAEgresos: f._count.egresos,
    vinculadaAIngresos: f._count.ingresos,
    createdAt: f.createdAt.toISOString(),
  }));
}

export type ResultadoVinculacion = { diferenciaMonto: number; coincide: boolean };

// Vincula una Factura (RECIBIDA) a un Gasto/Egreso — "1 factura : N gastos"
// soportado (Factura.facturaId no es único en Egreso), "1 gasto : N
// facturas" queda para V2. Refleja "ya tiene factura" en GastoObra
// reutilizando registrarFacturaGasto (ya existente), nunca un campo
// paralelo. La comparación de monto es SIEMPRE informativa — nunca bloquea
// la vinculación (diferencias legítimas existen: redondeo, retenciones).
export async function vincularFacturaAGasto(
  usuario: UsuarioSesion,
  facturaId: string,
  gastoObraId: string
): Promise<ResultadoVinculacion> {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeCargarFacturaCFDI(usuario)) throw new SinPermisoError();

  const [factura, gasto] = await Promise.all([
    db.factura.findFirst({ where: { id: facturaId, empresaId } }),
    db.gastoObra.findFirst({ where: { id: gastoObraId, empresaId } }),
  ]);
  if (!factura) throw new RegistroNoEncontradoError("La factura");
  if (!gasto) throw new RegistroNoEncontradoError("El gasto");
  if (factura.direccion !== "RECIBIDA") {
    throw new ValidacionError("Solo una factura RECIBIDA puede vincularse a un gasto.");
  }

  // Upsert quirúrgico — SOLO toca facturaId, nunca pisa medioFinancieroId/
  // notasContables que ya pudieran existir en la decoración de este gasto
  // (a diferencia de guardarDecoracionEgreso, pensada para el formulario
  // completo, no para esta vinculación puntual).
  await db.egreso.upsert({
    where: { gastoObraId },
    update: { facturaId },
    create: { empresaId, gastoObraId, facturaId, registradoPorId: usuario.id },
  });

  if (!gasto.facturaRef) {
    await registrarFacturaGasto(usuario, gastoObraId, {
      facturaRef: factura.pdfRef ?? factura.xmlRef,
      facturaNombre: factura.pdfNombre ?? factura.xmlNombre,
    });
  }

  const diferenciaMonto = Math.abs(Number(gasto.monto) - Number(factura.total));
  return { diferenciaMonto, coincide: diferenciaMonto < 0.01 };
}

// Vincula una Factura (EMITIDA) a un Ingreso/pago de cliente.
export async function vincularFacturaAIngreso(
  usuario: UsuarioSesion,
  facturaId: string,
  movimientoFinancieroClienteId: string
): Promise<ResultadoVinculacion> {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeCargarFacturaCFDI(usuario)) throw new SinPermisoError();

  const [factura, movimiento] = await Promise.all([
    db.factura.findFirst({ where: { id: facturaId, empresaId } }),
    db.movimientoFinancieroCliente.findFirst({ where: { id: movimientoFinancieroClienteId, empresaId } }),
  ]);
  if (!factura) throw new RegistroNoEncontradoError("La factura");
  if (!movimiento) throw new RegistroNoEncontradoError("El pago de cliente");
  if (movimiento.estatus === "CANCELADO") {
    throw new ValidacionError("Este pago está cancelado — no se puede vincular una factura a él.");
  }
  if (factura.direccion !== "EMITIDA") {
    throw new ValidacionError("Solo una factura EMITIDA puede vincularse a un ingreso.");
  }

  // Mismo upsert quirúrgico que vincularFacturaAGasto — solo facturaId.
  await db.ingreso.upsert({
    where: { movimientoFinancieroClienteId },
    update: { facturaId },
    create: { empresaId, movimientoFinancieroClienteId, facturaId, registradoPorId: usuario.id },
  });

  const diferenciaMonto = Math.abs(Number(movimiento.monto) - Number(factura.total));
  return { diferenciaMonto, coincide: diferenciaMonto < 0.01 };
}

// ---------------------------------------------------------------------------
// CFDI con diferencia de monto — para Inicio/Dashboard (alertas, Rediseño de
// Inicio, septiembre 2026). La diferencia NUNCA se persiste (se calculó una
// vez al vincular y se devolvió, nunca se guardó) — aquí se recalcula en
// vivo, barato porque el universo de facturas vinculadas es pequeño.
// ---------------------------------------------------------------------------

export type FacturaConDiferencia = {
  facturaId: string;
  razonSocial: string;
  totalFactura: number;
  totalRegistro: number;
  diferencia: number;
  origen: "EGRESO" | "INGRESO";
};

export async function obtenerFacturasConDiferencia(usuario: UsuarioSesion): Promise<FacturaConDiferencia[]> {
  const empresaId = requerirContabilidad(usuario);

  const [egresosVinculados, ingresosVinculados] = await Promise.all([
    db.egreso.findMany({
      where: { empresaId, gastoObraId: { not: null }, facturaId: { not: null }, estatus: "VIGENTE" },
      select: {
        gastoObra: { select: { monto: true } },
        factura: { select: { id: true, razonSocialEmisor: true, total: true } },
      },
    }),
    db.ingreso.findMany({
      where: {
        empresaId,
        movimientoFinancieroClienteId: { not: null },
        facturaId: { not: null },
        estatus: "VIGENTE",
        movimientoFinancieroCliente: { estatus: "VIGENTE" },
      },
      select: {
        movimientoFinancieroCliente: { select: { monto: true } },
        factura: { select: { id: true, razonSocialEmisor: true, total: true } },
      },
    }),
  ]);

  const filas: FacturaConDiferencia[] = [];
  for (const e of egresosVinculados) {
    if (!e.gastoObra || !e.factura) continue;
    const totalRegistro = Number(e.gastoObra.monto);
    const diferencia = Math.abs(totalRegistro - Number(e.factura.total));
    if (diferencia >= 0.01) {
      filas.push({
        facturaId: e.factura.id,
        razonSocial: e.factura.razonSocialEmisor,
        totalFactura: Number(e.factura.total),
        totalRegistro,
        diferencia,
        origen: "EGRESO",
      });
    }
  }
  for (const i of ingresosVinculados) {
    if (!i.movimientoFinancieroCliente || !i.factura) continue;
    const totalRegistro = Number(i.movimientoFinancieroCliente.monto);
    const diferencia = Math.abs(totalRegistro - Number(i.factura.total));
    if (diferencia >= 0.01) {
      filas.push({
        facturaId: i.factura.id,
        razonSocial: i.factura.razonSocialEmisor,
        totalFactura: Number(i.factura.total),
        totalRegistro,
        diferencia,
        origen: "INGRESO",
      });
    }
  }
  return filas;
}
