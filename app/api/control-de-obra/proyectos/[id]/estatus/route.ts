import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import {
  cambiarEstatusProyecto,
  SinPermisoError,
  ProyectoNoEncontradoError,
} from "@/lib/server/control-de-obra/proyectos";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/estatus">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  try {
    const proyecto = await cambiarEstatusProyecto(usuario, id, body?.estatus);
    return NextResponse.json({ proyecto });
  } catch (error) {
    if (error instanceof SinPermisoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ProyectoNoEncontradoError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
