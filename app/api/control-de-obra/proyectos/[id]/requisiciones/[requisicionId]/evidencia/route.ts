import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerRefEvidenciaRequisicion } from "@/lib/server/control-de-obra/requisiciones";
import { obtenerUrlTemporal } from "@/lib/server/archivos";
import { manejarErrorApi } from "../../../../../_lib/manejar-error";

// Evidencia de una Requisición — mismo gate que el resto de lectura de
// Compras (puedeCapturarGastos, ver obtenerRefEvidenciaRequisicion).
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/requisiciones/[requisicionId]/evidencia">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { requisicionId } = await ctx.params;

  try {
    const ref = await obtenerRefEvidenciaRequisicion(usuario, requisicionId);
    if (!ref) {
      return NextResponse.json({ error: "Esta requisición no tiene evidencia." }, { status: 404 });
    }
    const urlTemporal = await obtenerUrlTemporal(ref);
    return NextResponse.redirect(urlTemporal);
  } catch (error) {
    return manejarErrorApi(error);
  }
}
