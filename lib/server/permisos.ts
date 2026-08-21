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
 * Eliminar un proyecto (borrado en cascada, irreversible) es más restrictivo
 * que administrarlo — a propósito no incluye MASTER (decisión de sesión,
 * agosto 2026: el rol de plataforma no debe poder borrar datos de un tenant
 * casualmente desde esta pantalla).
 */
export function puedeEliminarProyectos(usuario: UsuarioSesion): boolean {
  return usuario.rol === "ADMINISTRADOR" || usuario.rol === "DIRECTOR";
}

/**
 * Cerrar/reabrir una semana de Avance de Obra genera y toca movimientos
 * financieros reales en Reporte General — mismo rol-set restringido que
 * eliminar proyectos, sin Master (decisión de sesión, agosto 2026).
 */
export function puedeCerrarSemana(usuario: UsuarioSesion): boolean {
  return usuario.rol === "ADMINISTRADOR" || usuario.rol === "DIRECTOR";
}

// Reabrir toca lo mismo financieramente sensible que cerrar — mismo rol-set,
// no se relaja para nadie más.
export function puedeReabrirSemana(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
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

/**
 * Recibos financieros (expediente de contratista: estimado/pagado acumulado,
 * saldo, historial de cortes, generar/ver/subir evidencia de recibo) — mismo
 * rol-set que la información privada de Contrato General. Supervisor no ve
 * precios de recibo ni puede generar/subir nada (04-modulo-control-de-obra.md,
 * sección 49.9 y "Recibo de Pago" de 02-control-de-obra.md).
 */
export function puedeVerRecibosFinancieros(usuario: UsuarioSesion): boolean {
  return puedeAdministrarProyectos(usuario);
}

/**
 * Emitir una Estimación Cliente la congela para siempre — mismo criterio
 * financieramente sensible que cerrar/reabrir semana y eliminar proyectos,
 * sin Master (04-modulo-control-de-obra.md, sección "Cliente").
 */
export function puedeEmitirEstimacionCliente(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}

/**
 * Materializar retroactivamente la EstimacionCliente de una semana que ya
 * estaba cerrada antes de que este módulo existiera — mismo criterio
 * financieramente sensible que cerrar semana/emitir, sin Master
 * (04-modulo-control-de-obra.md, sección "Cliente").
 */
export function puedeMaterializarEstimacionHistorica(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}

/**
 * Ver Control Contractual (información financiera privada del cliente:
 * fondo/cuentas por cobrar, aportaciones, pagos) — mismo rol-set que el
 * resto de la capa privada de Contrato General (04-modulo-control-de-obra.md,
 * sección "Control Contractual").
 */
export function puedeVerFinancieroCliente(usuario: UsuarioSesion): boolean {
  return puedeVerContratoGeneralPrivado(usuario);
}

/**
 * Registrar movimientos financieros del cliente (aportación al fondo, pago de
 * una estimación) — mismo criterio financieramente sensible que cerrar
 * semana/emitir/materializar histórico, sin Master.
 */
export function puedeRegistrarMovimientoFinancieroCliente(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}

/**
 * Capturar/editar Gastos de Obra, subir evidencia, solicitar Órdenes de
 * Compra — operativo, mismo rol-set amplio que reportar avance (Supervisor
 * incluido). 04-modulo-control-de-obra.md, sección "Gastos de Obra".
 */
export function puedeCapturarGastos(usuario: UsuarioSesion): boolean {
  return puedeReportarAvance(usuario);
}

/**
 * Aprobar/rechazar Gastos, crear y aprobar Reposiciones de cualquier
 * beneficiario — financieramente sensible, mismo criterio que cerrar
 * semana/emitir estimación (sin Master).
 */
export function puedeAprobarGastos(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}

/**
 * Autorizar Órdenes de Compra — mismo criterio que puedeAprobarGastos.
 */
export function puedeAutorizarOrdenesCompra(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}

/**
 * Administrar el catálogo global (Proveedores/Contratistas/Personal y el
 * vínculo Usuario↔Beneficiario) — mismo rol-set que administrar proyectos;
 * Supervisor sigue accediendo a catálogos solo a través de los selects ya
 * existentes dentro de Gastos/OC, sin administrar la pantalla propia
 * (04-modulo-control-de-obra.md, sección "Catálogos").
 */
export function puedeAdministrarCatalogos(usuario: UsuarioSesion): boolean {
  return puedeAdministrarProyectos(usuario);
}
