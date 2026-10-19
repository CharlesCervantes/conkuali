import "server-only";
import type { TrabajoProcesamientoDocumento } from "@/lib/generated/prisma/client";

// Registro mínimo de operaciones — la única pieza que conecta la cola
// genérica (TrabajoProcesamientoDocumento) con la lógica de cada módulo,
// sin que el worker genérico tenga que importar nada de Contabilidad (o de
// cualquier otro módulo futuro). Cada módulo se auto-registra al cargar su
// propio archivo de wiring (ver
// lib/server/contabilidad/documentos/reconciliar-egreso.ts) — esto nunca
// crece a un framework de plugins, es solo un mapa clave→handler (Carga
// inteligente de documentos, V1 — octubre 2026).
//
// Pasos granulares (no un solo "procesar()"): así el worker puede saltarse
// un paso ya completado en un retry, sin volver a pagar una llamada a IA
// que ya había funcionado — ver resultadoDeterministicoListo/resultadoIAListo
// en el schema y lib/server/inteligencia/worker.ts.
export interface ManejadorOperacion {
  // continuarProcesamiento: false le dice al worker genérico que este job no
  // tiene nada más que procesar (ej. el archivo no tiene contenido utilizable)
  // — el worker se salta la extracción con IA sin volver a intentarla en un
  // retry, sin que este contrato necesite saber POR QUÉ (decisión de sesión,
  // octubre 2026 — "documento sin texto extraíble").
  ejecutarExtraccionDeterministica(
    job: TrabajoProcesamientoDocumento,
    bytes: Buffer
  ): Promise<{ continuarProcesamiento: boolean }>;
  ejecutarExtraccionIA(job: TrabajoProcesamientoDocumento, bytes: Buffer): Promise<void>;
  reconciliarYFinalizar(job: TrabajoProcesamientoDocumento): Promise<void>;
}

const registro = new Map<string, ManejadorOperacion>();

function clave(modulo: string, operacion: string): string {
  return `${modulo}.${operacion}`;
}

export function registrarOperacion(modulo: string, operacion: string, manejador: ManejadorOperacion): void {
  registro.set(clave(modulo, operacion), manejador);
}

export function obtenerManejador(modulo: string, operacion: string): ManejadorOperacion | undefined {
  return registro.get(clave(modulo, operacion));
}
