import "server-only";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";

// Renderizado GENÉRICO de un documento a imagen(es) para análisis visual —
// nunca conoce Contabilidad ni ningún otro módulo. Toda la rasterización
// ocurre AQUÍ, bajo nuestro control: nunca se manda un PDF/imagen original
// de resolución arbitraria a un proveedor de IA (Carga inteligente de
// documentos, V1.2 — estrategia VISION, octubre 2026).
//
// pdfjs-dist 5.x ya trae su propio NodeCanvasFactory que usa @napi-rs/canvas
// internamente cuando detecta un entorno Node (ver
// node_modules/pdfjs-dist/legacy/build/pdf.mjs) — no hace falta implementar
// una factory propia, basta con no pasar `canvasFactory` explícito.

export type ImagenRenderizada = { base64: string; mimeType: "image/jpeg" | "image/png" };

// Lado largo objetivo por imagen — balance entre legibilidad de texto
// pequeño (RFC, folios, montos) y costo/tokens de la llamada visual. Valor
// deliberadamente conservador para la primera medición; se ajusta según lo
// que el benchmark real muestre.
const DIMENSION_MAXIMA_PX = 1536;
const CALIDAD_JPEG = 80;

function bufferDesdeCanvas(canvas: Canvas): ImagenRenderizada {
  const buffer = canvas.toBuffer("image/jpeg", CALIDAD_JPEG);
  return { base64: buffer.toString("base64"), mimeType: "image/jpeg" };
}

// Renderiza hasta `maxPaginas` páginas de un PDF a imágenes JPEG — nunca
// todas las páginas de un documento arbitrariamente largo (ver
// MAX_PAGINAS_VISION en reconciliar-egreso.ts).
export async function renderizarPaginasPdf(bytes: Buffer, maxPaginas: number): Promise<ImagenRenderizada[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const documento = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const totalPaginas = Math.min(documento.numPages, maxPaginas);
  const imagenes: ImagenRenderizada[] = [];

  try {
    for (let numero = 1; numero <= totalPaginas; numero++) {
      const pagina = await documento.getPage(numero);
      try {
        const viewportBase = pagina.getViewport({ scale: 1 });
        // Nunca sobre-escalar un documento ya pequeño — el tope de escala
        // en 3x evita páginas minúsculas (ej. un ticket) volverse enormes.
        const escala = Math.min(DIMENSION_MAXIMA_PX / Math.max(viewportBase.width, viewportBase.height), 3);
        const viewport = pagina.getViewport({ scale: escala });

        // El tipo de pdfjs-dist para canvasFactory es un `Object` genérico
        // (deliberadamente — soporta tanto DOM como Node) — el método
        // `.create()` sí existe en tiempo de ejecución (BaseCanvasFactory).
        const fabricaCanvas = documento.canvasFactory as { create(w: number, h: number): { canvas: Canvas; context: CanvasRenderingContext2D } };
        const { canvas, context } = fabricaCanvas.create(viewport.width, viewport.height);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipos de pdfjs-dist no exponen Canvas de @napi-rs/canvas
        await pagina.render({ canvas: canvas as any, canvasContext: context, viewport }).promise;
        imagenes.push(bufferDesdeCanvas(canvas));
      } finally {
        pagina.cleanup();
      }
    }
  } finally {
    await documento.destroy();
  }

  return imagenes;
}

// Reescala una imagen JPG/PNG subida directamente solo si excede el límite
// — nunca la agranda si ya es pequeña.
export async function prepararImagenParaVision(bytes: Buffer, tipoMime: string): Promise<ImagenRenderizada> {
  const imagen = await loadImage(bytes);
  const ladoMayor = Math.max(imagen.width, imagen.height);

  // Ya cabe en el límite — se manda tal cual, SIN reempaquetar (conserva su
  // mimeType real; reempaquetar como JPEG aquí perdería calidad sin motivo
  // y, peor, etiquetar mal el mimeType rompería la decodificación del lado
  // del proveedor).
  if (ladoMayor <= DIMENSION_MAXIMA_PX && (tipoMime === "image/png" || tipoMime === "image/jpeg")) {
    return { base64: bytes.toString("base64"), mimeType: tipoMime };
  }

  const escala = Math.min(DIMENSION_MAXIMA_PX / ladoMayor, 1);
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);
  const canvas = createCanvas(ancho, alto);
  const contexto = canvas.getContext("2d");
  contexto.drawImage(imagen, 0, 0, ancho, alto);
  return bufferDesdeCanvas(canvas);
}
