import "server-only";
import { db } from "@/lib/server/db";
import type { CapacidadInteligencia, ComportamientoLimiteInteligencia, TipoConsumoInteligencia } from "@/lib/generated/prisma/client";

// Administración y enforcement GENÉRICOS de capacidades de ARQENTO IA — nunca
// conoce Contabilidad ni ningún otro módulo de dominio. Cualquier handler
// (reconciliar-egreso.ts hoy, Compras/Facturas después) llama
// autorizarConsumo() inmediatamente antes de gastar IA real, y mapea el
// motivo de rechazo a SU PROPIO estatus de dominio — este archivo nunca
// sabe qué es un DocumentoEgreso (Master → Empresa → ARQENTO IA, V1.3,
// octubre 2026).

// Qué TipoConsumoInteligencia corresponde a cada capacidad — la única pieza
// que conecta el catálogo "de producto" (capacidades, lo que Master
// administra) con el catálogo "técnico" (tipoConsumo, lo que se factura).
// Agregar una capacidad futura (OCR/Chat/embeddings) es agregar una entrada
// aquí, nunca tocar el resto de este archivo.
const TIPOS_CONSUMO_POR_CAPACIDAD: Record<CapacidadInteligencia, TipoConsumoInteligencia[]> = {
  ANALISIS_DOCUMENTAL_TEXTO: ["EXTRACCION_LLM"],
  ANALISIS_VISUAL: ["EXTRACCION_LLM_VISUAL"],
};

export type MotivoDenegacionInteligencia = "IA_DESHABILITADA" | "CAPACIDAD_DESHABILITADA" | "LIMITE_ALCANZADO";
export type ResultadoAutorizacion = { autorizado: true } | { autorizado: false; motivo: MotivoDenegacionInteligencia };

function inicioDeMesUtc(): Date {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
}

// Única puerta de entrada autorizada para decidir si una Empresa puede
// consumir una capacidad de IA en este momento — combina: switch maestro de
// la Empresa, la capacidad específica habilitada, el kill-switch global
// (solo aplica hoy a ANALISIS_VISUAL — ver ARQENTO_VISION_HABILITADA), y el
// límite operativo mensual con su comportamiento configurado. Debe llamarse
// INMEDIATAMENTE antes de cada llamada real a un proveedor de IA — nunca
// solo al encolar o al decidir una estrategia, porque la configuración
// puede cambiar entre que un trabajo se encola y realmente se procesa.
// Interruptor maestro de ARQENTO IA por Empresa (Master → Empresa →
// ARQENTO IA). Apagado — el valor por omisión — cierra en el servidor TODO
// módulo que consume IA, no solo la llamada al proveedor (preparación para
// PRD, octubre 2026). Lo usan los puntos de entrada de cada módulo y las
// pantallas para ocultar su interfaz.
export async function inteligenciaHabilitadaParaEmpresa(empresaId: string): Promise<boolean> {
  const empresa = await db.empresa.findUnique({ where: { id: empresaId }, select: { inteligenciaHabilitada: true } });
  return empresa?.inteligenciaHabilitada === true;
}

export async function autorizarConsumo(empresaId: string, capacidad: CapacidadInteligencia): Promise<ResultadoAutorizacion> {
  const empresa = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { inteligenciaHabilitada: true, limiteOperacionesMensualInteligencia: true, comportamientoLimiteInteligencia: true },
  });
  if (!empresa || !empresa.inteligenciaHabilitada) return { autorizado: false, motivo: "IA_DESHABILITADA" };

  // Kill-switch de emergencia — nunca sustituye la configuración por
  // Empresa, solo la complementa: para que visión corra deben cumplirse
  // AMBAS condiciones (decisión de sesión, V1.3).
  if (capacidad === "ANALISIS_VISUAL" && process.env.ARQENTO_VISION_HABILITADA === "false") {
    return { autorizado: false, motivo: "CAPACIDAD_DESHABILITADA" };
  }

  const capacidadFila = await db.empresaCapacidadInteligencia.findUnique({
    where: { empresaId_capacidad: { empresaId, capacidad } },
  });
  if (!capacidadFila?.habilitado) return { autorizado: false, motivo: "CAPACIDAD_DESHABILITADA" };

  if (empresa.limiteOperacionesMensualInteligencia !== null) {
    const operacionesEsteMes = await db.registroConsumoInteligencia.count({
      where: { empresaId, fecha: { gte: inicioDeMesUtc() } },
    });
    if (
      operacionesEsteMes >= empresa.limiteOperacionesMensualInteligencia &&
      empresa.comportamientoLimiteInteligencia === "BLOQUEAR"
    ) {
      return { autorizado: false, motivo: "LIMITE_ALCANZADO" };
    }
  }

  return { autorizado: true };
}

export async function obtenerCapacidadesEmpresa(empresaId: string) {
  const filas = await db.empresaCapacidadInteligencia.findMany({ where: { empresaId } });
  const habilitadas = new Set(filas.filter((f) => f.habilitado).map((f) => f.capacidad));
  return {
    ANALISIS_DOCUMENTAL_TEXTO: habilitadas.has("ANALISIS_DOCUMENTAL_TEXTO"),
    ANALISIS_VISUAL: habilitadas.has("ANALISIS_VISUAL"),
  } satisfies Record<CapacidadInteligencia, boolean>;
}

export async function establecerCapacidadEmpresa(empresaId: string, capacidad: CapacidadInteligencia, habilitado: boolean) {
  await db.empresaCapacidadInteligencia.upsert({
    where: { empresaId_capacidad: { empresaId, capacidad } },
    create: { empresaId, capacidad, habilitado },
    update: { habilitado },
  });
}

export type LimiteInteligencia = {
  inteligenciaHabilitada: boolean;
  limiteOperacionesMensual: number | null;
  porcentajeAlerta: number | null;
  comportamientoLimite: ComportamientoLimiteInteligencia;
};

export async function obtenerLimiteEmpresa(empresaId: string): Promise<LimiteInteligencia> {
  const empresa = await db.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: {
      inteligenciaHabilitada: true,
      limiteOperacionesMensualInteligencia: true,
      porcentajeAlertaInteligencia: true,
      comportamientoLimiteInteligencia: true,
    },
  });
  return {
    inteligenciaHabilitada: empresa.inteligenciaHabilitada,
    limiteOperacionesMensual: empresa.limiteOperacionesMensualInteligencia,
    porcentajeAlerta: empresa.porcentajeAlertaInteligencia,
    comportamientoLimite: empresa.comportamientoLimiteInteligencia,
  };
}

export async function establecerEstatusInteligenciaEmpresa(empresaId: string, habilitado: boolean) {
  await db.empresa.update({ where: { id: empresaId }, data: { inteligenciaHabilitada: habilitado } });
}

export async function establecerLimiteEmpresa(
  empresaId: string,
  args: {
    limiteOperacionesMensual: number | null;
    porcentajeAlerta: number | null;
    comportamientoLimite: ComportamientoLimiteInteligencia;
  }
) {
  await db.empresa.update({
    where: { id: empresaId },
    data: {
      limiteOperacionesMensualInteligencia: args.limiteOperacionesMensual,
      porcentajeAlertaInteligencia: args.porcentajeAlerta,
      comportamientoLimiteInteligencia: args.comportamientoLimite,
    },
  });
}

export function tiposConsumoDeCapacidad(capacidad: CapacidadInteligencia): TipoConsumoInteligencia[] {
  return TIPOS_CONSUMO_POR_CAPACIDAD[capacidad];
}
