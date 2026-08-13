import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { editarConcepto } from "@/lib/server/control-de-obra/estructura-contractual";
import { manejarErrorApi } from "../../_lib/manejar-error";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/control-de-obra/conceptos/[id]">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  try {
    const concepto = await editarConcepto(usuario, id, body);
    return NextResponse.json({ concepto });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
