import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerRefLogoEmpresa } from "@/lib/server/branding";
import { obtenerUrlTemporal } from "@/lib/server/archivos";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";

// Único punto por el que el navegador ve el logo de una Empresa — nunca un
// <img src> directo a R2 (bucket privado). Verifica sesión + pertenencia (o
// Master) y redirige a una URL firmada de corta duración.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/empresas/[id]/logo">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;

  let ref: string | null;
  try {
    ref = await obtenerRefLogoEmpresa(usuario, id);
  } catch (error) {
    if (error instanceof SinPermisoError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  if (!ref) {
    return NextResponse.json({ error: "Esta empresa no tiene logo." }, { status: 404 });
  }

  const urlTemporal = await obtenerUrlTemporal(ref);
  return NextResponse.redirect(urlTemporal, { headers: { "Cache-Control": "private, max-age=60" } });
}
