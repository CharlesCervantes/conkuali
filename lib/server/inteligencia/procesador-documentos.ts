import "server-only";
import { extraerTextoPdfNativo } from "./extractor-pdf-nativo";
import { interpretarCamposFinancierosMX } from "./interprete-financiero-mx";
import { calcularConfianzaGlobal } from "./confianza";
import { ResultadoProcesamientoSchema, type ResultadoProcesamiento } from "./tipos";

// Fachada pública de la Fase 1 — lo único que un módulo de dominio (hoy
// ninguno todavía; después Contabilidad) necesitaría llamar para la ruta
// "PDF digital, sin servicio externo". No sabe qué es un Egreso ni un
// GastoObra — solo procesa bytes y devuelve campos financieros genéricos
// con su confianza. Toda salida se valida con Zod antes de devolverse,
// mismo principio que se usará para OCR/IA cuando se agreguen (fuera de
// alcance de esta fase).
export async function procesarDocumentoPdfNativo(bytes: Buffer): Promise<ResultadoProcesamiento> {
  const textoExtraido = await extraerTextoPdfNativo(bytes);
  const campos = interpretarCamposFinancierosMX(textoExtraido.texto);
  const confianzaGlobal = calcularConfianzaGlobal(campos);

  return ResultadoProcesamientoSchema.parse({
    textoExtraido,
    campos,
    confianzaGlobal,
    estrategiaUsada: "pdf-nativo",
  });
}
