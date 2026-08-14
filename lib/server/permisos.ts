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

/**
 * Administrar el catálogo de proyectos (crear/editar/cambiar estatus) es
 * exclusivo de Administrador/Director/Master — el Supervisor puede consultar
 * pero no administra (04-modulo-control-de-obra.md, sección 4).
 */
export function puedeAdministrarProyectos(usuario: UsuarioSesion): boolean {
  return (
    usuario.rol === "ADMINISTRADOR" ||
    usuario.rol === "DIRECTOR" ||
    usuario.rol === "MASTER"
  );
}

/**
 * Reportar avance físico semanal es explícito por rol (no "cualquier usuario
 * activo") para que un rol nuevo en el futuro no reciba este permiso por
 * defecto — debe agregarse aquí a propósito (decisión de sesión, agosto 2026).
 */
export function puedeReportarAvance(usuario: UsuarioSesion): boolean {
  return (
    usuario.rol === "SUPERVISOR" ||
    usuario.rol === "ADMINISTRADOR" ||
    usuario.rol === "DIRECTOR" ||
    usuario.rol === "MASTER"
  );
}

/**
 * Contrato General Privado (Indirectos, Herramienta, % utilidad/administración,
 * precio final al cliente, márgenes comerciales) — mismo rol-set que
 * puedeAdministrarProyectos, con nombre propio para dejar explícito qué
 * protege esta verificación (04-modulo-control-de-obra.md, sección 49.9).
 * Supervisor SÍ ve el Contrato General operativo (presupuesto de contratista
 * y materiales, cantidades, avance) — lo que no ve es esto.
 */
export function puedeVerContratoGeneralPrivado(usuario: UsuarioSesion): boolean {
  return puedeAdministrarProyectos(usuario);
}
