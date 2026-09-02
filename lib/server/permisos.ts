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
 * Techo de ROL para toda la capa privada (Contrato General Privado, Cliente
 * Priv./Control Contractual, Recibos financieros) — exclusivo de
 * Administrador/Director. Deliberadamente NO es puedeAdministrarProyectos
 * (que incluye Master): Master es un rol de plataforma, no un administrador
 * operativo de una empresa, y no debe obtener acceso a la capa privada de
 * una empresa por este mecanismo — ese alcance se define más adelante, con
 * Administración de Empresas/Master (decisión de sesión, agosto 2026 — Vista
 * Privada). También decide si el switch "Vista privada" existe siquiera
 * para este usuario (Mi perfil → Privacidad).
 */
export function puedeConfigurarVistaPrivada(usuario: UsuarioSesion): boolean {
  return usuario.rol === "ADMINISTRADOR" || usuario.rol === "DIRECTOR";
}

/**
 * Único punto de verdad de "¿tiene HOY acceso a la capa privada?": combina
 * el permiso real de rol (nunca cambia) con la preferencia personal Vista
 * privada, que un Administrador/Director puede apagar temporalmente desde Mi
 * perfil para presentar el sistema sin riesgo de mostrar información
 * sensible — sin tocar su rol ni sus permisos operativos. Nunca al revés:
 * sin el permiso de rol, vistaPrivadaActiva no otorga nada por sí sola.
 * Supervisor y Master nunca pasan de aquí, sin importar el valor guardado en
 * BD (decisión de sesión, agosto 2026 — Vista Privada).
 */
export function puedeVerInformacionPrivada(usuario: UsuarioSesion): boolean {
  return puedeConfigurarVistaPrivada(usuario) && usuario.vistaPrivadaActiva;
}

/**
 * Contrato General Privado (Indirectos, Herramienta, % utilidad/administración,
 * precio final al cliente, márgenes comerciales) — nombre propio para dejar
 * explícito qué protege esta verificación (04-modulo-control-de-obra.md,
 * sección 49.9). Supervisor SÍ ve el Contrato General operativo (presupuesto
 * de contratista y materiales, cantidades, avance) — lo que no ve es esto.
 */
export function puedeVerContratoGeneralPrivado(usuario: UsuarioSesion): boolean {
  return puedeVerInformacionPrivada(usuario);
}

/**
 * Recibos financieros (expediente de contratista: estimado/pagado acumulado,
 * saldo, historial de cortes, generar/ver/subir evidencia de recibo) — misma
 * capa de información privada que Contrato General Privado, aunque viva
 * dentro de Avance/Contratistas en vez de una ruta /privado/ propia
 * (04-modulo-control-de-obra.md, sección 49.9 y "Recibo de Pago" de
 * 02-control-de-obra.md). Supervisor no ve precios de recibo ni puede
 * generar/subir nada.
 */
export function puedeVerRecibosFinancieros(usuario: UsuarioSesion): boolean {
  return puedeVerInformacionPrivada(usuario);
}

/**
 * Emitir una Estimación Cliente la congela para siempre — mismo criterio
 * financieramente sensible que cerrar/reabrir semana y eliminar proyectos,
 * sin Master (04-modulo-control-de-obra.md, sección "Cliente"). Ya NO exige
 * Vista privada activa (cambio deliberado, gastos cobrables en Estimación
 * Cliente, agosto 2026): una obra sin capa privada (Vista Privada
 * permanentemente apagada, o el proyecto nunca la usa) debe poder emitir
 * desde Cliente normal sin depender de ese interruptor — respaldado por
 * 04-modulo-control-de-obra.md sección 49.9, que ya documenta que el %
 * Administración (a diferencia de %Utilidad de Precio Alzado) es visible
 * para el cliente, no es margen oculto. Quién puede emitir no cambia (sigue
 * siendo exclusivamente ADMINISTRADOR/DIRECTOR vía puedeCerrarSemana, Master
 * sigue excluido) — solo deja de requerir el toggle.
 */
export function puedeEmitirEstimacionCliente(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}

/**
 * Materializar retroactivamente la EstimacionCliente de una semana que ya
 * estaba cerrada antes de que este módulo existiera — mismo criterio
 * financieramente sensible que cerrar semana/emitir, sin Master
 * (04-modulo-control-de-obra.md, sección "Cliente"). Respeta Vista privada
 * igual que puedeEmitirEstimacionCliente.
 */
export function puedeMaterializarEstimacionHistorica(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario) && usuario.vistaPrivadaActiva;
}

/**
 * Ver Control Contractual — información financiera del cliente (fondo/
 * cuentas por cobrar, aportaciones, pagos), capa Privada: mismo rol-set que
 * el resto de la capa privada de Contrato General (04-modulo-control-de-obra.md,
 * sección "Control Contractual").
 */
export function puedeVerFinancieroCliente(usuario: UsuarioSesion): boolean {
  return puedeVerContratoGeneralPrivado(usuario);
}

/**
 * Igual que puedeVerFinancieroCliente, pero para la capa Cliente (operativo)
 * — deliberadamente SIN exigir Vista privada (mismo criterio que
 * puedeEmitirEstimacionCliente): una obra sin capa privada necesita ver su
 * propio pendiente por cobrar/fondo sin depender de ese interruptor. El
 * rol-set no cambia (ADMINISTRADOR/DIRECTOR, sin Master) — gastos cobrables
 * en Estimación Cliente, agosto 2026.
 */
export function puedeVerFinancieroClienteOperativo(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}

/**
 * Registrar movimientos financieros del cliente (aportación al fondo, pago de
 * una estimación) — mismo criterio financieramente sensible que cerrar
 * semana/emitir/materializar histórico, sin Master. Respeta Vista privada
 * igual que puedeEmitirEstimacionCliente.
 */
export function puedeRegistrarMovimientoFinancieroCliente(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario) && usuario.vistaPrivadaActiva;
}

/**
 * Igual que puedeRegistrarMovimientoFinancieroCliente, pero para la capa
 * Cliente (operativo) — deliberadamente SIN exigir Vista privada (mismo
 * criterio que puedeVerFinancieroClienteOperativo/puedeEmitirEstimacionCliente):
 * una obra sin capa privada necesita poder registrar pagos y aplicar fondo
 * contra su propia estimación Operativo sin depender de ese interruptor. El
 * rol-set no cambia (ADMINISTRADOR/DIRECTOR, sin Master) — arquitectura por
 * capas, agosto 2026.
 */
export function puedeRegistrarMovimientoFinancieroClienteOperativo(usuario: UsuarioSesion): boolean {
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

/**
 * Eliminar definitivamente un elemento de catálogo (Proveedor/Contratista/
 * Personal) — a diferencia de puedeAdministrarCatalogos (que incluye Master,
 * igual que administrar proyectos), esto es irreversible y borra datos reales
 * de un tenant, así que sigue el mismo criterio restringido que
 * puedeEliminarProyectos: nunca Master (decisión de sesión, agosto 2026).
 */
export function puedeEliminarCatalogo(usuario: UsuarioSesion): boolean {
  return usuario.rol === "ADMINISTRADOR" || usuario.rol === "DIRECTOR";
}

/**
 * Liquidar un movimiento de Reporte General (marcar PENDIENTE_PAGO como
 * pagado, con evidencia) — financieramente sensible, mismo criterio que
 * cerrar semana/aprobar gastos/autorizar OC: Administrador y Director,
 * nunca Master (rol de plataforma, no participa en la operación financiera
 * de una empresa) ni Supervisor. Sin relación con Vista privada — liquidar
 * no es información privada del cliente, es una acción operativa de pagos.
 */
export function puedeLiquidarPagos(usuario: UsuarioSesion): boolean {
  return puedeCerrarSemana(usuario);
}
