import * as z from "zod";

// ---------------------------------------------------------------------------
// Infraestructura transversal de Arqento (Fase 1 — motor de lectura
// documental, septiembre/octubre 2026). Vive fuera de cualquier módulo de
// negocio: nunca importa ni conoce Egreso/GastoObra/Factura/DocumentoEgreso.
// Contabilidad (y después Compras/Control de Obra/Contratos) consumen estos
// tipos genéricos y construyen SU PROPIO schema de dominio encima.
// ---------------------------------------------------------------------------

// Resultado mecánico de extraer texto de un archivo — nunca interpreta nada,
// solo responde "¿qué texto hay aquí, en cuántas páginas, es texto real o
// probablemente un escaneo sin capa de texto?".
export const ExtraccionTextoSchema = z.object({
  texto: z.string(),
  paginas: z.number().int().min(0),
  tieneTextoNativo: z.boolean(),
  caracteresPromedioPorPagina: z.number(),
});
export type ExtraccionTexto = z.infer<typeof ExtraccionTextoSchema>;

// Un campo detectado siempre viaja con su propia confianza — nunca se
// presenta un valor sin decir qué tan seguro está el motor de él. `valor:
// null` + `confianza: 0` significa "no se encontró", nunca se omite el campo.
function campoDetectado<T extends z.ZodTypeAny>(valorSchema: T) {
  return z.object({
    valor: valorSchema.nullable(),
    confianza: z.number().min(0).max(1),
  });
}
export type CampoDetectado<T> = { valor: T | null; confianza: number };

// Campos financieros genéricos de un documento mexicano (cotización, recibo,
// comprobante de transferencia) — deliberadamente SIN ningún concepto de
// Contabilidad (nada de "Egreso", "GastoObra", "clasificación contable").
// Reglas de detección: RFC, montos, IVA, fechas, referencias bancarias —
// genéricas al estándar mexicano, nunca específicas de un proveedor
// (Carga inteligente de documentos, Fase 1).
export const CamposFinancierosDetectadosSchema = z.object({
  proveedorNombre: campoDetectado(z.string()),
  rfc: campoDetectado(z.string()),
  folio: campoDetectado(z.string()),
  fechaDocumento: campoDetectado(z.string()), // ISO 8601 cuando se logra parsear
  subtotal: campoDetectado(z.number()),
  iva: campoDetectado(z.number()),
  total: campoDetectado(z.number()),
  moneda: campoDetectado(z.string()),
  referenciaBancaria: campoDetectado(z.string()),
  cuentaOrigen: campoDetectado(z.string()),
  cuentaDestino: campoDetectado(z.string()),
  conceptoBancario: campoDetectado(z.string()),
});
export type CamposFinancierosDetectados = z.infer<typeof CamposFinancierosDetectadosSchema>;

export const ResultadoProcesamientoSchema = z.object({
  textoExtraido: ExtraccionTextoSchema,
  campos: CamposFinancierosDetectadosSchema,
  confianzaGlobal: z.number().min(0).max(1),
  estrategiaUsada: z.literal("pdf-nativo"),
});
export type ResultadoProcesamiento = z.infer<typeof ResultadoProcesamientoSchema>;

// Contrato que cualquier estrategia de extracción de texto debe cumplir —
// hoy solo existe ExtractorPdfNativo; OCR/IA se agregan después
// implementando la misma forma, nunca cambiando quién la consume.
export interface ExtractorDeTexto {
  nombre: string;
  aplica(args: { tipoMime: string }): boolean;
  extraer(bytes: Buffer): Promise<ExtraccionTexto>;
}

// ---------------------------------------------------------------------------
// Fase 2 — interpretación estructurada con IA SOBRE TEXTO (nunca sobre el
// PDF/imagen original). Genérico a propósito: cualquier módulo trae su
// propio schema Zod + instrucciones; esta interfaz nunca sabe qué es un
// Egreso ni qué campos pide Contabilidad. El proveedor concreto (OpenAI,
// Google, Anthropic...) vive detrás de un adapter — nada fuera de
// lib/server/inteligencia/ debe importar el SDK de un proveedor directamente
// (Carga inteligente de documentos, Fase 2, benchmark de interpretación).
// ---------------------------------------------------------------------------
export type ResultadoInterpretacion<T> = {
  datos: T;
  tokensEntrada: number;
  tokensSalida: number;
  tokensRazonamiento: number | null; // null = el modelo no reporta este desglose
  duracionMs: number;
};

// Uso parcial conocido de una llamada que terminó fallando DESPUÉS de que el
// proveedor ya respondió (ej. su salida no pasó nuestra validación Zod) —
// en ese caso SÍ hay tokens/duración reales que registrar como consumo. Si
// la llamada nunca llegó a tener respuesta (red, auth, timeout), esto es
// null — nunca se inventa ni se estima (Master → Empresa → ARQENTO IA,
// V1.3, octubre 2026).
export type UsoParcialConocido = { tokensEntrada: number; tokensSalida: number; duracionMs: number } | null;

// Todo lo que lanza InterpretadorEstructurado.interpretar() debe ser esta
// clase (o envolverla) — así el llamador siempre puede distinguir "hubo
// respuesta del proveedor con uso real conocido" de "nunca hubo respuesta".
export class ErrorInterpretacion extends Error {
  constructor(
    message: string,
    public readonly usoParcial: UsoParcialConocido
  ) {
    super(message);
    this.name = "ErrorInterpretacion";
  }
}

export interface InterpretadorEstructurado {
  nombre: string; // ej. "openai-gpt-5-nano"
  interpretar<T>(args: {
    // `texto` e `imagenes` son modalidades alternativas (nunca se exige
    // ambas) — texto nativo sigue mandando solo texto; un documento sin
    // texto extraíble manda imagen(es) en su lugar, en la MISMA llamada,
    // nunca una segunda request (Carga inteligente de documentos, V1.2 —
    // estrategia VISION, octubre 2026).
    texto?: string;
    imagenes?: { base64: string; mimeType: string }[];
    schema: z.ZodType<T>;
    nombreSchema: string;
    instrucciones: string;
    // Texto opcional aportado por un humano junto con el documento — viaja
    // en la MISMA llamada, como un canal separado del documento (nunca se
    // mezcla con `texto`/`imagenes`). Qué hacer con él (nunca sobrescribir
    // hechos del documento, etc.) es responsabilidad de `instrucciones`, que
    // cada módulo de dominio redacta — este contrato genérico solo
    // transporta el texto (Carga inteligente de documentos, V1.1 — octubre
    // 2026).
    contextoUsuario?: string;
  }): Promise<ResultadoInterpretacion<T>>;
}
