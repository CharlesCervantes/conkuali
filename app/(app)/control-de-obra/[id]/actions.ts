"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireSession } from "@/lib/server/auth/dal";
import {
  crearPartida,
  crearConcepto,
  crearContratoContratista,
  asignarConcepto,
  RegistroNoEncontradoError,
} from "@/lib/server/control-de-obra/estructura-contractual";
import {
  SinPermisoError,
  ProyectoNoEncontradoError,
  ValidacionError,
} from "@/lib/server/control-de-obra/proyectos";

export type FormState = { error?: string } | undefined;

function mensajeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos.";
  }
  if (
    error instanceof SinPermisoError ||
    error instanceof ProyectoNoEncontradoError ||
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

export async function crearPartidaAction(
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await crearPartida(usuario, proyectoId, {
      nombre: formData.get("nombre"),
      orden: formData.get("orden") || 0,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/estructura`);
  return undefined;
}

export async function crearConceptoAction(
  partidaId: string,
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await crearConcepto(usuario, partidaId, {
      codigo: opcional(formData.get("codigo")),
      descripcion: formData.get("descripcion"),
      unidad: formData.get("unidad"),
      cantidadContratada: formData.get("cantidadContratada"),
      notas: opcional(formData.get("notas")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/estructura`);
  return undefined;
}

export async function crearContratoAction(
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await crearContratoContratista(usuario, proyectoId, {
      beneficiarioId: opcional(formData.get("beneficiarioId")),
      nombreNuevoContratista: opcional(formData.get("nombreNuevoContratista")),
      numeroContrato: opcional(formData.get("numeroContrato")),
      descripcion: opcional(formData.get("descripcion")),
      fecha: opcional(formData.get("fecha")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/estructura`);
  return undefined;
}

export async function asignarConceptoAction(
  contratoId: string,
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await asignarConcepto(usuario, contratoId, {
      conceptoId: formData.get("conceptoId"),
      cantidad: formData.get("cantidad"),
      precioUnitarioContratista: formData.get("precioUnitarioContratista"),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/estructura`);
  return undefined;
}
