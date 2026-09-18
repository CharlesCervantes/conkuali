import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerRefArchivoCotizacion } from "@/lib/server/control-de-obra/requisiciones";
import { obtenerUrlTemporal } from "@/lib/server/archivos";
import { manejarErrorApi } from "../../../../../_lib/manejar-error";

// Archivo de una Cotización — mismo gate que el resto de lectura de Compras
// (puedeCapturarGastos, ver obtenerRefArchivoCotizacion).
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/cotizaciones/[cotizacionId]/archivo">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { cotizacionId } = await ctx.params;

  try {
    const ref = await obtenerRefArchivoCotizacion(usuario, cotizacionId);
    if (!ref) {
      return NextResponse.json({ error: "Esta cotización no tiene archivo." }, { status: 404 });
    }
    const urlTemporal = await obtenerUrlTemporal(ref);
    return NextResponse.redirect(urlTemporal);
  } catch (error) {
    return manejarErrorApi(error);
  }
}
