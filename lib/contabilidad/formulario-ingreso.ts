import { prefijoOriginal } from "./formulario-egreso";

// Formularios de Contabilidad → Ingresos (corrección de pérdida de datos,
// octubre 2026) — traduce el FormData al contrato de actualización parcial
// de guardarDecoracionIngreso / editarIngresoManual, con el mismo criterio
// que Egresos (formulario-egreso.ts):
// - el formulario precarga los valores actuales y envía, junto a cada campo,
//   su valor original en un campo oculto `original:<campo>`;
// - un campo que el usuario no cambió se OMITE (el servidor conserva lo
//   guardado, sin reescribirlo ni normalizar su fecha/hora);
// - un campo que el usuario vació se envía como null (borrado explícito);
// - un campo con valor nuevo se envía tal cual;
// - un campo que el formulario no muestra (no viene en el FormData) se omite
//   siempre — nunca se modifica algo que no se ve.
// Casillas de verificación: el navegador no envía una casilla desmarcada,
// así que su presencia se conoce por el campo oculto `original:<campo>`
// ("true"/"false"); sin él (registro nuevo) la casilla vale lo que muestra.

export { prefijoOriginal };

// Datos fiscales de un pago de cliente (decoración de MovimientoFinancieroCliente).
export const CAMPOS_DECORACION_INGRESO = ["clienteNombre", "metodoIngreso", "cuentaReceptoraId", "facturaId", "comentarios"] as const;
// Ingreso manual: además de los campos de la decoración, sus datos propios.
export const CAMPOS_INGRESO_MANUAL = [
  ...CAMPOS_DECORACION_INGRESO,
  "fecha",
  "concepto",
  "monto",
  "proyectoId",
  "clasificacionManual",
  "fechaCobro",
  "referencia",
] as const;
export const CASILLAS_INGRESO = ["facturaEsperada"] as const;

function texto(valor: FormDataEntryValue | null): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t.length > 0 ? t : null;
}

export function cambiosDesdeFormulario(
  formData: FormData,
  campos: readonly string[],
  casillas: readonly string[] = CASILLAS_INGRESO
): Record<string, string | boolean | null> {
  const datos: Record<string, string | boolean | null> = {};
  for (const campo of campos) {
    if (!formData.has(campo)) continue;
    const valor = texto(formData.get(campo));
    const llaveOriginal = prefijoOriginal(campo);
    if (formData.has(llaveOriginal) && valor === texto(formData.get(llaveOriginal))) continue;
    datos[campo] = valor;
  }
  for (const casilla of casillas) {
    const marcada = formData.get(casilla) === "on";
    const llaveOriginal = prefijoOriginal(casilla);
    if (formData.has(llaveOriginal)) {
      if (marcada === (formData.get(llaveOriginal) === "true")) continue;
    }
    datos[casilla] = marcada;
  }
  return datos;
}

export const decoracionIngresoDesdeFormulario = (formData: FormData) => cambiosDesdeFormulario(formData, CAMPOS_DECORACION_INGRESO);
export const ingresoManualDesdeFormulario = (formData: FormData) => cambiosDesdeFormulario(formData, CAMPOS_INGRESO_MANUAL);
