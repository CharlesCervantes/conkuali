import "server-only";
import { XMLParser } from "fast-xml-parser";

// Lectura de CFDI 4.0 — el XML es SIEMPRE la fuente fiscal principal, nunca
// se lee el PDF por OCR (Contabilidad, septiembre 2026). `removeNSPrefix`
// quita los prefijos de namespace (cfdi:/tfd:) para no tener que hardcodear
// combinaciones de prefijo — el CFDI real puede traer prefijos distintos
// según el PAC que lo timbró, pero los nombres de nodo/atributo del estándar
// del SAT son siempre los mismos.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

export class CfdiInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "CfdiInvalidoError";
  }
}

// Mensaje explícito y distinto de "XML inválido" — nunca se debe confundir
// una Nota de Crédito real con un archivo corrupto (decisión de sesión,
// Contabilidad). TipoDeComprobante = "E" en el estándar del SAT significa
// "Egreso" (nota de crédito/rebaja) — nomenclatura del SAT, no la nuestra:
// no tiene relación con nuestro modelo `Egreso`.
export class CfdiNotaCreditoError extends Error {
  constructor() {
    super("Documento reconocido como Nota de Crédito. Este tipo de CFDI todavía no está soportado.");
    this.name = "CfdiNotaCreditoError";
  }
}

export type DatosCfdi = {
  uuid: string;
  rfcEmisor: string;
  razonSocialEmisor: string;
  rfcReceptor: string;
  razonSocialReceptor: string | null;
  fechaEmision: Date;
  subtotal: number;
  totalImpuestos: number;
  total: number;
  moneda: string;
  metodoPago: string | null;
  formaPago: string | null;
  serie: string | null;
  folio: string | null;
};

// Complemento puede traer más de un hijo (TimbreFiscalDigital y otros) — con
// removeNSPrefix, si hay un único TimbreFiscalDigital fast-xml-parser lo deja
// como objeto directo; si por alguna razón viniera más de uno (no debería en
// un CFDI válido), se toma el primero.
function extraerTimbre(complemento: unknown): Record<string, unknown> | null {
  if (!complemento || typeof complemento !== "object") return null;
  const nodo = (complemento as Record<string, unknown>).TimbreFiscalDigital;
  if (!nodo) return null;
  return Array.isArray(nodo) ? (nodo[0] ?? null) : (nodo as Record<string, unknown>);
}

function numero(valor: unknown, porDefecto = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim().length > 0 ? valor.trim() : null;
}

// Parsea y valida un CFDI — lanza CfdiInvalidoError (archivo corrupto/no es
// un CFDI/sin timbrar) o CfdiNotaCreditoError (tipo E, fuera de alcance V1).
// Nunca devuelve datos parciales: o el CFDI es válido y soportado, o lanza.
export function parsearCfdi(xml: string): DatosCfdi {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new CfdiInvalidoError("El archivo no es un XML válido.");
  }

  const comprobante = doc.Comprobante as Record<string, unknown> | undefined;
  if (!comprobante || typeof comprobante !== "object") {
    throw new CfdiInvalidoError("El archivo no tiene la estructura de un CFDI (falta el nodo Comprobante).");
  }

  const tipoComprobante = texto(comprobante["@_TipoDeComprobante"]);
  if (tipoComprobante === "E") throw new CfdiNotaCreditoError();
  if (tipoComprobante !== "I") {
    throw new CfdiInvalidoError(
      `Tipo de comprobante "${tipoComprobante ?? "desconocido"}" no soportado todavía — solo CFDI de Ingreso (I).`
    );
  }

  const timbre = extraerTimbre(comprobante.Complemento);
  const uuid = texto(timbre?.["@_UUID"]);
  if (!uuid) {
    throw new CfdiInvalidoError("El CFDI no está timbrado (falta el UUID del Timbre Fiscal Digital).");
  }

  const emisor = comprobante.Emisor as Record<string, unknown> | undefined;
  const receptor = comprobante.Receptor as Record<string, unknown> | undefined;
  const rfcEmisor = texto(emisor?.["@_Rfc"]);
  const rfcReceptor = texto(receptor?.["@_Rfc"]);
  const fechaCruda = texto(comprobante["@_Fecha"]);
  const total = comprobante["@_Total"];
  const subtotal = comprobante["@_SubTotal"];
  const moneda = texto(comprobante["@_Moneda"]);

  if (!rfcEmisor || !rfcReceptor || !fechaCruda || total === undefined || subtotal === undefined || !moneda) {
    throw new CfdiInvalidoError("El CFDI no trae todos los campos obligatorios (RFC, fecha, montos, moneda).");
  }

  const impuestos = comprobante.Impuestos as Record<string, unknown> | undefined;

  return {
    uuid,
    rfcEmisor,
    razonSocialEmisor: texto(emisor?.["@_Nombre"]) ?? rfcEmisor,
    rfcReceptor,
    razonSocialReceptor: texto(receptor?.["@_Nombre"]),
    fechaEmision: new Date(fechaCruda),
    subtotal: numero(subtotal),
    totalImpuestos: numero(impuestos?.["@_TotalImpuestosTrasladados"]),
    total: numero(total),
    moneda,
    metodoPago: texto(comprobante["@_MetodoPago"]),
    formaPago: texto(comprobante["@_FormaPago"]),
    serie: texto(comprobante["@_Serie"]),
    folio: texto(comprobante["@_Folio"]),
  };
}
