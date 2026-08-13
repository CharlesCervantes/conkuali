import "server-only";
import type { UsuarioSesion } from "@/lib/server/session";

/**
 * El plan de la Empresa decide qué módulos existen para ella (independiente
 * del rol). Ver /docs/arquitectura/00-decisiones-fundamentales.md — el
 * sistema de permisos debe consultar el plan, no solo el rol.
 */
export function empresaTieneModulo(
  usuario: UsuarioSesion,
  moduloClave: string
): boolean {
  if (usuario.rol === "MASTER") return true; // rol de plataforma, cruza tenants
  const modulos = usuario.empresa?.plan?.modulos ?? [];
  return modulos.some((pm) => pm.modulo.clave === moduloClave);
}

export function esMaster(usuario: UsuarioSesion): boolean {
  return usuario.rol === "MASTER";
}
