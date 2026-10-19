import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { procesarTrabajosPendientes } from "@/lib/server/inteligencia/worker";

// Red de seguridad del procesamiento asíncrono — el disparador normal es la
// llamada inmediata tras subir documentos (ver
// lib/server/contabilidad/documentos/documento-egreso.ts); este endpoint
// existe para recoger jobs abandonados o pendientes de reintento sin
// depender de que esa llamada inmediata haya tenido éxito (Carga
// inteligente de documentos, V1 — octubre 2026).
//
// Protegido con CRON_SECRET — mismo patrón estándar de Vercel Cron
// (Authorization: Bearer <CRON_SECRET>, que Vercel agrega automáticamente
// cuando el cron está configurado en vercel.json). Requiere CRON_SECRET en
// las variables de entorno de producción.
export async function GET(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = await procesarTrabajosPendientes();
  return NextResponse.json(resultado);
}
