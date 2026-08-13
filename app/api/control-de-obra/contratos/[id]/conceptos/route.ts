import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { asignarConcepto } from "@/lib/server/control-de-obra/estructura-contractual";
import { manejarErrorApi } from "../../../_lib/manejar-error";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/control-de-obra/contratos/[id]/conceptos">
) {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  try {
    const asignacion = await asignarConcepto(usuario, id, body);
    return NextResponse.json({ asignacion }, { status: 201 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
