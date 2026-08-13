import { NextResponse } from "next/server";
import * as z from "zod";
import {
  autenticar,
  CredencialesInvalidasError,
  UsuarioInactivoError,
} from "@/lib/server/auth/service";

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  try {
    const usuario = await autenticar(parsed.data.email, parsed.data.password);
    return NextResponse.json({ usuario });
  } catch (error) {
    if (error instanceof CredencialesInvalidasError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof UsuarioInactivoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
