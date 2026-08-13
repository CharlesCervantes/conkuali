import { NextResponse } from "next/server";
import { cerrarSesion } from "@/lib/server/auth/service";

export async function POST() {
  await cerrarSesion();
  return NextResponse.json({ ok: true });
}
