import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerRefEvidenciaRecibo } from "@/lib/server/control-de-obra/recibos";
import { obtenerUrlTemporal } from "@/lib/server/archivos";
import { manejarErrorApi } from "../../../../../_lib/manejar-error";

// Evidencia firmada de un Recibo de Pago — dentro de la capa de privacidad
// financiera (puedeVerRecibosFinancieros, ver obtenerRefEvidenciaRecibo).
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/recibos/[reciboId]/evidencia">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { reciboId } = await ctx.params;

  try {
    const ref = await obtenerRefEvidenciaRecibo(usuario, reciboId);
    if (!ref) {
      return NextResponse.json({ error: "Este recibo no tiene evidencia." }, { status: 404 });
    }
    const urlTemporal = await obtenerUrlTemporal(ref);
    return NextResponse.redirect(urlTemporal);
  } catch (error) {
    return manejarErrorApi(error);
  }
}
