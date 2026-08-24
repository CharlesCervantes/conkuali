"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server/auth/dal";
import { liquidarMovimiento } from "@/lib/server/reporte-general/liquidar";
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

export type LiquidarFormState = { error?: string; guardado?: boolean } | undefined;

export async function liquidarMovimientoAction(
  movimientoId: string,
  _state: LiquidarFormState,
  formData: FormData
): Promise<LiquidarFormState> {
  const usuario = await requireSession();
  try {
    await liquidarMovimiento(usuario, movimientoId, {
      fechaPago: formData.get("fechaPago"),
      metodoPago: formData.get("metodoPago"),
      referenciaPago: opcional(formData.get("referenciaPago")),
      notasPago: opcional(formData.get("notasPago")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath("/reporte-general");
  return { guardado: true };
}
