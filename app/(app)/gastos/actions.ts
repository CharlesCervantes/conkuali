"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireSession } from "@/lib/server/auth/dal";
import { subirArchivo } from "@/lib/server/archivos";
import { obtenerOCrearSemanaActual } from "@/lib/server/semanas";
import { obtenerOCrearProyectoOficina } from "@/lib/server/control-de-obra/proyecto-oficina";
import { crearGasto, editarGasto } from "@/lib/server/control-de-obra/gastos";
import {
  crearGastoRecurrente,
  editarGastoRecurrente,
  cambiarEstatusGastoRecurrente,
} from "@/lib/server/control-de-obra/gastos-recurrentes";
import { SinPermisoError, ValidacionError, ProyectoNoEncontradoError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";
import { datosGastoDesdeFormData } from "@/lib/control-de-obra/gasto-form-data";

function mensajeError(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Datos inválidos.";
  if (
    error instanceof SinPermisoError ||
    error instanceof ValidacionError ||
    error instanceof ProyectoNoEncontradoError ||
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

// Resuelve el Paso 1 (Destino) del formulario global — "empresa" siempre
// apunta al Proyecto(tipo=OFICINA) canónico de la Empresa (autocreado aquí
// si es la primera vez), "proyecto" usa el id que el usuario eligió.
// crearGasto/editarGasto (gastos.ts) no cambian de firma — siguen recibiendo
// un proyectoId normal, nunca saben si viene de Empresa u obra real (Gastos
// transversal, septiembre 2026).
async function resolverProyectoDestino(empresaId: string, formData: FormData): Promise<string> {
  const destino = formData.get("destino");
  if (destino === "empresa") return obtenerOCrearProyectoOficina(empresaId);

  const proyectoId = formData.get("proyectoId");
  if (typeof proyectoId !== "string" || !proyectoId) {
    throw new ValidacionError("Selecciona un proyecto.");
  }
  return proyectoId;
}

export type GastoGlobalFormState = { error?: string; guardado?: boolean } | undefined;

export async function crearGastoGlobalAction(
  _state: GastoGlobalFormState,
  formData: FormData
): Promise<GastoGlobalFormState> {
  const usuario = await requireSession();
  if (!usuario.empresa) return { error: "Tu cuenta no tiene una empresa asignada." };
  const empresaId = usuario.empresa.id;

  try {
    const proyectoId = await resolverProyectoDestino(empresaId, formData);
    const semana = await obtenerOCrearSemanaActual(empresaId);

    let ticketRef: string | null = null;
    let ticketNombre: string | null = null;
    const archivo = formData.get("ticket");
    if (archivo instanceof File && archivo.size > 0) {
      const subido = await subirArchivo(`gastos/${proyectoId}`, archivo);
      ticketRef = subido.ref;
      ticketNombre = subido.nombre;
    }

    await crearGasto(usuario, proyectoId, semana.id, {
      ...datosGastoDesdeFormData(formData),
      ticketRef,
      ticketNombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/gastos");
  revalidatePath("/reporte-general");
  return { guardado: true };
}

export async function editarGastoGlobalAction(
  proyectoId: string,
  gastoId: string,
  _state: GastoGlobalFormState,
  formData: FormData
): Promise<GastoGlobalFormState> {
  const usuario = await requireSession();
  try {
    let ticketRef: string | null = null;
    let ticketNombre: string | null = null;
    const archivo = formData.get("ticket");
    if (archivo instanceof File && archivo.size > 0) {
      const subido = await subirArchivo(`gastos/${proyectoId}`, archivo);
      ticketRef = subido.ref;
      ticketNombre = subido.nombre;
    }
    await editarGasto(usuario, gastoId, {
      ...datosGastoDesdeFormData(formData),
      ticketRef,
      ticketNombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/gastos");
  revalidatePath("/reporte-general");
  return { guardado: true };
}

// ---------------------------------------------------------------------------
// Gastos recurrentes — administración de plantillas, Administrador/Director
// únicamente (puedeAdministrarGastosRecurrentes, validado dentro del
// servicio).
// ---------------------------------------------------------------------------

export type GastoRecurrenteFormState = { error?: string; guardado?: boolean } | undefined;

export async function crearGastoRecurrenteAction(
  _state: GastoRecurrenteFormState,
  formData: FormData
): Promise<GastoRecurrenteFormState> {
  const usuario = await requireSession();
  if (!usuario.empresa) return { error: "Tu cuenta no tiene una empresa asignada." };
  try {
    const destino = formData.get("destino");
    const proyectoId =
      destino === "empresa"
        ? await obtenerOCrearProyectoOficina(usuario.empresa.id)
        : formData.get("proyectoId");
    await crearGastoRecurrente(usuario, {
      proyectoId,
      descripcion: formData.get("descripcion"),
      categoria: formData.get("categoria"),
      frecuencia: formData.get("frecuencia"),
      montoFijo: opcional(formData.get("montoFijo")),
      pagadorBeneficiarioId: opcional(formData.get("pagadorBeneficiarioId")),
      fechaInicio: formData.get("fechaInicio"),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/gastos/recurrentes");
  return { guardado: true };
}

export async function editarGastoRecurrenteAction(
  id: string,
  _state: GastoRecurrenteFormState,
  formData: FormData
): Promise<GastoRecurrenteFormState> {
  const usuario = await requireSession();
  try {
    await editarGastoRecurrente(usuario, id, {
      proyectoId: formData.get("proyectoId"),
      descripcion: formData.get("descripcion"),
      categoria: formData.get("categoria"),
      frecuencia: formData.get("frecuencia"),
      montoFijo: opcional(formData.get("montoFijo")),
      pagadorBeneficiarioId: opcional(formData.get("pagadorBeneficiarioId")),
      fechaInicio: formData.get("fechaInicio"),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/gastos/recurrentes");
  return { guardado: true };
}

export async function cambiarEstatusGastoRecurrenteAction(id: string, activo: boolean) {
  const usuario = await requireSession();
  await cambiarEstatusGastoRecurrente(usuario, id, activo);
  revalidatePath("/gastos/recurrentes");
}
