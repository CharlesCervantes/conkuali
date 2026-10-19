import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import type { Prisma } from "@/lib/generated/prisma/client";
import { crearGasto } from "@/lib/server/control-de-obra/gastos";
import { crearEgresoManual, guardarDecoracionEgreso } from "../egresos";
import { crearProveedor } from "@/lib/server/catalogos";
import { puedeVerContabilidad, puedeRegistrarMovimientoContable, puedeAdministrarCatalogos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";
import { CLASIFICACIONES_EGRESO_MANUAL } from "../estado-resultados";
import { requerirCapturaInteligente } from "./habilitacion";

// Orquestador PURO — ninguna regla de negocio nueva aquí. Reutiliza
// exactamente las funciones que ya existían antes de esta funcionalidad;
// nunca registra una operación sin que un humano la haya confirmado (Carga
// inteligente de documentos, V1 — octubre 2026).

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

async function documentoPropio(empresaId: string, documentoEgresoId: string, cliente: Prisma.TransactionClient = db) {
  const documento = await cliente.documentoEgreso.findFirst({ where: { id: documentoEgresoId, empresaId } });
  if (!documento) throw new RegistroNoEncontradoError("El documento");
  return documento;
}

async function marcarDocumentoConfirmado(
  args: {
    documentoEgresoId: string;
    egresoId: string;
    estatus: "VINCULADO" | "CONVERTIDO";
    valoresFinalesUsuario: unknown;
    usuarioId: string;
  },
  cliente: Prisma.TransactionClient = db
) {
  await cliente.documentoEgreso.update({
    where: { id: args.documentoEgresoId },
    data: {
      egresoId: args.egresoId,
      estatus: args.estatus,
      valoresFinalesUsuario: args.valoresFinalesUsuario as object,
      confirmadoPorId: args.usuarioId,
      confirmadoEn: new Date(),
    },
  });
}

const DatosConfirmarGastoNuevoSchema = z.object({
  proyectoId: z.string().trim().min(1),
  semanaId: z.string().trim().min(1),
  fecha: z.coerce.date(),
  categoria: z.string().trim().min(1),
  monto: z.coerce.number().positive(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA_DEBITO", "TARJETA_CREDITO"]),
  proveedorBeneficiarioId: z.string().trim().optional().nullable(),
  comentario: z.string().trim().optional().nullable(),
  requiereFactura: z.coerce.boolean().default(false),
});

// Camino 1 — "Crear como nueva operación": el documento da origen a un
// GastoObra real (reutiliza crearGasto tal cual), y el documento queda
// ligado a la decoración Egreso de ese gasto (se crea vacía si no existía).
export async function confirmarComoGastoNuevo(
  usuario: UsuarioSesion,
  documentoEgresoId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  await requerirCapturaInteligente(empresaId);
  const documento = await documentoPropio(empresaId, documentoEgresoId);
  const datos = DatosConfirmarGastoNuevoSchema.parse(datosCrudos);

  const gasto = await crearGasto(usuario, datos.proyectoId, datos.semanaId, {
    fecha: datos.fecha,
    categoria: datos.categoria,
    monto: datos.monto,
    metodoPago: datos.metodoPago,
    quienPagoModo: "EMPRESA",
    proveedorBeneficiarioId: datos.proveedorBeneficiarioId || null,
    comentario: datos.comentario || null,
    requiereFactura: datos.requiereFactura,
  });

  // El nuevo gasto todavía no tiene Egreso — se crea la decoración vacía
  // (relación canónica única: DocumentoEgreso siempre cuelga de Egreso,
  // nunca de GastoObra directo).
  const egreso = await guardarDecoracionEgreso(usuario, gasto.id, {});

  await marcarDocumentoConfirmado({
    documentoEgresoId,
    egresoId: egreso.id,
    estatus: "CONVERTIDO",
    valoresFinalesUsuario: datos,
    usuarioId: usuario.id,
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "DocumentoEgreso",
    entidadId: documentoEgresoId,
    accion: "CONFIRMAR",
    valorAnterior: { propuestaReconciliada: documento.propuestaReconciliada },
    valorNuevo: { estatus: "CONVERTIDO", gastoObraId: gasto.id, egresoId: egreso.id, datosConfirmados: datos },
  });

  return { gastoObraId: gasto.id, egresoId: egreso.id };
}

const DatosVincularExistenteSchema = z.object({
  gastoObraId: z.string().trim().min(1),
  fechaPago: z.coerce.date().optional().nullable(),
  referenciaPago: z.string().trim().optional().nullable(),
  medioFinancieroId: z.string().trim().optional().nullable(),
});

// Camino 2 — "Vincular a operación existente": el documento completa el
// pago de un GastoObra ya capturado — nunca crea un segundo gasto.
//
// Atómico (octubre 2026): decoración del Egreso + marca del documento +
// auditoría en UNA transacción — si cualquiera falla, nada queda escrito.
// Solo se envían los datos de pago que la vinculación trae: factura, notas
// y datos de pago no incluidos se conservan (contrato parcial de
// guardarDecoracionEgreso), y la regla R1 se aplica igual que en el
// formulario. Repetir la vinculación del mismo documento al mismo gasto no
// vuelve a escribir nada; vincularlo a otra operación se rechaza.
export async function confirmarVinculadoAExistente(
  usuario: UsuarioSesion,
  documentoEgresoId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  await requerirCapturaInteligente(empresaId);
  const datos = DatosVincularExistenteSchema.parse(datosCrudos);

  const decoracion: Record<string, unknown> = {};
  for (const campo of ["fechaPago", "referenciaPago", "medioFinancieroId"] as const) {
    if (datos[campo] !== undefined) decoracion[campo] = datos[campo];
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM documentos_egreso WHERE id = ${documentoEgresoId} FOR UPDATE`;
    const documento = await documentoPropio(empresaId, documentoEgresoId, tx);

    const gasto = await tx.gastoObra.findFirst({ where: { id: datos.gastoObraId, empresaId } });
    if (!gasto) throw new RegistroNoEncontradoError("El gasto");

    if (documento.estatus === "VINCULADO" || documento.estatus === "CONVERTIDO") {
      const egresoDelGasto = await tx.egreso.findUnique({ where: { gastoObraId: datos.gastoObraId }, select: { id: true } });
      if (documento.estatus === "VINCULADO" && egresoDelGasto && documento.egresoId === egresoDelGasto.id) {
        return { gastoObraId: datos.gastoObraId, egresoId: egresoDelGasto.id };
      }
      throw new ValidacionError("Este documento ya fue confirmado con otra operación.");
    }

    const egreso = await guardarDecoracionEgreso(usuario, datos.gastoObraId, decoracion, { tx });

    await marcarDocumentoConfirmado(
      {
        documentoEgresoId,
        egresoId: egreso.id,
        estatus: "VINCULADO",
        valoresFinalesUsuario: datos,
        usuarioId: usuario.id,
      },
      tx
    );

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "DocumentoEgreso",
      entidadId: documentoEgresoId,
      accion: "CONFIRMAR",
      valorAnterior: { propuestaReconciliada: documento.propuestaReconciliada },
      valorNuevo: { estatus: "VINCULADO", gastoObraId: datos.gastoObraId, egresoId: egreso.id, datosConfirmados: datos },
    });

    return { gastoObraId: datos.gastoObraId, egresoId: egreso.id };
  });
}

const DatosConfirmarEgresoManualSchema = z.object({
  fecha: z.coerce.date(),
  concepto: z.string().trim().min(1),
  monto: z.coerce.number().positive(),
  proyectoId: z.string().trim().optional().nullable(),
  clasificacionManual: z.enum(CLASIFICACIONES_EGRESO_MANUAL),
  fechaPago: z.coerce.date().optional().nullable(),
  referenciaPago: z.string().trim().optional().nullable(),
  medioFinancieroId: z.string().trim().optional().nullable(),
});

// Camino 3 — sin operación de obra detrás (ej. un gasto administrativo
// capturado directo desde el documento): Egreso manual, reutilizado tal
// cual.
export async function confirmarComoEgresoManual(
  usuario: UsuarioSesion,
  documentoEgresoId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirContabilidad(usuario);
  await requerirCapturaInteligente(empresaId);
  const documento = await documentoPropio(empresaId, documentoEgresoId);
  const datos = DatosConfirmarEgresoManualSchema.parse(datosCrudos);

  const egreso = await crearEgresoManual(usuario, datos);

  await marcarDocumentoConfirmado({
    documentoEgresoId,
    egresoId: egreso.id,
    estatus: "CONVERTIDO",
    valoresFinalesUsuario: datos,
    usuarioId: usuario.id,
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "DocumentoEgreso",
    entidadId: documentoEgresoId,
    accion: "CONFIRMAR",
    valorAnterior: { propuestaReconciliada: documento.propuestaReconciliada },
    valorNuevo: { estatus: "CONVERTIDO", egresoId: egreso.id, datosConfirmados: datos },
  });

  return { egresoId: egreso.id };
}

const DatosCrearProveedorDesdeDocumentoSchema = z.object({
  nombre: z.string().trim().min(1),
  rfc: z.string().trim().optional().nullable(),
  clabe: z.string().trim().optional().nullable(),
});

// El usuario confirma explícitamente crear un Proveedor nuevo a partir de
// lo que la propuesta detectó — nunca ocurre solo porque el documento lo
// sugirió.
export async function crearProveedorDesdeDocumento(usuario: UsuarioSesion, datosCrudos: unknown) {
  if (!puedeAdministrarCatalogos(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  await requerirCapturaInteligente(usuario.empresa.id);
  const datos = DatosCrearProveedorDesdeDocumentoSchema.parse(datosCrudos);
  return crearProveedor(usuario, { nombre: datos.nombre, rfc: datos.rfc || null, clabe: datos.clabe || null });
}

export async function descartarDocumentoEgreso(usuario: UsuarioSesion, documentoEgresoId: string) {
  const empresaId = requerirContabilidad(usuario);
  await requerirCapturaInteligente(empresaId);
  const documento = await documentoPropio(empresaId, documentoEgresoId);
  await db.documentoEgreso.update({ where: { id: documentoEgresoId }, data: { estatus: "DESCARTADO" } });
  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "DocumentoEgreso",
    entidadId: documentoEgresoId,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: documento.estatus },
    valorNuevo: { estatus: "DESCARTADO" },
  });
}
