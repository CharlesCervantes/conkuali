"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireSession } from "@/lib/server/auth/dal";
import {
  crearProyecto,
  editarProyecto,
  cambiarEstatusProyecto,
  SinPermisoError,
  ProyectoNoEncontradoError,
} from "@/lib/server/control-de-obra/proyectos";

export type FormState = { error?: string } | undefined;

function mensajeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos.";
  }
  if (error instanceof SinPermisoError || error instanceof ProyectoNoEncontradoError) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}

function opcional(valor: FormDataEntryValue | null): string | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto.length > 0 ? texto : null;
}

function datosDesdeFormData(formData: FormData) {
  return {
    nombre: formData.get("nombre"),
    tipo: formData.get("tipo") || "FORMAL",
    cliente: opcional(formData.get("cliente")),
    ubicacion: opcional(formData.get("ubicacion")),
    numeroContrato: opcional(formData.get("numeroContrato")),
    descripcion: opcional(formData.get("descripcion")),
    notas: opcional(formData.get("notas")),
    fechaInicio: opcional(formData.get("fechaInicio")),
    fechaEstimadaTermino: opcional(formData.get("fechaEstimadaTermino")),
    esquemaContractual: opcional(formData.get("esquemaContractual")),
    porcentajeUtilidadDefault: opcional(formData.get("porcentajeUtilidadDefault")),
    porcentajeAdministracionDefault: opcional(
      formData.get("porcentajeAdministracionDefault")
    ),
  };
}

export async function crearProyectoAction(
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();

  try {
    await crearProyecto(usuario, datosDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }

  revalidatePath("/control-de-obra");
  redirect("/control-de-obra");
}

export async function editarProyectoAction(
  id: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  const confirmarEsquemaConDatos = formData.get("confirmarEsquemaConDatos") === "on";

  try {
    await editarProyecto(
      usuario,
      id,
      datosDesdeFormData(formData),
      confirmarEsquemaConDatos
    );
  } catch (error) {
    return { error: mensajeError(error) };
  }

  revalidatePath("/control-de-obra");
  redirect("/control-de-obra");
}

export async function cambiarEstatusAction(id: string, estatus: string) {
  const usuario = await requireSession();
  await cambiarEstatusProyecto(usuario, id, estatus);
  revalidatePath("/control-de-obra");
}
