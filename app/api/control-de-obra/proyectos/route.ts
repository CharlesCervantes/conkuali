import { NextResponse } from "next/server";
import * as z from "zod";
import { verifySession } from "@/lib/server/auth/dal";
import {
  listarProyectos,
  crearProyecto,
  SinPermisoError,
} from "@/lib/server/control-de-obra/proyectos";

export async function GET() {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const proyectos = await listarProyectos(usuario);
    return NextResponse.json({ proyectos });
  } catch (error) {
    if (error instanceof SinPermisoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  try {
    const proyecto = await crearProyecto(usuario, body);
    return NextResponse.json({ proyecto }, { status: 201 });
  } catch (error) {
    if (error instanceof SinPermisoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Datos inválidos." },
        { status: 400 }
      );
    }
    throw error;
  }
}
