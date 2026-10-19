// Validadores y normalizadores GENÉRICOS para campos financieros mexicanos
// (RFC, cuentas/CLABE, folios, montos, referencias) — reutilizables por
// cualquier módulo que reconcilie datos de documentos mexicanos, no solo
// Contabilidad/Egresos. Un valor que no pasa su validador nunca llega a
// CONFIRMADO en el reconciliador, sin importar si ambas fuentes "coinciden"
// en él (Carga inteligente de documentos, V1 — octubre 2026).

export function formatoRfcValido(v: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v.toUpperCase().replace(/\s/g, ""));
}

// Acepta una CLABE completa (18 dígitos) o una cuenta enmascarada tipo
// "****1234"/"*0017" — rechaza cualquier texto (ej. una etiqueta de
// documento como "Cuenta Origen" nunca pasa esta validación).
export function formatoCuentaValido(v: string): boolean {
  const limpio = v.toUpperCase().trim().replace(/\s/g, "");
  if (/^\d{18}$/.test(limpio)) return true;
  if (/^\*{1,6}\d{3,6}$/.test(limpio)) return true;
  return false;
}

// Un folio/número de cotización SIEMPRE contiene al menos un dígito — nunca
// un nombre de persona (hallazgo real de los benchmarks de esta misma
// sesión: sin este filtro, un nombre propio podía colarse como folio).
export function formatoFolioValido(v: string): boolean {
  const limpio = v.trim();
  if (limpio.length === 0 || limpio.length > 20) return false;
  return /\d/.test(limpio);
}

export function formatoMontoValido(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v < 100_000_000;
}

export function formatoReferenciaValido(v: string): boolean {
  return /^[A-Z0-9]{4,30}$/i.test(v.trim());
}

export function normalizarRfc(v: string): string {
  return v.toUpperCase().replace(/\s/g, "");
}

// Compara por los últimos 4 dígitos — la fuente más completa (CLABE de 18
// dígitos) y la más parca (terminación enmascarada) deben poder coincidir
// sobre el terreno común que ambas sí pueden mostrar.
export function normalizarCuenta(v: string): string {
  const digitos = v.replace(/\D/g, "");
  return digitos.length >= 4 ? digitos.slice(-4) : v.toUpperCase().trim();
}

export function normalizarFolio(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizarMonto(v: number): number {
  return Math.round(v * 100) / 100;
}

export function normalizarReferencia(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const MESES_ES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

// Convierte una fecha reportada por la IA (en el formato en que apareció en
// el documento — nunca se le pide inventar un ISO) a YYYY-MM-DD, el único
// formato que un <input type="date"> acepta como valor prellenado; cualquier
// otro formato queda simplemente invisible/vacío en el formulario sin avisar
// (hallazgo real de uso, octubre 2026). Nunca inventa una fecha: si no
// reconoce el formato, regresa null y el usuario la completa a mano — igual
// que el resto de los campos de esta función.
export function normalizarFechaAIso(fechaCruda: string | null): string | null {
  if (!fechaCruda) return null;
  const texto = fechaCruda.trim();

  const isoDirecto = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDirecto) return `${isoDirecto[1]}-${isoDirecto[2]}-${isoDirecto[3]}`;

  // DD/MM/YYYY o DD-MM-YYYY — convención mexicana.
  const numerico = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numerico) {
    const [, d, m, y] = numerico;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  // "6 de octubre de 2026" / "6 de octubre del 2026".
  const normalizado = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const textual = normalizado.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+(?:de|del)\s+(\d{4})$/);
  if (textual) {
    const [, d, mesNombre, y] = textual;
    const mes = MESES_ES[mesNombre];
    if (mes) return `${y}-${mes}-${d.padStart(2, "0")}`;
  }

  return null;
}

// Consistencia aritmética subtotal + IVA = total — un tercer validador
// independiente de las dos fuentes: dos fuentes pueden "coincidir" en un
// trío de montos que simplemente no cuadra entre sí, y eso también debe
// bloquear CONFIRMADO.
export function validarConsistenciaMontos(args: {
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  toleranciaCentavos?: number;
}): boolean | null {
  const { subtotal, iva, total, toleranciaCentavos = 0.02 } = args;
  if (subtotal === null || iva === null || total === null) return null; // no hay trío completo que validar
  return Math.abs(subtotal + iva - total) <= toleranciaCentavos;
}
