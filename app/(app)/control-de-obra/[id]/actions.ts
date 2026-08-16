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
  revalidatePath(`/control-de-obra/${proyectoId}/partidas`);
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
  revalidatePath(`/control-de-obra/${proyectoId}/partidas`);
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
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
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

  revalidatePath(`/control-de-obra/${proyectoId}/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
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
  revalidatePath(`/control-de-obra/${proyectoId}/avance`);
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
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
  revalidatePath(`/control-de-obra/${proyectoId}/contrato-privado`);
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
  revalidatePath(`/control-de-obra/${proyectoId}/partidas`);
  revalidatePath(`/control-de-obra/${proyectoId}/contrato-privado`);
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
  revalidatePath(`/control-de-obra/${proyectoId}/contratistas`);
  return undefined;
}
