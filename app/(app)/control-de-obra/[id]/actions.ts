"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireSession } from "@/lib/server/auth/dal";
import {
  crearPartida,
  crearConcepto,
  crearContratoContratista,
  asignarConcepto,
  editarConceptoPrivado,
  RegistroNoEncontradoError,
} from "@/lib/server/control-de-obra/estructura-contractual";
import {
  guardarAvanceSemanal,
  cambiarEstatusAprobacionAvance,
} from "@/lib/server/control-de-obra/avance";
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
      icono: opcional(formData.get("icono")),
      color: opcional(formData.get("color")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/partidas`);
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
      descripcion: formData.get("descripcion"),
      unidad: formData.get("unidad"),
      cantidadContratada: formData.get("cantidadContratada"),
      notas: opcional(formData.get("notas")),
      precioUnitarioContratista: opcional(formData.get("precioUnitarioContratista")),
      precioUnitarioMateriales: opcional(formData.get("precioUnitarioMateriales")),
      precioUnitarioIndirectos: opcional(formData.get("precioUnitarioIndirectos")),
      precioUnitarioHerramienta: opcional(formData.get("precioUnitarioHerramienta")),
      porcentajeUtilidad: opcional(formData.get("porcentajeUtilidad")),
      porcentajeAdministracion: opcional(formData.get("porcentajeAdministracion")),
      precioUnitarioClienteOverride: opcional(formData.get("precioUnitarioClienteOverride")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/partidas`);
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
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
  return undefined;
}

export type AvanceFormState = { error?: string; guardados?: number } | undefined;

const PREFIJO_CANTIDAD = "cantidad_";

export async function guardarAvanceAction(
  proyectoId: string,
  semanaId: string,
  _state: AvanceFormState,
  formData: FormData
): Promise<AvanceFormState> {
  const usuario = await requireSession();

  const filas = [...formData.entries()]
    .filter(([nombre]) => nombre.startsWith(PREFIJO_CANTIDAD))
    .map(([nombre, valor]) => ({
      conceptoId: nombre.slice(PREFIJO_CANTIDAD.length),
      cantidadEjecutada: valor,
    }));

  let resultado;
  try {
    resultado = await guardarAvanceSemanal(usuario, proyectoId, { semanaId, filas });
  } catch (error) {
    return { error: mensajeError(error) };
  }

  revalidatePath(`/control-de-obra/${proyectoId}/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
  revalidatePath("/control-de-obra");
  return { guardados: resultado.guardados };
}

export async function cambiarEstatusAprobacionAvanceAction(
  proyectoId: string,
  conceptoId: string,
  semanaId: string,
  nuevoEstatus: "APROBADO" | "RECHAZADO"
) {
  const usuario = await requireSession();
  await cambiarEstatusAprobacionAvance(usuario, conceptoId, semanaId, nuevoEstatus);
  revalidatePath(`/control-de-obra/${proyectoId}/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
  revalidatePath("/control-de-obra");
}

// A diferencia de FormState (undefined en éxito), este estado sí distingue
// éxito de "todavía no se ha enviado" — con undefined en los dos casos,
// useActionState nunca detectaba que la acción había terminado bien (el
// formulario de edición se quedaba abierto, dando la impresión de que hacía
// falta guardar otra vez). Ver tabla-privada-editable.tsx / tabla-administracion-editable.tsx.
export type EditarConceptoPrivadoFormState = { error?: string; guardado?: boolean } | undefined;

export async function editarConceptoPrivadoAction(
  conceptoId: string,
  proyectoId: string,
  _state: EditarConceptoPrivadoFormState,
  formData: FormData
): Promise<EditarConceptoPrivadoFormState> {
  const usuario = await requireSession();
  try {
    await editarConceptoPrivado(usuario, conceptoId, {
      precioUnitarioContratistaPrivado: opcional(formData.get("precioUnitarioContratistaPrivado")),
      precioUnitarioIndirectos: opcional(formData.get("precioUnitarioIndirectos")),
      precioUnitarioHerramienta: opcional(formData.get("precioUnitarioHerramienta")),
      porcentajeUtilidad: opcional(formData.get("porcentajeUtilidad")),
      porcentajeAdministracion: opcional(formData.get("porcentajeAdministracion")),
      precioUnitarioClienteOverride: opcional(formData.get("precioUnitarioClienteOverride")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/contrato-privado`);
  return { guardado: true };
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
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
  return undefined;
}
