import { NextResponse } from "next/server";
import * as z from "zod";
import {
  SinPermisoError,
  ProyectoNoEncontradoError,
  ValidacionError,
} from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";

// Traduce los errores conocidos de los servicios de Control de Obra a
// respuestas HTTP — compartido por todas las rutas del módulo para no
// repetir el mismo try/catch en cada endpoint.
export function manejarErrorApi(error: unknown): NextResponse {
  if (error instanceof SinPermisoError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (
    error instanceof ProyectoNoEncontradoError ||
    error instanceof RegistroNoEncontradoError
  ) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Datos inválidos." },
      { status: 400 }
    );
  }
  if (error instanceof ValidacionError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}
