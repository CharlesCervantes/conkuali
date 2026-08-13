import { NextResponse } from "next/server";
import { verifySession } from "@/lib/server/auth/dal";
import { listarContratistasDisponibles } from "@/lib/server/control-de-obra/estructura-contractual";
import { manejarErrorApi } from "../_lib/manejar-error";

export async function GET() {
  const usuario = await verifySession();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  try {
    const contratistas = await listarContratistasDisponibles(usuario);
    return NextResponse.json({ contratistas });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
