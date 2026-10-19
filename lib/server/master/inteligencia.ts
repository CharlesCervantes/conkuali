import "server-only";
import * as z from "zod";
import { esMaster } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { SinPermisoMasterError } from "@/lib/server/master/empresas";
import type { CapacidadInteligencia } from "@/lib/generated/prisma/client";
import {
  obtenerCapacidadesEmpresa,
  establecerCapacidadEmpresa,
  obtenerLimiteEmpresa,
  establecerLimiteEmpresa,
  establecerEstatusInteligenciaEmpresa,
  type LimiteInteligencia,
} from "@/lib/server/inteligencia/capacidades";
import {
  obtenerResumenConsumo,
  obtenerDesglosePorCapacidad,
  obtenerConsumoDiario,
  type RangoFechas,
} from "@/lib/server/inteligencia/consumo";

// Capa Master-only sobre la infraestructura genérica de ARQENTO IA — exige
// esMaster(usuario) explícitamente en cada función (nunca se asume desde el
// llamador), mismo patrón que lib/server/master/empresas.ts. En esta fase
// solo Master administra/ve esto — nunca Admin/Director de la Empresa
// (decisión de sesión, Master → Empresa → ARQENTO IA, V1.3, octubre 2026).

function requerirMaster(usuario: UsuarioSesion): void {
  if (!esMaster(usuario)) throw new SinPermisoMasterError();
}

export type ConfiguracionInteligenciaEmpresa = LimiteInteligencia & {
  capacidades: Record<CapacidadInteligencia, boolean>;
};

export async function obtenerConfiguracionInteligenciaEmpresa(
  usuario: UsuarioSesion,
  empresaId: string
): Promise<ConfiguracionInteligenciaEmpresa> {
  requerirMaster(usuario);
  const [limite, capacidades] = await Promise.all([obtenerLimiteEmpresa(empresaId), obtenerCapacidadesEmpresa(empresaId)]);
  return { ...limite, capacidades };
}

export async function cambiarEstatusInteligenciaEmpresa(usuario: UsuarioSesion, empresaId: string, habilitado: boolean) {
  requerirMaster(usuario);
  await establecerEstatusInteligenciaEmpresa(empresaId, habilitado);
  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Empresa",
    entidadId: empresaId,
    accion: "EDITAR",
    valorNuevo: { inteligenciaHabilitada: habilitado },
  });
}

export async function actualizarCapacidadInteligenciaEmpresa(
  usuario: UsuarioSesion,
  empresaId: string,
  capacidad: CapacidadInteligencia,
  habilitado: boolean
) {
  requerirMaster(usuario);
  await establecerCapacidadEmpresa(empresaId, capacidad, habilitado);
  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Empresa",
    entidadId: empresaId,
    accion: "EDITAR",
    valorNuevo: { capacidad, habilitado },
  });
}

// Un campo de formulario vacío llega como "" (nunca null/undefined) — se
// trata como "sin límite configurado" antes de que Zod intente coercionarlo
// a número (si no, "" se coercionaría a 0 y fallaría .positive()).
function vacioComoNulo(v: unknown) {
  return v === "" || v === null || v === undefined ? null : v;
}

// limiteOperacionesMensual es un límite OPERATIVO/DE SEGURIDAD (ver
// comentario en prisma/schema.prisma sobre Empresa.limiteOperacionesMensualInteligencia)
// — nunca la futura unidad comercial de ARQENTO IA.
const ActualizarLimiteSchema = z.object({
  limiteOperacionesMensual: z.preprocess(vacioComoNulo, z.coerce.number().int().positive().nullable()),
  porcentajeAlerta: z.preprocess(vacioComoNulo, z.coerce.number().int().min(1).max(100).nullable()),
  comportamientoLimite: z.enum(["SOLO_ALERTAR", "BLOQUEAR"]),
});

export async function actualizarLimiteInteligenciaEmpresa(usuario: UsuarioSesion, empresaId: string, datosCrudos: unknown) {
  requerirMaster(usuario);
  const datos = ActualizarLimiteSchema.parse(datosCrudos);
  await establecerLimiteEmpresa(empresaId, datos);
  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Empresa",
    entidadId: empresaId,
    accion: "EDITAR",
    valorNuevo: datos,
  });
}

export async function obtenerDashboardInteligenciaEmpresa(usuario: UsuarioSesion, empresaId: string, rango: RangoFechas) {
  requerirMaster(usuario);
  const [resumen, desglose, diario] = await Promise.all([
    obtenerResumenConsumo(empresaId, rango),
    obtenerDesglosePorCapacidad(empresaId, rango),
    obtenerConsumoDiario(empresaId, rango),
  ]);
  return { resumen, desglose, diario };
}

// ---------------------------------------------------------------------------
// Selector de periodo del dashboard — "hasta" siempre EXCLUSIVO (mismo
// criterio que lib/contabilidad/periodo.ts). Vive aquí porque hoy es el
// único consumidor; si otro dashboard de Master lo necesita después, se
// promueve a un archivo compartido en ese momento, no antes.
// ---------------------------------------------------------------------------

export type TipoRangoInteligencia = "ESTE_MES" | "MES_ANTERIOR" | "ULTIMOS_3_MESES" | "PERSONALIZADO";
export type RangoInteligencia = RangoFechas & { etiqueta: string };

function inicioDeDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}
function finDeDiaExclusivo(fecha: Date): Date {
  const d = inicioDeDia(fecha);
  d.setDate(d.getDate() + 1);
  return d;
}

export function resolverRangoInteligencia(
  tipo: TipoRangoInteligencia,
  personalizado?: { desde?: string; hasta?: string }
): RangoInteligencia {
  const hoy = new Date();

  if (tipo === "MES_ANTERIOR") {
    return {
      desde: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1),
      hasta: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
      etiqueta: "Mes anterior",
    };
  }
  if (tipo === "ULTIMOS_3_MESES") {
    return {
      desde: new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1),
      hasta: finDeDiaExclusivo(hoy),
      etiqueta: "Últimos 3 meses",
    };
  }
  if (tipo === "PERSONALIZADO" && personalizado?.desde && personalizado?.hasta) {
    return {
      desde: inicioDeDia(new Date(personalizado.desde)),
      hasta: finDeDiaExclusivo(new Date(personalizado.hasta)),
      etiqueta: "Personalizado",
    };
  }
  // ESTE_MES — también el fallback si PERSONALIZADO no trae fechas válidas.
  return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1), hasta: finDeDiaExclusivo(hoy), etiqueta: "Este mes" };
}
