// Rango Unicode de marcas diacriticas combinantes (acentos sueltos tras
// normalize("NFD")) -- construido con new RegExp + \\u para no meter bytes
// no-ASCII en este archivo.
const MARCAS_DIACRITICAS = new RegExp("[\\u0300-\\u036f]", "g");

// Los nombres de recibo/semana existentes son ASCII por construccion (folio
// generado, "Semana N-AAAA"), asi que el Content-Disposition de esas rutas
// nunca necesito sanitizar. El nombre del proyecto si puede traer espacios y
// acentos -- esto evita un Content-Disposition invalido/roto.
export function sanitizarNombreArchivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
