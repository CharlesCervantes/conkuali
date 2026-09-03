"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import {
  autenticar,
  CredencialesInvalidasError,
  UsuarioInactivoError,
  EmpresaInactivaError,
} from "@/lib/server/auth/service";

const LoginSchema = z.object({
  email: z.email({ error: "Ingresa un correo válido." }),
  password: z.string().min(1, { error: "Ingresa tu contraseña." }),
});

export type LoginState = { error?: string } | undefined;

export async function login(
  _state: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await autenticar(parsed.data.email, parsed.data.password);
  } catch (error) {
    if (
      error instanceof CredencialesInvalidasError ||
      error instanceof UsuarioInactivoError ||
      error instanceof EmpresaInactivaError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  redirect("/dashboard");
}
