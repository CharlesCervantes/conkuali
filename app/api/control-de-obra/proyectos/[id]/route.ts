import { NextResponse } from "next/server";
import * as z from "zod";
import { verifySession } from "@/lib/server/auth/dal";
import {
  obtenerProyecto,
  editarProyecto,
  SinPermisoError,
  ProyectoNoEncontradoError,
} from "@/lib/server/control-de-obra/proyectos";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const proyecto = await obtenerProyecto(usuario, id);
    return NextResponse.json({ proyecto });
  } catch (error) {
    if (error instanceof ProyectoNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  try {
    const proyecto = await editarProyecto(usuario, id, body);
    return NextResponse.json({ proyecto });
  } catch (error) {
    if (error instanceof SinPermisoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ProyectoNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
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
