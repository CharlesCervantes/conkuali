"use server";

import * as z from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/server/auth/dal";
import { db } from "@/lib/server/db";
import { cambiarPassword, PasswordActualIncorrectaError } from "@/lib/server/auth/service";
import { puedeConfigurarVistaPrivada } from "@/lib/server/permisos";

export type PerfilFormState = { error?: string; guardado?: boolean } | undefined;

const NombreSchema = z.string().trim().min(1, "El nombre es obligatorio.");

export async function actualizarNombreAction(
  _state: PerfilFormState,
  formData: FormData
): Promise<PerfilFormState> {
  const usuario = await requireSession();
  const parsed = NombreSchema.safeParse(formData.get("nombre"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nombre inválido." };
  }

  await db.usuario.update({ where: { id: usuario.id }, data: { nombre: parsed.data } });
  revalidatePath("/", "layout");
  return { guardado: true };
}

const PasswordSchema = z
  .object({
    passwordActual: z.string().min(1, "Ingresa tu contraseña actual."),
    passwordNueva: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres."),
    passwordConfirmar: z.string(),
  })
  .refine((datos) => datos.passwordNueva === datos.passwordConfirmar, {
    message: "Las contraseñas nuevas no coinciden.",
    path: ["passwordConfirmar"],
  });

export async function cambiarPasswordAction(
  _state: PerfilFormState,
  formData: FormData
): Promise<PerfilFormState> {
  const usuario = await requireSession();
  const parsed = PasswordSchema.safeParse({
    passwordActual: formData.get("passwordActual"),
    passwordNueva: formData.get("passwordNueva"),
    passwordConfirmar: formData.get("passwordConfirmar"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await cambiarPassword(usuario.id, parsed.data.passwordActual, parsed.data.passwordNueva);
  } catch (error) {
    if (error instanceof PasswordActualIncorrectaError) {
      return { error: error.message };
    }
    throw error;
  }

  // Cualquier cambio de contraseña exitoso limpia el cambio obligatorio si
  // estaba pendiente (alta con contraseña temporal desde Portal Master, ver
  // app/nueva-password) — sin efecto para quien ya lo tenía en false.
  if (usuario.debeCambiarPassword) {
    await db.usuario.update({ where: { id: usuario.id }, data: { debeCambiarPassword: false } });
  }

  return { guardado: true };
}

// Nunca recibe un id de usuario objetivo — siempre actúa sobre el usuario de
// la sesión actual (sección 15 del diseño: "Mi perfil → mi Vista privada",
// nunca la de alguien más). revalidatePath refresca el sidebar y cualquier
// página ya cargada en la siguiente navegación — la sesión ya lee
// vistaPrivadaActiva fresco de BD en cada request, así que no hace falta
// cerrar sesión para que el cambio surta efecto.
export async function actualizarVistaPrivadaAction(activa: boolean): Promise<void> {
  const usuario = await requireSession();
  if (!puedeConfigurarVistaPrivada(usuario)) return;

  await db.usuario.update({
    where: { id: usuario.id },
    data: { vistaPrivadaActiva: activa },
  });
  revalidatePath("/", "layout");
}
