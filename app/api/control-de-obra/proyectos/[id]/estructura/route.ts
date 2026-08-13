import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { obtenerEstructuraContractual } from "@/lib/server/control-de-obra/estructura-contractual";
import { manejarErrorApi } from "../../../_lib/manejar-error";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/control-de-obra/proyectos/[id]/estructura">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const estructura = await obtenerEstructuraContractual(usuario, id);
    return NextResponse.json(estructura);
  } catch (error) {
    return manejarErrorApi(error);
  }
}
