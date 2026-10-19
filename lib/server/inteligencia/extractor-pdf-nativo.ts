import "server-only";
import { PDFParse } from "pdf-parse";
import type { ExtraccionTexto, ExtractorDeTexto } from "./tipos";

// Extracción MECÁNICA de texto de un PDF — nunca interpreta campos de
// negocio, solo responde "qué texto hay, en cuántas páginas, parece tener
// capa de texto real o es probablemente un escaneo/imagen sin texto"
// (Carga inteligente de documentos, Fase 1). Separado a propósito de
// interprete-financiero-mx.ts, que sí interpreta — nunca se mezclan en el
// mismo archivo.
//
// Umbral: menos de este promedio de caracteres por página casi siempre
// significa que el PDF es una imagen/escaneo sin capa de texto extraíble
// (pdf.js solo encuentra ruido o nada) — no es una medición exacta, es una
// señal para decidir si hace falta OCR (fuera de alcance de esta fase).
const UMBRAL_CARACTERES_POR_PAGINA = 20;

export async function extraerTextoPdfNativo(bytes: Buffer): Promise<ExtraccionTexto> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const resultado = await parser.getText();
    const paginas = resultado.total;
    const texto = resultado.text ?? "";
    const caracteresPromedioPorPagina = paginas > 0 ? texto.length / paginas : 0;

    return {
      texto,
      paginas,
      tieneTextoNativo: caracteresPromedioPorPagina >= UMBRAL_CARACTERES_POR_PAGINA,
      caracteresPromedioPorPagina,
    };
  } finally {
    await parser.destroy();
  }
}

export const extractorPdfNativo: ExtractorDeTexto = {
  nombre: "pdf-nativo",
  aplica: ({ tipoMime }) => tipoMime === "application/pdf",
  extraer: extraerTextoPdfNativo,
};
