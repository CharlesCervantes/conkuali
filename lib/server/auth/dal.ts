import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/server/session";

// cache() evita repetir la consulta de sesión varias veces durante el mismo
// render (puede invocarse desde layout, page y componentes anidados).
export const verifySession = cache(getUsuarioActual);

export async function requireSession() {
  const usuario = await verifySession();
  if (!usuario) redirect("/login");
  return usuario;
}
