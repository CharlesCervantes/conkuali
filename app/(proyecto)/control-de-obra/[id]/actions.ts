"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireSession } from "@/lib/server/auth/dal";
import {
  crearPartida,
  crearConcepto,
  crearContratoContratista,
  asignarConcepto,
  editarConceptoEstructural,
  editarConceptoPrivado,
  obtenerConceptoDetalle,
  RegistroNoEncontradoError,
} from "@/lib/server/control-de-obra/estructura-contractual";
import {
  guardarAvanceSemanal,
  cambiarEstatusAprobacionAvance,
} from "@/lib/server/control-de-obra/avance";
import {
  cerrarSemana,
  reabrirSemana,
} from "@/lib/server/control-de-obra/cierre-semana";
import {
  generarRecibo,
  registrarEvidenciaRecibo,
  obtenerDetalleCorte,
  type DetalleCorte,
} from "@/lib/server/control-de-obra/recibos";
import {
  emitirEstimacion,
  configurarIvaEstimacion,
  materializarEstimacionHistorica,
} from "@/lib/server/control-de-obra/estimacion-cliente";
import {
  registrarAportacionFondo,
  registrarPagoEstimacion,
  aplicarFondoAEstimacion,
} from "@/lib/server/control-de-obra/financiero-cliente";
import {
  crearGasto,
  editarGasto,
  enviarGastoARevision,
  aprobarGasto,
  rechazarGasto,
  registrarFacturaGasto,
} from "@/lib/server/control-de-obra/gastos";
import {
  crearOrdenCompra,
  editarOrdenCompra,
  autorizarOrdenCompra,
  rechazarOrdenCompra,
  cancelarOrdenCompra,
  generarGastoDesdeOrdenCompra,
} from "@/lib/server/control-de-obra/ordenes-compra";
import { subirArchivo } from "@/lib/server/archivos";
import {
  SinPermisoError,
  ProyectoNoEncontradoError,
  ValidacionError,
} from "@/lib/server/control-de-obra/proyectos";

export type FormState = { error?: string } | undefined;

function mensajeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Datos inválidos.";
  }
  if (
    error instanceof SinPermisoError ||
    error instanceof ProyectoNoEncontradoError ||
    error instanceof ValidacionError ||
    error instanceof RegistroNoEncontradoError
  ) {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}

function opcional(valor: FormDataEntryValue | null): string | null {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto.length > 0 ? texto : null;
}

export async function crearPartidaAction(
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await crearPartida(usuario, proyectoId, {
      nombre: formData.get("nombre"),
      orden: formData.get("orden") || 0,
      icono: opcional(formData.get("icono")),
      color: opcional(formData.get("color")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/contrato/general`);
  return undefined;
}

export async function crearConceptoAction(
  partidaId: string,
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await crearConcepto(usuario, partidaId, {
      descripcion: formData.get("descripcion"),
      unidad: formData.get("unidad"),
      cantidadContratada: formData.get("cantidadContratada"),
      notas: opcional(formData.get("notas")),
      precioUnitarioContratista: opcional(formData.get("precioUnitarioContratista")),
      precioUnitarioMateriales: opcional(formData.get("precioUnitarioMateriales")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/contrato/general`);
  return undefined;
}

export async function crearContratoAction(
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await crearContratoContratista(usuario, proyectoId, {
      beneficiarioId: opcional(formData.get("beneficiarioId")),
      nombreNuevoContratista: opcional(formData.get("nombreNuevoContratista")),
      numeroContrato: opcional(formData.get("numeroContrato")),
      descripcion: opcional(formData.get("descripcion")),
      fecha: opcional(formData.get("fecha")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/contratistas`);
  return undefined;
}

export type AvanceFormState = { error?: string; guardados?: number } | undefined;

const PREFIJO_CANTIDAD = "cantidad_";

export async function guardarAvanceAction(
  proyectoId: string,
  semanaId: string,
  _state: AvanceFormState,
  formData: FormData
): Promise<AvanceFormState> {
  const usuario = await requireSession();

  const filas = [...formData.entries()]
    .filter(([nombre]) => nombre.startsWith(PREFIJO_CANTIDAD))
    .map(([nombre, valor]) => ({
      conceptoId: nombre.slice(PREFIJO_CANTIDAD.length),
      cantidadEjecutada: valor,
    }));

  let resultado;
  try {
    resultado = await guardarAvanceSemanal(usuario, proyectoId, { semanaId, filas });
  } catch (error) {
    return { error: mensajeError(error) };
  }

  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/contratistas`);
  revalidatePath("/control-de-obra");
  return { guardados: resultado.guardados };
}

export async function cambiarEstatusAprobacionAvanceAction(
  proyectoId: string,
  conceptoId: string,
  semanaId: string,
  nuevoEstatus: "APROBADO" | "RECHAZADO"
) {
  const usuario = await requireSession();
  await cambiarEstatusAprobacionAvance(usuario, conceptoId, semanaId, nuevoEstatus);
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/contratistas`);
  revalidatePath("/control-de-obra");
}

// A diferencia de FormState (undefined en éxito), este estado sí distingue
// éxito de "todavía no se ha enviado" — con undefined en los dos casos,
// useActionState nunca detectaba que la acción había terminado bien (el
// formulario de edición se quedaba abierto, dando la impresión de que hacía
// falta guardar otra vez). Ver tabla-privada-editable.tsx / tabla-administracion-editable.tsx.
export type EditarConceptoPrivadoFormState = { error?: string; guardado?: boolean } | undefined;

export async function editarConceptoPrivadoAction(
  conceptoId: string,
  proyectoId: string,
  _state: EditarConceptoPrivadoFormState,
  formData: FormData
): Promise<EditarConceptoPrivadoFormState> {
  const usuario = await requireSession();
  try {
    await editarConceptoPrivado(usuario, conceptoId, {
      descripcionPrivado: opcional(formData.get("descripcionPrivado")),
      unidadPrivado: opcional(formData.get("unidadPrivado")),
      cantidadContratadaPrivado: opcional(formData.get("cantidadContratadaPrivado")),
      precioUnitarioContratistaPrivado: opcional(formData.get("precioUnitarioContratistaPrivado")),
      precioUnitarioIndirectos: opcional(formData.get("precioUnitarioIndirectos")),
      precioUnitarioHerramienta: opcional(formData.get("precioUnitarioHerramienta")),
      porcentajeUtilidad: opcional(formData.get("porcentajeUtilidad")),
      porcentajeAdministracion: opcional(formData.get("porcentajeAdministracion")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/contrato/privado`);
  return { guardado: true };
}

// ---------------------------------------------------------------------------
// Modal "editar concepto" — dos modos reales, cada uno con su propia acción
// de guardado: "operativo" (abierto desde Contrato General, solo
// editarConceptoEstructural) y "privado" (abierto desde Contrato General
// Priv., solo editarConceptoPrivado). El modal NUNCA mezcla los dos — abrir
// desde Contrato General no debe mostrar ni poder tocar nada de Privado
// (decisión de sesión, agosto 2026). obtenerConceptoDetalleAction sí regresa
// todos los campos (los necesitan las dos vistas para mostrar contexto de
// solo lectura), pero cada modo solo envía a guardar lo que le corresponde.
// ---------------------------------------------------------------------------

function numOrNull(valor: { toString(): string } | null): number | null {
  return valor === null ? null : Number(valor);
}

export type ConceptoDetalle = {
  id: string;
  descripcion: string;
  partidaNombre: string;
  unidad: string;
  cantidadContratada: number;
  notas: string | null;
  precioUnitarioContratista: number | null;
  precioUnitarioMateriales: number | null;
  precioUnitarioIndirectos: number | null;
  precioUnitarioHerramienta: number | null;
  porcentajeUtilidad: number | null;
  porcentajeAdministracion: number | null;
  precioUnitarioContratistaPrivado: number | null;
  descripcionPrivado: string | null;
  unidadPrivado: string | null;
  cantidadContratadaPrivado: number | null;
  esquemaContractual: "PRECIO_ALZADO" | "ADMINISTRACION" | null;
};

export type BitacoraEntrada = {
  id: string;
  accion: string;
  usuarioNombre: string | null;
  createdAt: string;
  // Snapshots completos del Concepto antes/después de la acción — ya vienen
  // como JSON plano (registrarAuditoria los guarda con JSON.stringify, así
  // que un Decimal como precioUnitarioContratista llega aquí como string,
  // p. ej. "150.00"). El modal calcula el diff campo por campo a partir de
  // esto, en vez de guardar una etiqueta genérica por acción.
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
};

// Se llama directamente desde el modal cliente (no vía <form>) — por eso
// regresa { concepto, bitacoraOperativo, bitacoraPrivado } o { error }, en
// vez del patrón FormState de useActionState. Todos los campos Decimal se
// convierten a number aquí mismo — no son serializables cruzando de Server
// Action a Client Component (igual que Avance de obra). Las dos bitácoras
// vienen separadas de obtenerConceptoDetalle — el modo "operativo" del modal
// solo debe pintar bitacoraOperativo y el modo "privado" solo bitacoraPrivado.
export async function obtenerConceptoDetalleAction(
  conceptoId: string
): Promise<
  | { concepto: ConceptoDetalle; bitacoraOperativo: BitacoraEntrada[]; bitacoraPrivado: BitacoraEntrada[] }
  | { error: string }
> {
  const usuario = await requireSession();
  try {
    const { concepto, bitacoraOperativo, bitacoraPrivado } = await obtenerConceptoDetalle(
      usuario,
      conceptoId
    );
    const mapBitacora = (b: typeof bitacoraOperativo): BitacoraEntrada[] =>
      b.map((entrada) => ({
        id: entrada.id,
        accion: entrada.accion,
        usuarioNombre: entrada.usuario?.nombre ?? null,
        createdAt: entrada.createdAt.toISOString(),
        valorAnterior: (entrada.valorAnterior as Record<string, unknown> | null) ?? null,
        valorNuevo: (entrada.valorNuevo as Record<string, unknown> | null) ?? null,
      }));
    return {
      concepto: {
        id: concepto.id,
        descripcion: concepto.descripcion,
        partidaNombre: concepto.partida.nombre,
        unidad: concepto.unidad,
        cantidadContratada: Number(concepto.cantidadContratada),
        notas: concepto.notas,
        precioUnitarioContratista: numOrNull(concepto.precioUnitarioContratista),
        precioUnitarioMateriales: numOrNull(concepto.precioUnitarioMateriales),
        precioUnitarioIndirectos: numOrNull(concepto.precioUnitarioIndirectos),
        precioUnitarioHerramienta: numOrNull(concepto.precioUnitarioHerramienta),
        porcentajeUtilidad: numOrNull(concepto.porcentajeUtilidad),
        porcentajeAdministracion: numOrNull(concepto.porcentajeAdministracion),
        precioUnitarioContratistaPrivado: numOrNull(concepto.precioUnitarioContratistaPrivado),
        descripcionPrivado: concepto.descripcionPrivado,
        unidadPrivado: concepto.unidadPrivado,
        cantidadContratadaPrivado: numOrNull(concepto.cantidadContratadaPrivado),
        esquemaContractual: concepto.partida.proyecto.esquemaContractual,
      },
      bitacoraOperativo: mapBitacora(bitacoraOperativo),
      bitacoraPrivado: mapBitacora(bitacoraPrivado),
    };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export type EditarConceptoEstructuralFormState = { error?: string; guardado?: boolean } | undefined;

// Modo "operativo" del modal — SOLO campos de Contrato General. Nunca toca
// ningún campo *Privado, Indirectos, Herramienta, %, ni override (eso es
// editarConceptoPrivadoAction, usado por el modo "privado").
export async function editarConceptoEstructuralAction(
  conceptoId: string,
  proyectoId: string,
  _state: EditarConceptoEstructuralFormState,
  formData: FormData
): Promise<EditarConceptoEstructuralFormState> {
  const usuario = await requireSession();
  try {
    await editarConceptoEstructural(usuario, conceptoId, {
      descripcion: formData.get("descripcion"),
      unidad: formData.get("unidad"),
      cantidadContratada: formData.get("cantidadContratada"),
      notas: opcional(formData.get("notas")),
      precioUnitarioContratista: opcional(formData.get("precioUnitarioContratista")),
      precioUnitarioMateriales: opcional(formData.get("precioUnitarioMateriales")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/contrato/general`);
  revalidatePath(`/control-de-obra/${proyectoId}/contrato/privado`);
  return { guardado: true };
}

export async function asignarConceptoAction(
  contratoId: string,
  proyectoId: string,
  _state: FormState,
  formData: FormData
): Promise<FormState> {
  const usuario = await requireSession();
  try {
    await asignarConcepto(usuario, contratoId, {
      conceptoId: formData.get("conceptoId"),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/contratistas`);
  return undefined;
}

// ---------------------------------------------------------------------------
// Cierre semanal de Avance de Obra
// ---------------------------------------------------------------------------

export type CerrarSemanaFormState = { error?: string; cerrado?: boolean } | undefined;

export async function cerrarSemanaAction(
  proyectoId: string,
  semanaId: string,
  _state: CerrarSemanaFormState,
  _formData: FormData
): Promise<CerrarSemanaFormState> {
  const usuario = await requireSession();
  try {
    await cerrarSemana(usuario, proyectoId, semanaId);
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/estimacion`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/control-contractual`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/estimacion`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/control-contractual`);
  revalidatePath("/reporte-general");
  return { cerrado: true };
}

export type ReabrirSemanaFormState = { error?: string; reabierta?: boolean } | undefined;

export async function reabrirSemanaAction(
  proyectoId: string,
  semanaId: string,
  _state: ReabrirSemanaFormState,
  formData: FormData
): Promise<ReabrirSemanaFormState> {
  const usuario = await requireSession();
  try {
    await reabrirSemana(usuario, proyectoId, semanaId, formData.get("motivo"));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/estimacion`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/control-contractual`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/estimacion`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/control-contractual`);
  return { reabierta: true };
}

// ---------------------------------------------------------------------------
// Recibos de pago
// ---------------------------------------------------------------------------

export type GenerarReciboFormState =
  | { error?: string; generado?: boolean; folio?: string }
  | undefined;

export async function generarReciboAction(
  corteSemanalId: string,
  proyectoId: string,
  _state: GenerarReciboFormState,
  _formData: FormData
): Promise<GenerarReciboFormState> {
  const usuario = await requireSession();
  try {
    const recibo = await generarRecibo(usuario, corteSemanalId);
    revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/contratistas`);
    return { generado: true, folio: recibo.folio };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

export type SubirEvidenciaReciboFormState = { error?: string; subido?: boolean } | undefined;

// Sube el archivo directo a Vercel Blob (Next.js ya soporta File en
// FormData nativamente en Server Actions, no hace falta ningún parser de
// multipart aparte) y solo entonces persiste la URL resultante.
export async function subirEvidenciaReciboAction(
  reciboId: string,
  proyectoId: string,
  _state: SubirEvidenciaReciboFormState,
  formData: FormData
): Promise<SubirEvidenciaReciboFormState> {
  const usuario = await requireSession();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona un archivo (PDF o imagen)." };
  }

  try {
    const { url, nombre } = await subirArchivo(`recibos/${reciboId}`, archivo);
    await registrarEvidenciaRecibo(usuario, reciboId, {
      archivoEvidenciaUrl: url,
      archivoEvidenciaNombre: nombre,
      fechaRecepcion: opcional(formData.get("fechaRecepcion")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/ejecucion/contratistas`);
  return { subido: true };
}

// Se llama directamente desde el modal cliente (no vía <form>) — mismo patrón
// que obtenerConceptoDetalleAction.
export async function obtenerDetalleCorteAction(
  corteSemanalId: string
): Promise<{ detalle: DetalleCorte } | { error: string }> {
  const usuario = await requireSession();
  try {
    const detalle = await obtenerDetalleCorte(usuario, corteSemanalId);
    return { detalle };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Estimación Cliente
// ---------------------------------------------------------------------------

export type EmitirEstimacionFormState = { error?: string; emitida?: boolean } | undefined;

export async function emitirEstimacionAction(
  proyectoId: string,
  estimacionId: string,
  _state: EmitirEstimacionFormState,
  formData: FormData
): Promise<EmitirEstimacionFormState> {
  const usuario = await requireSession();
  try {
    await emitirEstimacion(usuario, estimacionId, formData.get("aplicarFondo") === "on");
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/estimacion`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/control-contractual`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/estimacion`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/control-contractual`);
  return { emitida: true };
}

export type ConfigurarIvaFormState = { error?: string; guardado?: boolean } | undefined;

export async function configurarIvaEstimacionAction(
  proyectoId: string,
  estimacionId: string,
  _state: ConfigurarIvaFormState,
  formData: FormData
): Promise<ConfigurarIvaFormState> {
  const usuario = await requireSession();
  try {
    const aplicaIVA = formData.get("aplicaIVA") === "on";
    const porcentajeCrudo = opcional(formData.get("porcentajeIVA"));
    await configurarIvaEstimacion(usuario, estimacionId, {
      aplicaIVA,
      porcentajeIVA: aplicaIVA && porcentajeCrudo ? Number(porcentajeCrudo) : null,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/estimacion`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/estimacion`);
  return { guardado: true };
}

export type MaterializarEstimacionFormState =
  | { error?: string; generada?: boolean; yaExistia?: boolean }
  | undefined;

export async function materializarEstimacionHistoricaAction(
  proyectoId: string,
  semanaId: string,
  _state: MaterializarEstimacionFormState,
  _formData: FormData
): Promise<MaterializarEstimacionFormState> {
  const usuario = await requireSession();
  try {
    const resultado = await materializarEstimacionHistorica(usuario, proyectoId, semanaId);
    revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/estimacion`);
    revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/control-contractual`);
    revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/estimacion`);
    revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/control-contractual`);
    return { generada: true, yaExistia: resultado.yaExistia };
  } catch (error) {
    return { error: mensajeError(error) };
  }
}

// ---------------------------------------------------------------------------
// Control Contractual — esquema financiero del cliente
// ---------------------------------------------------------------------------

export type RegistrarAportacionFormState = { error?: string; registrada?: boolean } | undefined;

export async function registrarAportacionFondoAction(
  proyectoId: string,
  _state: RegistrarAportacionFormState,
  formData: FormData
): Promise<RegistrarAportacionFormState> {
  const usuario = await requireSession();
  try {
    await registrarAportacionFondo(usuario, proyectoId, {
      monto: formData.get("monto"),
      fecha: formData.get("fecha"),
      referencia: opcional(formData.get("referencia")),
      notas: opcional(formData.get("notas")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/control-contractual`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/control-contractual`);
  return { registrada: true };
}

export type RegistrarPagoFormState = { error?: string; registrado?: boolean } | undefined;

export async function registrarPagoEstimacionAction(
  proyectoId: string,
  estimacionId: string,
  _state: RegistrarPagoFormState,
  formData: FormData
): Promise<RegistrarPagoFormState> {
  const usuario = await requireSession();
  try {
    await registrarPagoEstimacion(usuario, estimacionId, {
      monto: formData.get("monto"),
      fecha: formData.get("fecha"),
      referencia: opcional(formData.get("referencia")),
      notas: opcional(formData.get("notas")),
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/control-contractual`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/control-contractual`);
  return { registrado: true };
}

export type AplicarFondoFormState = { error?: string; aplicado?: number } | undefined;

// Acción manual "Aplicar fondo" — decisión explícita de Administrador/
// Director, nunca automática (ver aplicarFondoAEstimacion). `monto` vacío =
// aplicar el máximo posible.
export async function aplicarFondoEstimacionAction(
  proyectoId: string,
  estimacionId: string,
  _state: AplicarFondoFormState,
  formData: FormData
): Promise<AplicarFondoFormState> {
  const usuario = await requireSession();
  let resultado;
  try {
    resultado = await aplicarFondoAEstimacion(
      usuario,
      estimacionId,
      opcional(formData.get("monto")) ?? undefined
    );
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/general/control-contractual`);
  revalidatePath(`/control-de-obra/${proyectoId}/cliente/privado/control-contractual`);
  return { aplicado: resultado.aplicado };
}

// ---------------------------------------------------------------------------
// Gastos de Obra — Gastos
// ---------------------------------------------------------------------------

function rutaReposiciones(proyectoId: string): string {
  return `/control-de-obra/${proyectoId}/ejecucion/gastos/reposiciones`;
}
function rutaOrdenesCompra(proyectoId: string): string {
  return `/control-de-obra/${proyectoId}/ejecucion/gastos/ordenes-compra`;
}

// Mismo patrón que detalleOCDesdeFormData (orden de compra) — un input
// hidden con JSON, porque un <form> nativo no soporta arreglos de objetos
// (captura multilínea de gastos, agosto 2026).
function detalleGastoDesdeFormData(formData: FormData): {
  descripcion: string;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
}[] {
  const raw = formData.get("detalle");
  if (typeof raw !== "string" || raw.length === 0) return [];
  return JSON.parse(raw);
}

function datosGastoDesdeFormData(formData: FormData) {
  return {
    fecha: formData.get("fecha"),
    descripcion: opcional(formData.get("descripcion")),
    categoria: formData.get("categoria"),
    monto: formData.get("monto"),
    metodoPago: formData.get("metodoPago"),
    quienPagoModo: formData.get("quienPagoModo") || "EMPRESA",
    pagadorBeneficiarioId: opcional(formData.get("pagadorBeneficiarioId")),
    proveedorBeneficiarioId: opcional(formData.get("proveedorBeneficiarioId")),
    comentario: opcional(formData.get("comentario")),
    requiereFactura: formData.get("requiereFactura") === "on",
    tratamientoCliente: formData.get("tratamientoCliente") || "NO_COBRABLE",
    detalle: detalleGastoDesdeFormData(formData),
  };
}

export type GastoFormState = { error?: string; guardado?: boolean } | undefined;

export async function crearGastoAction(
  proyectoId: string,
  semanaId: string,
  _state: GastoFormState,
  formData: FormData
): Promise<GastoFormState> {
  const usuario = await requireSession();
  try {
    let ticketUrl: string | null = null;
    let ticketNombre: string | null = null;
    const archivo = formData.get("ticket");
    if (archivo instanceof File && archivo.size > 0) {
      const subido = await subirArchivo(`gastos/${proyectoId}`, archivo);
      ticketUrl = subido.url;
      ticketNombre = subido.nombre;
    }
    await crearGasto(usuario, proyectoId, semanaId, {
      ...datosGastoDesdeFormData(formData),
      ticketUrl,
      ticketNombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaReposiciones(proyectoId));
  return { guardado: true };
}

export async function editarGastoAction(
  proyectoId: string,
  gastoId: string,
  _state: GastoFormState,
  formData: FormData
): Promise<GastoFormState> {
  const usuario = await requireSession();
  try {
    let ticketUrl: string | null = null;
    let ticketNombre: string | null = null;
    const archivo = formData.get("ticket");
    if (archivo instanceof File && archivo.size > 0) {
      const subido = await subirArchivo(`gastos/${proyectoId}`, archivo);
      ticketUrl = subido.url;
      ticketNombre = subido.nombre;
    }
    await editarGasto(usuario, gastoId, {
      ...datosGastoDesdeFormData(formData),
      ticketUrl,
      ticketNombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaReposiciones(proyectoId));
  return { guardado: true };
}

export async function enviarGastoARevisionAction(proyectoId: string, gastoId: string) {
  const usuario = await requireSession();
  await enviarGastoARevision(usuario, gastoId);
  revalidatePath(rutaReposiciones(proyectoId));
}

export type AprobarGastoFormState = { error?: string; aprobado?: boolean } | undefined;

export async function aprobarGastoAction(
  proyectoId: string,
  gastoId: string,
  _state: AprobarGastoFormState,
  _formData: FormData
): Promise<AprobarGastoFormState> {
  const usuario = await requireSession();
  try {
    await aprobarGasto(usuario, gastoId);
  } catch (error) {
    return { error: mensajeError(error) };
  }
  // Aprobar ya puede crear/reconciliar el MovimientoSemanal de la
  // reposición en la misma transacción — Reporte General también necesita
  // revalidarse, no solo la pantalla de Gastos (colapso de doble aprobación
  // Gastos→Reposiciones, agosto 2026).
  revalidatePath(rutaReposiciones(proyectoId));
  revalidatePath("/reporte-general");
  return { aprobado: true };
}

export type RechazarGastoFormState = { error?: string; rechazado?: boolean } | undefined;

export async function rechazarGastoAction(
  proyectoId: string,
  gastoId: string,
  _state: RechazarGastoFormState,
  formData: FormData
): Promise<RechazarGastoFormState> {
  const usuario = await requireSession();
  try {
    await rechazarGasto(usuario, gastoId, formData.get("motivo"));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaReposiciones(proyectoId));
  return { rechazado: true };
}

export async function subirFacturaGastoAction(
  proyectoId: string,
  gastoId: string,
  _state: GastoFormState,
  formData: FormData
): Promise<GastoFormState> {
  const usuario = await requireSession();
  const archivo = formData.get("factura");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona un archivo (PDF o imagen)." };
  }
  try {
    const subido = await subirArchivo(`gastos/${proyectoId}/facturas`, archivo);
    await registrarFacturaGasto(usuario, gastoId, {
      facturaUrl: subido.url,
      facturaNombre: subido.nombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaReposiciones(proyectoId));
  return { guardado: true };
}

// ---------------------------------------------------------------------------
// Gastos de Obra — Órdenes de Compra
// ---------------------------------------------------------------------------

function detalleOCDesdeFormData(formData: FormData): {
  concepto: string;
  descripcion: string | null;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
}[] {
  const raw = formData.get("detalle");
  if (typeof raw !== "string" || raw.length === 0) return [];
  return JSON.parse(raw);
}

function datosOCDesdeFormData(formData: FormData) {
  return {
    proveedorBeneficiarioId: formData.get("proveedorBeneficiarioId"),
    fecha: formData.get("fecha"),
    metodoPago: opcional(formData.get("metodoPago")),
    requiereFactura: formData.get("requiereFactura") === "on",
    notas: opcional(formData.get("notas")),
    tratamientoCliente: formData.get("tratamientoCliente") || "NO_COBRABLE",
    detalle: detalleOCDesdeFormData(formData),
  };
}

export type OrdenCompraFormState = { error?: string; guardada?: boolean } | undefined;

export async function crearOrdenCompraAction(
  proyectoId: string,
  semanaId: string,
  _state: OrdenCompraFormState,
  formData: FormData
): Promise<OrdenCompraFormState> {
  const usuario = await requireSession();
  try {
    await crearOrdenCompra(usuario, proyectoId, semanaId, datosOCDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaOrdenesCompra(proyectoId));
  return { guardada: true };
}

export async function editarOrdenCompraAction(
  proyectoId: string,
  ocId: string,
  _state: OrdenCompraFormState,
  formData: FormData
): Promise<OrdenCompraFormState> {
  const usuario = await requireSession();
  try {
    await editarOrdenCompra(usuario, ocId, datosOCDesdeFormData(formData));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaOrdenesCompra(proyectoId));
  return { guardada: true };
}

export async function autorizarOrdenCompraAction(
  proyectoId: string,
  ocId: string,
  _state: OrdenCompraFormState,
  _formData: FormData
): Promise<OrdenCompraFormState> {
  const usuario = await requireSession();
  try {
    await autorizarOrdenCompra(usuario, ocId);
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaOrdenesCompra(proyectoId));
  revalidatePath("/reporte-general");
  return { guardada: true };
}

export async function rechazarOrdenCompraAction(
  proyectoId: string,
  ocId: string,
  _state: OrdenCompraFormState,
  formData: FormData
): Promise<OrdenCompraFormState> {
  const usuario = await requireSession();
  try {
    await rechazarOrdenCompra(usuario, ocId, formData.get("motivo"));
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaOrdenesCompra(proyectoId));
  return { guardada: true };
}

export async function cancelarOrdenCompraAction(proyectoId: string, ocId: string) {
  const usuario = await requireSession();
  await cancelarOrdenCompra(usuario, ocId);
  revalidatePath(rutaOrdenesCompra(proyectoId));
}

export async function generarGastoDesdeOrdenCompraAction(
  proyectoId: string,
  ocId: string,
  _state: OrdenCompraFormState,
  formData: FormData
): Promise<OrdenCompraFormState> {
  const usuario = await requireSession();
  try {
    let comprobantePagoUrl: string | null = null;
    let comprobantePagoNombre: string | null = null;
    const archivo = formData.get("comprobantePago");
    if (archivo instanceof File && archivo.size > 0) {
      const subido = await subirArchivo(`ordenes-compra/${proyectoId}`, archivo);
      comprobantePagoUrl = subido.url;
      comprobantePagoNombre = subido.nombre;
    }
    await generarGastoDesdeOrdenCompra(usuario, ocId, {
      monto: formData.get("monto"),
      fecha: formData.get("fecha"),
      categoria: formData.get("categoria") || "MATERIAL",
      metodoPago: formData.get("metodoPago"),
      comentario: opcional(formData.get("comentario")),
      comprobantePagoUrl,
      comprobantePagoNombre,
    });
  } catch (error) {
    return { error: mensajeError(error) };
  }
  revalidatePath(rutaOrdenesCompra(proyectoId));
  revalidatePath(rutaReposiciones(proyectoId));
  return { guardada: true };
}
