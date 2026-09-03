import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerRefArchivoGasto } from "@/lib/server/control-de-obra/gastos";
import { obtenerUrlTemporal } from "@/lib/server/archivos";
import { manejarErrorApi } from "../../../../../_lib/manejar-error";

// Ticket/factura de un Gasto de Obra — operativo (puedeCapturarGastos, ver
// obtenerRefArchivoGasto), no depende de Vista Privada. ?tipo=factura para
// la factura, ticket por default.
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/gastos/[gastoId]/ticket">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { gastoId } = await ctx.params;
  const tipo = new URL(request.url).searchParams.get("tipo") === "factura" ? "factura" : "ticket";

  try {
    const ref = await obtenerRefArchivoGasto(usuario, gastoId, tipo);
    if (!ref) {
      return NextResponse.json({ error: `Este gasto no tiene ${tipo}.` }, { status: 404 });
    }
    const urlTemporal = await obtenerUrlTemporal(ref);
    return NextResponse.redirect(urlTemporal);
  } catch (error) {
    return manejarErrorApi(error);
  }
}
