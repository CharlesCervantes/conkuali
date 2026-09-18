"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireSession } from "@/lib/server/auth/dal";
import { subirArchivo } from "@/lib/server/archivos";
import {
  crearMedioFinanciero,
  editarMedioFinanciero,
  cambiarEstatusMedioFinanciero,
} from "@/lib/server/contabilidad/medios-financieros";
import {
  crearEgresoManual,
  editarEgresoManual,
  guardarDecoracionEgreso,
  cancelarEgreso,
} from "@/lib/server/contabilidad/egresos";
import {
  crearIngresoManual,
  editarIngresoManual,
  guardarDecoracionIngreso,
  cancelarIngreso,
} from "@/lib/server/contabilidad/ingresos";
import {
  cargarFactura,
  vincularFacturaAGasto,
  vincularFacturaAIngreso,
} from "@/lib/server/contabilidad/facturas";
import { CfdiInvalidoError, CfdiNotaCreditoError } from "@/lib/server/contabilidad/cfdi";
import { SinPermisoError, ValidacionError, ProyectoNoEncontradoError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

function mensajeError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Datos inválidos.";
  if (
    error instanceof SinPermisoError ||
    error instanceof ValidacionError ||
    error instanceof ProyectoNoEncontradoError ||
    error instanceof RegistroNoEncontradoError ||
    error instanceof CfdiInvalidoError ||
    error instanceof CfdiNotaCreditoError
  ) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}

function opcional(valor: FormDataEntryValue | null): string | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto.length > 0 ? texto : null;
}

function revalidarContabilidad() {
  revalidatePath("/contabilidad");
  revalidatePath("/contabilidad/ingresos");
  revalidatePath("/contabilidad/egresos");
  revalidatePath("/contabilidad/facturas");
  revalidatePath("/contabilidad/cuentas");
}

export type ContabilidadFormState = { error?: string; guardado?: boolean } | undefined;

// ---------------------------------------------------------------------------
// Medios financieros
// ---------------------------------------------------------------------------

export async function crearMedioFinancieroAction(
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    await crearMedioFinanciero(usuario, { nombre: formData.get("nombre"), tipo: formData.get("tipo") });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/contabilidad/cuentas");
  return { guardado: true };
}

export async function editarMedioFinancieroAction(
  id: string,
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    await editarMedioFinanciero(usuario, id, { nombre: formData.get("nombre"), tipo: formData.get("tipo") });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/contabilidad/cuentas");
  return { guardado: true };
}

export async function cambiarEstatusMedioFinancieroAction(id: string, activo: boolean) {
  const usuario = await requireSession();
  await cambiarEstatusMedioFinanciero(usuario, id, activo);
  revalidatePath("/contabilidad/cuentas");
}

// ---------------------------------------------------------------------------
// Egresos
// ---------------------------------------------------------------------------

function datosDecoracionEgresoDesdeFormData(formData: FormData) {
  return {
    medioFinancieroId: opcional(formData.get("medioFinancieroId")),
    facturaId: opcional(formData.get("facturaId")),
    notasContables: opcional(formData.get("notasContables")),
  };
}

export async function guardarDecoracionEgresoAction(
  gastoObraId: string,
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    await guardarDecoracionEgreso(usuario, gastoObraId, datosDecoracionEgresoDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/contabilidad/egresos");
  revalidatePath("/contabilidad");
  return { guardado: true };
}

function datosEgresoManualDesdeFormData(formData: FormData) {
  return {
    fecha: formData.get("fecha"),
    concepto: formData.get("concepto"),
    monto: formData.get("monto"),
    proyectoId: opcional(formData.get("proyectoId")),
    ...datosDecoracionEgresoDesdeFormData(formData),
  };
}

export async function crearEgresoManualAction(
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    await crearEgresoManual(usuario, datosEgresoManualDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidarContabilidad();
  return { guardado: true };
}

export async function editarEgresoManualAction(
  id: string,
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    await editarEgresoManual(usuario, id, datosEgresoManualDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidarContabilidad();
  return { guardado: true };
}

export async function cancelarEgresoAction(id: string) {
  const usuario = await requireSession();
  await cancelarEgreso(usuario, id);
  revalidarContabilidad();
}

// ---------------------------------------------------------------------------
// Ingresos
// ---------------------------------------------------------------------------

function datosDecoracionIngresoDesdeFormData(formData: FormData) {
  return {
    clienteNombre: opcional(formData.get("clienteNombre")),
    metodoIngreso: opcional(formData.get("metodoIngreso")),
    cuentaReceptoraId: opcional(formData.get("cuentaReceptoraId")),
    facturaId: opcional(formData.get("facturaId")),
    facturaEsperada: formData.get("facturaEsperada") === "on",
    comentarios: opcional(formData.get("comentarios")),
  };
}

// Ingreso manual sin origen — aquí sí tiene sentido su propia referencia
// (no hay ningún MovimientoFinancieroCliente del que leerla).
function datosIngresoManualDesdeFormData(formData: FormData) {
  return { ...datosDecoracionIngresoDesdeFormData(formData), referencia: opcional(formData.get("referencia")) };
}

export async function guardarDecoracionIngresoAction(
  movimientoFinancieroClienteId: string,
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    // undefined (no adjuntó archivo nuevo) = conservar el comprobante que ya
    // hubiera — nunca null, que borraría uno ya guardado (ver
    // guardarDecoracionIngreso, lib/server/contabilidad/ingresos.ts).
    let comprobanteRef: string | undefined;
    let comprobanteNombre: string | undefined;
    const archivo = formData.get("comprobante");
    if (archivo instanceof File && archivo.size > 0) {
      const subido = await subirArchivo("contabilidad/comprobantes", archivo);
      comprobanteRef = subido.ref;
      comprobanteNombre = subido.nombre;
    }
    await guardarDecoracionIngreso(usuario, movimientoFinancieroClienteId, {
      ...datosDecoracionIngresoDesdeFormData(formData),
      comprobanteRef,
      comprobanteNombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/contabilidad/ingresos");
  revalidatePath("/contabilidad");
  return { guardado: true };
}

export async function crearIngresoManualAction(
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    let comprobanteRef: string | null = null;
    let comprobanteNombre: string | null = null;
    const archivo = formData.get("comprobante");
    if (archivo instanceof File && archivo.size > 0) {
      const subido = await subirArchivo("contabilidad/comprobantes", archivo);
      comprobanteRef = subido.ref;
      comprobanteNombre = subido.nombre;
    }
    await crearIngresoManual(usuario, {
      fecha: formData.get("fecha"),
      concepto: formData.get("concepto"),
      monto: formData.get("monto"),
      proyectoId: opcional(formData.get("proyectoId")),
      ...datosIngresoManualDesdeFormData(formData),
      comprobanteRef,
      comprobanteNombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidarContabilidad();
  return { guardado: true };
}

export async function editarIngresoManualAction(
  id: string,
  _state: ContabilidadFormState,
  formData: FormData
): Promise<ContabilidadFormState> {
  const usuario = await requireSession();
  try {
    await editarIngresoManual(usuario, id, {
      fecha: formData.get("fecha"),
      concepto: formData.get("concepto"),
      monto: formData.get("monto"),
      proyectoId: opcional(formData.get("proyectoId")),
      ...datosIngresoManualDesdeFormData(formData),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidarContabilidad();
  return { guardado: true };
}

export async function cancelarIngresoAction(id: string) {
  const usuario = await requireSession();
  await cancelarIngreso(usuario, id);
  revalidarContabilidad();
}

// ---------------------------------------------------------------------------
// Facturas (CFDI)
// ---------------------------------------------------------------------------

export type CargarFacturaFormState = { error?: string; facturaId?: string } | undefined;

export async function cargarFacturaAction(
  _state: CargarFacturaFormState,
  formData: FormData
): Promise<CargarFacturaFormState> {
  const usuario = await requireSession();
  if (!usuario.empresa) return { error: "Tu cuenta no tiene una empresa asignada." };

  const direccionCruda = formData.get("direccion");
  const direccion = direccionCruda === "EMITIDA" ? "EMITIDA" : "RECIBIDA";

  const xml = formData.get("xml");
  if (!(xml instanceof File) || xml.size === 0) {
    return { error: "Selecciona el archivo XML del CFDI." };
  }
  const pdf = formData.get("pdf");

  try {
    const xmlContenido = await xml.text();
    const carpeta = `contabilidad/${usuario.empresa.id}/facturas`;
    const [subidoXml, subidoPdf] = await Promise.all([
      subirArchivo(carpeta, xml),
      pdf instanceof File && pdf.size > 0 ? subirArchivo(carpeta, pdf) : Promise.resolve(null),
    ]);

    const factura = await cargarFactura(usuario, {
      direccion,
      xmlContenido,
      xmlRef: subidoXml.ref,
      xmlNombre: subidoXml.nombre,
      pdfRef: subidoPdf?.ref ?? null,
      pdfNombre: subidoPdf?.nombre ?? null,
    });

    revalidatePath("/contabilidad/facturas");
    return { facturaId: factura.id };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export type VincularFacturaFormState = { error?: string; coincide?: boolean; diferenciaMonto?: number } | undefined;

export async function vincularFacturaAGastoAction(
  facturaId: string,
  gastoObraId: string
): Promise<VincularFacturaFormState> {
  const usuario = await requireSession();
  try {
    const resultado = await vincularFacturaAGasto(usuario, facturaId, gastoObraId);
    revalidarContabilidad();
    return resultado;
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export async function vincularFacturaAIngresoAction(
  facturaId: string,
  movimientoFinancieroClienteId: string
): Promise<VincularFacturaFormState> {
  const usuario = await requireSession();
  try {
    const resultado = await vincularFacturaAIngreso(usuario, facturaId, movimientoFinancieroClienteId);
    revalidarContabilidad();
    return resultado;
  } catch (error) {
    return { error: mensajeError(error) };
  }
}
