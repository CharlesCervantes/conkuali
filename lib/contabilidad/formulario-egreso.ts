// Formulario "Datos fiscales del gasto" (Contabilidad → Egresos) — traduce
// el FormData al contrato de actualización parcial de guardarDecoracionEgreso
// (octubre 2026):
// - el formulario precarga los valores actuales y envía, junto a cada campo,
//   su valor original en un campo oculto `original:<campo>`;
// - un campo que el usuario no cambió se OMITE (el servidor conserva lo
//   guardado, aunque mientras tanto otra persona lo haya modificado o el
//   <select> no pueda mostrar la opción actual);
// - un campo que el usuario vació se envía como null (borrado explícito);
// - un campo con valor nuevo se envía tal cual.
// Sin campo `original:` (formulario sin registro previo) se envía todo.

export const CAMPOS_FORMULARIO_DECORACION = [
  "medioFinancieroId",
  "facturaId",
  "notasContables",
  "fechaPago",
  "referenciaPago",
] as const;

export const prefijoOriginal = (campo: string) => `original:${campo}`;

function texto(valor: FormDataEntryValue | null): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t.length > 0 ? t : null;
}

export function decoracionEgresoDesdeFormulario(formData: FormData): Record<string, string | null> {
  const datos: Record<string, string | null> = {};
  for (const campo of CAMPOS_FORMULARIO_DECORACION) {
    if (!formData.has(campo)) continue;
    const valor = texto(formData.get(campo));
    const llaveOriginal = prefijoOriginal(campo);
    if (formData.has(llaveOriginal) && valor === texto(formData.get(llaveOriginal))) continue;
    datos[campo] = valor;
  }
  return datos;
}
