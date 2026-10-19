import "server-only";
import { inteligenciaHabilitadaParaEmpresa } from "@/lib/server/inteligencia/capacidades";
import { ValidacionError } from "@/lib/server/control-de-obra/proyectos";

// Captura inteligente de documentos cerrada en el SERVIDOR cuando la
// Empresa no tiene ARQENTO IA habilitada (preparación para PRD, octubre
// 2026): ocultar la interfaz no basta — cada punto de entrada del módulo
// (subir, consultar, confirmar, descartar) lo verifica antes de leer o
// escribir nada. El módulo, sus datos y sus migraciones se conservan; basta
// con habilitar la Empresa desde Master para volver a usarlo.
export const MENSAJE_CAPTURA_DESHABILITADA = "La captura inteligente de documentos no está habilitada para tu Empresa.";

export async function requerirCapturaInteligente(empresaId: string): Promise<void> {
  if (!(await inteligenciaHabilitadaParaEmpresa(empresaId))) throw new ValidacionError(MENSAJE_CAPTURA_DESHABILITADA);
}
