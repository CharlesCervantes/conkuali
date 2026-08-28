"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server/auth/dal";
import {
  crearProveedor,
  editarProveedor,
  crearContratista,
  editarContratista,
  crearPersonalAdministrativo,
  editarPersonalAdministrativo,
  cambiarEstatusBeneficiario,
  eliminarBeneficiario,
} from "@/lib/server/catalogos";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

function mensajeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos.";
  }
  if (
    error instanceof SinPermisoError ||
    error instanceof ValidacionError ||
    error instanceof RegistroNoEncontradoError
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

export type CatalogoFormState = { error?: string; guardado?: boolean } | undefined;

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

function datosProveedorDesdeFormData(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    giro: opcional(formData.get("giro")),
    vendedor: opcional(formData.get("vendedor")),
    telefono: opcional(formData.get("telefono")),
    credito: opcional(formData.get("credito")),
    cuentaBancaria: opcional(formData.get("cuentaBancaria")),
    rfc: opcional(formData.get("rfc")),
    mismaPersonaQueId: opcional(formData.get("mismaPersonaQueId")),
  };
}

export async function crearProveedorAction(
  _state: CatalogoFormState,
  formData: FormData
): Promise<CatalogoFormState> {
  const usuario = await requireSession();
  try {
    await crearProveedor(usuario, datosProveedorDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/catalogos/proveedores");
  return { guardado: true };
}

export async function editarProveedorAction(
  beneficiarioId: string,
  _state: CatalogoFormState,
  formData: FormData
): Promise<CatalogoFormState> {
  const usuario = await requireSession();
  try {
    await editarProveedor(usuario, beneficiarioId, datosProveedorDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/catalogos/proveedores");
  return { guardado: true };
}

// ---------------------------------------------------------------------------
// Contratistas
// ---------------------------------------------------------------------------

export async function crearContratistaAction(
  _state: CatalogoFormState,
  formData: FormData
): Promise<CatalogoFormState> {
  const usuario = await requireSession();
  try {
    await crearContratista(usuario, {
      nombre: formData.get("nombre"),
      descripcion: opcional(formData.get("descripcion")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/catalogos/contratistas");
  return { guardado: true };
}

export async function editarContratistaAction(
  beneficiarioId: string,
  _state: CatalogoFormState,
  formData: FormData
): Promise<CatalogoFormState> {
  const usuario = await requireSession();
  try {
    await editarContratista(usuario, beneficiarioId, {
      nombre: formData.get("nombre"),
      descripcion: opcional(formData.get("descripcion")),
      mismaPersonaQueId: opcional(formData.get("mismaPersonaQueId")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/catalogos/contratistas");
  return { guardado: true };
}

// ---------------------------------------------------------------------------
// Personal / Administración
// ---------------------------------------------------------------------------

function datosPersonalDesdeFormData(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    nss: opcional(formData.get("nss")),
    fechaNacimiento: opcional(formData.get("fechaNacimiento")),
    mismaPersonaQueId: opcional(formData.get("mismaPersonaQueId")),
  };
}

// El formulario de Personal/Administración guarda identidad y vínculo de
// Usuario en un solo envío — una sola transacción server-side (ver
// crearPersonalAdministrativo/editarPersonalAdministrativo en
// lib/server/catalogos.ts): si el vínculo falla, la identidad tampoco queda
// creada/editada a medias (corrección de integridad, auditoría de
// rendimiento, agosto 2026 — antes eran dos escrituras separadas).
export async function crearPersonalAction(
  _state: CatalogoFormState,
  formData: FormData
): Promise<CatalogoFormState> {
  const usuario = await requireSession();
  try {
    const usuarioVinculadoId = opcional(formData.get("usuarioVinculadoId"));
    await crearPersonalAdministrativo(usuario, datosPersonalDesdeFormData(formData), usuarioVinculadoId);
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/catalogos/personal");
  return { guardado: true };
}

export async function editarPersonalAction(
  beneficiarioId: string,
  _state: CatalogoFormState,
  formData: FormData
): Promise<CatalogoFormState> {
  const usuario = await requireSession();
  try {
    const usuarioVinculadoId = opcional(formData.get("usuarioVinculadoId"));
    await editarPersonalAdministrativo(usuario, beneficiarioId, datosPersonalDesdeFormData(formData), usuarioVinculadoId);
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/catalogos/personal");
  return { guardado: true };
}

// ---------------------------------------------------------------------------
// Activar / desactivar — común a los tres catálogos.
// ---------------------------------------------------------------------------

export async function cambiarEstatusBeneficiarioAction(
  ruta: "proveedores" | "contratistas" | "personal",
  beneficiarioId: string,
  activo: boolean
) {
  const usuario = await requireSession();
  await cambiarEstatusBeneficiario(usuario, beneficiarioId, activo);
  revalidatePath(`/catalogos/${ruta}`);
}

// ---------------------------------------------------------------------------
// Eliminar definitivamente — solo cuando el Beneficiario no tiene ningún
// historial de negocio (eliminarBeneficiario ya lo re-verifica siempre,
// nunca confía en lo que la UI mostró).
// ---------------------------------------------------------------------------

export type EliminarBeneficiarioFormState = { error?: string; eliminado?: boolean } | undefined;

export async function eliminarBeneficiarioAction(
  ruta: "proveedores" | "contratistas" | "personal",
  beneficiarioId: string,
  _state: EliminarBeneficiarioFormState,
  _formData: FormData
): Promise<EliminarBeneficiarioFormState> {
  const usuario = await requireSession();
  try {
    await eliminarBeneficiario(usuario, beneficiarioId);
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/catalogos/${ruta}`);
  return { eliminado: true };
}
