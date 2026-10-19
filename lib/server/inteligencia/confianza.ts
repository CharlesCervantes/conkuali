import type { CamposFinancierosDetectados } from "./tipos";

// Campos "clave" pesan el doble al calcular la confianza global — son los
// que de verdad hacen falta para reconocer un documento sin ayuda externa
// (Carga inteligente de documentos, Fase 1). El resto suma, pero no decide
// solo.
const CAMPOS_CLAVE = new Set<keyof CamposFinancierosDetectados>(["rfc", "total", "fechaDocumento"]);
const PESO_CLAVE = 2;
const PESO_SECUNDARIO = 1;

export function calcularConfianzaGlobal(campos: CamposFinancierosDetectados): number {
  let pesoTotal = 0;
  let ponderado = 0;
  for (const [clave, campo] of Object.entries(campos) as [keyof CamposFinancierosDetectados, { confianza: number }][]) {
    const peso = CAMPOS_CLAVE.has(clave) ? PESO_CLAVE : PESO_SECUNDARIO;
    pesoTotal += peso;
    ponderado += peso * campo.confianza;
  }
  return pesoTotal > 0 ? ponderado / pesoTotal : 0;
}
