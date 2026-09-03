import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerProyecto } from "@/lib/server/control-de-obra/proyectos";
import { obtenerUrlTemporal } from "@/lib/server/archivos";
import { manejarErrorApi } from "../../../_lib/manejar-error";

// Imagen de portada de un Proyecto — no es información sensible, pero el
// bucket sigue siendo privado, así que igual pasa por sesión + pertenencia a
// la empresa (obtenerProyecto ya lo garantiza) antes de redirigir a una URL
// firmada de corta duración.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/imagen">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const proyecto = await obtenerProyecto(usuario, id);
    if (!proyecto.imagenRef) {
      return NextResponse.json({ error: "Este proyecto no tiene imagen." }, { status: 404 });
    }
    const urlTemporal = await obtenerUrlTemporal(proyecto.imagenRef);
    return NextResponse.redirect(urlTemporal, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
