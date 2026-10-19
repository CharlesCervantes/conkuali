import "server-only";
import type { CampoDetectado, CamposFinancierosDetectados } from "./tipos";

// ---------------------------------------------------------------------------
// Interpretación de campos financieros a partir de texto plano — SIEMPRE
// separado de la extracción mecánica (extractor-pdf-nativo.ts). Reglas
// GENÉRICAS para documentos mexicanos (RFC, importes, IVA, fechas,
// referencias bancarias) — deliberadamente sin ningún caso particular de un
// proveedor real (Carga inteligente de documentos, Fase 1). Si una regla
// necesitara el nombre de un proveedor específico para funcionar, esa regla
// no pertenece aquí.
// ---------------------------------------------------------------------------

function vacio<T>(): CampoDetectado<T> {
  return { valor: null, confianza: 0 };
}

function detectado<T>(valor: T, confianza: number): CampoDetectado<T> {
  return { valor, confianza };
}

// RFC mexicano — persona moral (12: 3 letras/& + 6 dígitos + 3 alfanuméricos)
// o persona física (13: 4 letras + 6 dígitos + 3 alfanuméricos). Patrón del
// estándar del SAT, no de ningún documento particular.
const RFC_REGEX = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/g;

function detectarRfc(texto: string): CampoDetectado<string> {
  const coincidencias = [...texto.toUpperCase().matchAll(RFC_REGEX)].map((m) => m[1]);
  const unicos = [...new Set(coincidencias)];
  if (unicos.length === 0) return vacio();
  if (unicos.length === 1) return detectado(unicos[0], 0.9);
  // Varios RFC distintos (emisor + receptor, por ejemplo) — se reporta el
  // primero que aparece, pero con confianza reducida por la ambigüedad.
  return detectado(unicos[0], 0.5);
}

// Montos con formato mexicano: $12,345.67 / 12,345.67 / 12345.67
const MONTO_REGEX = /\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/g;

function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/\$/g, "").replace(/,/g, "").trim();
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// Busca un monto cerca de una palabra clave, dentro de una ventana de
// caracteres a la derecha de esa palabra en la MISMA línea — evita capturar
// un monto que en realidad pertenece a otra etiqueta de la misma página.
function detectarMontoPorEtiqueta(lineas: string[], etiquetas: RegExp): CampoDetectado<number> {
  const candidatos: number[] = [];
  for (const linea of lineas) {
    if (!etiquetas.test(linea)) continue;
    etiquetas.lastIndex = 0;
    const resto = linea.replace(etiquetas, "");
    const match = resto.match(MONTO_REGEX);
    if (match) {
      const monto = parsearMonto(match[0]);
      if (monto !== null) candidatos.push(monto);
    }
  }
  if (candidatos.length === 0) return vacio();
  if (candidatos.length === 1) return detectado(candidatos[0], 0.85);
  // Mismo monto repetido varias veces (encabezado + total, por ejemplo) no es
  // ambigüedad real.
  const unicos = [...new Set(candidatos)];
  if (unicos.length === 1) return detectado(unicos[0], 0.85);
  return detectado(candidatos[0], 0.5);
}

const ETIQUETA_SUBTOTAL = /\bsub\s*-?\s*total\b/i;
// Nunca cuando en realidad es "subtotal" (se evalúa subtotal primero y se
// excluye esa línea más abajo).
const ETIQUETA_TOTAL = /\btotal\b/i;
// "Importe" es el término estándar que usan los comprobantes bancarios
// mexicanos (SPEI) en vez de "Total" (hallazgo real del benchmark: sin este
// sinónimo, ningún comprobante de transferencia detectaba el monto). Se
// prueba SOLO si "total" no apareció en ningún lado — "importe" también se
// usa como encabezado de columna en el detalle de una cotización (cantidad ×
// precio unitario = importe por línea), así que mezclarlo con "total" desde
// el inicio generaba ambigüedad falsa en documentos que tienen ambas
// palabras (otro hallazgo real del benchmark).
const ETIQUETA_IMPORTE = /\bimporte\b/i;
const ETIQUETA_IVA = /\bi\.?\s?v\.?\s?a\.?\b/i;

function detectarMontos(texto: string): Pick<CamposFinancierosDetectados, "subtotal" | "iva" | "total"> {
  const lineas = texto.split(/\r?\n/);
  const subtotal = detectarMontoPorEtiqueta(lineas, ETIQUETA_SUBTOTAL);
  const iva = detectarMontoPorEtiqueta(lineas, ETIQUETA_IVA);
  const lineasSinSubtotal = lineas.filter((l) => !ETIQUETA_SUBTOTAL.test(l));
  const totalPorEtiqueta = detectarMontoPorEtiqueta(lineasSinSubtotal, ETIQUETA_TOTAL);
  const total = totalPorEtiqueta.valor !== null ? totalPorEtiqueta : detectarMontoPorEtiqueta(lineasSinSubtotal, ETIQUETA_IMPORTE);
  return { subtotal, iva, total };
}

// Fechas: DD/MM/YYYY, DD-MM-YYYY, o "DD de MES de YYYY" en español —
// formatos genéricos usados en México, no de un documento particular.
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const FECHA_NUMERICA_REGEX = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/;
const FECHA_TEXTO_REGEX = new RegExp(
  `\\b(\\d{1,2})\\s+de\\s+(${MESES.join("|")})\\s+de\\s+(\\d{4})\\b`,
  "i"
);

function aIso(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.toISOString().slice(0, 10);
}

function detectarFecha(texto: string): CampoDetectado<string> {
  const matchTexto = texto.match(FECHA_TEXTO_REGEX);
  if (matchTexto) {
    const dia = Number(matchTexto[1]);
    const mes = MESES.indexOf(matchTexto[2].toLowerCase()) + 1;
    const anio = Number(matchTexto[3]);
    const iso = aIso(anio, mes, dia);
    if (iso) return detectado(iso, 0.85);
  }
  const matchNumerico = texto.match(FECHA_NUMERICA_REGEX);
  if (matchNumerico) {
    const dia = Number(matchNumerico[1]);
    const mes = Number(matchNumerico[2]);
    let anio = Number(matchNumerico[3]);
    if (anio < 100) anio += 2000;
    const iso = aIso(anio, mes, dia);
    if (iso) return detectado(iso, 0.7); // DD/MM vs MM/DD es ambiguo sin más contexto
  }
  return vacio();
}

// Folio — busca cerca de etiquetas genéricas de documento, nunca el nombre
// de un proveedor. El valor capturado es el primer token alfanumérico
// después de la etiqueta que de verdad "parece" un folio (contiene al menos
// un dígito) — sin este filtro, una oración común como "esta orden
// considera..." o una etiqueta de tabla repetida ("Folio Folio:") se
// capturaba a sí misma como si fuera el valor (hallazgo real del benchmark
// de la Fase 1, no específico de ningún proveedor).
const ETIQUETA_FOLIO_REGEX = /(?:cotizaci[oó]n|factura|folio|pedido|orden)\s*(?:no\.?|n[uú]mero|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{1,19})/gi;

function detectarFolio(texto: string): CampoDetectado<string> {
  for (const match of texto.matchAll(ETIQUETA_FOLIO_REGEX)) {
    const candidato = match[1];
    if (/\d/.test(candidato)) return detectado(candidato.toUpperCase(), 0.6);
  }
  return vacio();
}

// Referencia bancaria — "Clave de rastreo" es el término estándar de SPEI
// (Banco de México), independiente del banco emisor; "Referencia" es más
// genérico y menos confiable por sí solo.
const CLAVE_RASTREO_REGEX = /clave\s+de\s+rastreo\s*[:#]?\s*([A-Z0-9]{6,30})/i;
const REFERENCIA_REGEX = /\breferencia\s*[:#]?\s*(\d{4,20})/i;

function detectarReferenciaBancaria(texto: string): CampoDetectado<string> {
  const rastreo = texto.match(CLAVE_RASTREO_REGEX);
  if (rastreo) return detectado(rastreo[1], 0.9);
  const referencia = texto.match(REFERENCIA_REGEX);
  if (referencia) return detectado(referencia[1], 0.6);
  return vacio();
}

// Cuentas origen/destino — CLABE completa (18 dígitos) si aparece, o un
// fragmento/terminación cuando el documento la muestra enmascarada. Nunca se
// reporta una CLABE "completa" si no se encontraron exactamente 18 dígitos
// contiguos — evita falsos positivos de "coincidencia fuerte" más adelante
// en el matching (fuera de alcance de esta fase, pero la regla nace aquí).
const CLABE_REGEX = /\b(\d{18})\b/;
const TERMINACION_REGEX = /terminaci[oó]n\s*(?:en)?\s*[:#]?\s*(\d{3,6})/i;

function detectarCuenta(texto: string, etiquetas: RegExp): CampoDetectado<string> {
  const match = texto.match(etiquetas);
  if (!match) return vacio();
  // Se busca una CLABE completa o una terminación en una ventana después de
  // la etiqueta encontrada (hasta 60 caracteres, suficiente para "Cuenta
  // destino: BBVA 012345678901234567").
  const ventana = texto.slice(match.index ?? 0, (match.index ?? 0) + 80);
  const clabe = ventana.match(CLABE_REGEX);
  if (clabe) return detectado(clabe[1], 0.9);
  const terminacion = ventana.match(TERMINACION_REGEX);
  if (terminacion) return detectado(`****${terminacion[1]}`, 0.5);
  return vacio();
}

// Un documento que solo muestra "los datos bancarios para depositar" (ej.
// una cotización con una sola cuenta de depósito, sin distinguir
// origen/destino) hace que ambas búsquedas caigan en la misma ventana de
// texto y devuelvan el mismo número — no es una coincidencia real de que
// origen y destino sean la misma cuenta, es una señal de que el documento
// no las distingue. Se detecta y se degrada la confianza de ambas (hallazgo
// real del benchmark, genérico — no específico de ningún documento).
function detectarCuentas(texto: string): Pick<CamposFinancierosDetectados, "cuentaOrigen" | "cuentaDestino"> {
  const origen = detectarCuenta(texto, ETIQUETA_CUENTA_ORIGEN_REGEX);
  const destino = detectarCuenta(texto, ETIQUETA_CUENTA_DESTINO_REGEX);
  if (origen.valor !== null && origen.valor === destino.valor) {
    return {
      cuentaOrigen: detectado(origen.valor, origen.confianza * 0.4),
      cuentaDestino: detectado(destino.valor, destino.confianza * 0.4),
    };
  }
  return { cuentaOrigen: origen, cuentaDestino: destino };
}

const ETIQUETA_CUENTA_ORIGEN_REGEX = /cuenta\s+(?:origen|ordenante|emisor)/i;
const ETIQUETA_CUENTA_DESTINO_REGEX = /cuenta\s+(?:destino|beneficiario|receptora)/i;

// Concepto bancario — texto libre después de la etiqueta "Concepto", hasta
// el fin de línea (el formato estándar de un comprobante SPEI).
const CONCEPTO_REGEX = /concepto\s*[:#]?\s*(.{3,120})/i;

function detectarConceptoBancario(texto: string): CampoDetectado<string> {
  const match = texto.match(CONCEPTO_REGEX);
  if (!match) return vacio();
  return detectado(match[1].trim().split(/\r?\n/)[0], 0.6);
}

// Moneda — MXN por default (inmensa mayoría de los documentos de Conkuali);
// solo se marca otra cosa si aparece una mención explícita e inequívoca.
function detectarMoneda(texto: string): CampoDetectado<string> {
  if (/\bUSD\b|d[oó]lares/i.test(texto)) return detectado("USD", 0.7);
  return detectado("MXN", 0.5); // default razonable, no "detectado con certeza"
}

// Proveedor — la señal más débil de todas, deliberadamente: se busca cerca
// de etiquetas genéricas ("Proveedor", "Emisor", "Beneficiario", "Nombre"),
// nunca una lista de nombres conocidos. Si no hay etiqueta clara, no se
// adivina — queda para confirmación manual.
const ETIQUETA_PROVEEDOR_REGEX = /(?:proveedor|emisor|beneficiario|raz[oó]n\s+social)\s*[:#]?\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9&.,\- ]{2,60})/;

function detectarProveedorNombre(texto: string): CampoDetectado<string> {
  const match = texto.match(ETIQUETA_PROVEEDOR_REGEX);
  if (!match) return vacio();
  return detectado(match[1].trim(), 0.4);
}

export function interpretarCamposFinancierosMX(texto: string): CamposFinancierosDetectados {
  return {
    proveedorNombre: detectarProveedorNombre(texto),
    rfc: detectarRfc(texto),
    folio: detectarFolio(texto),
    fechaDocumento: detectarFecha(texto),
    ...detectarMontos(texto),
    moneda: detectarMoneda(texto),
    referenciaBancaria: detectarReferenciaBancaria(texto),
    ...detectarCuentas(texto),
    conceptoBancario: detectarConceptoBancario(texto),
  };
}
