import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeVerContabilidad, puedeRegistrarMovimientoContable, puedeCancelarRegistroContable } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError } from "@/lib/server/control-de-obra/proyectos";
import { RegistroNoEncontradoError } from "@/lib/server/control-de-obra/estructura-contractual";
import { EMPRESA_PROYECTO_LABEL } from "@/lib/server/control-de-obra/proyecto-oficina";

// Egreso decora un GastoObra existente (SIN duplicar monto/fecha/concepto/
// proyecto/pagador) o representa un egreso fiscal manual (gastoObraId null).
// Se crea perezosamente: la lista de Egresos de Contabilidad se arma leyendo
// GastoObra directo (fiscalmente elegible = requiereFactura = true) y
// decorando con la fila Egreso SI existe — nunca al revés (Contabilidad,
// septiembre 2026).

function requerirContabilidad(usuario: UsuarioSesion): string {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function rangoMes(anio: number, mes: number): { desde: Date; hasta: Date } {
  return { desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 1) };
}

// Aislamiento multiempresa (Preparación de Producción — Etapa 1, septiembre
// 2026) — toda referencia opcional que llegue del cliente (proyecto, medio
// financiero, factura) debe comprobarse contra la Empresa del usuario ANTES
// de vincularla, nunca confiarse tal cual. Mismo patrón ya usado en
// vincularFacturaAGasto/vincularFacturaAIngreso (facturas.ts) — aquí se
// reutiliza para los mismos tres campos donde antes faltaba.
async function validarReferenciasEgreso(
  empresaId: string,
  datos: { proyectoId?: string | null; medioFinancieroId?: string | null; facturaId?: string | null }
): Promise<void> {
  const [proyecto, medioFinanciero, factura] = await Promise.all([
    datos.proyectoId ? db.proyecto.findFirst({ where: { id: datos.proyectoId, empresaId }, select: { id: true } }) : null,
    datos.medioFinancieroId
      ? db.medioFinanciero.findFirst({ where: { id: datos.medioFinancieroId, empresaId }, select: { id: true } })
      : null,
    datos.facturaId ? db.factura.findFirst({ where: { id: datos.facturaId, empresaId }, select: { id: true } }) : null,
  ]);
  if (datos.proyectoId && !proyecto) throw new RegistroNoEncontradoError("El proyecto");
  if (datos.medioFinancieroId && !medioFinanciero) throw new RegistroNoEncontradoError("El medio financiero");
  if (datos.facturaId && !factura) throw new RegistroNoEncontradoError("La factura");
}

export type FilaEgreso = {
  // id del Egreso SI ya existe, o el id del GastoObra (prefijado) si todavía
  // es solo una fila proyectada — el llamador nunca debe confundir ambos con
  // el mismo espacio de ids.
  egresoId: string | null;
  gastoObraId: string | null;
  fecha: string;
  concepto: string;
  proyectoNombre: string | null;
  monto: number;
  medioFinancieroNombre: string | null;
  facturaId: string | null;
  facturaUuid: string | null;
  notasContables: string | null;
  estatus: "VIGENTE" | "CANCELADO";
};

export async function obtenerEgresos(
  usuario: UsuarioSesion,
  anio: number,
  mes: number
): Promise<FilaEgreso[]> {
  const empresaId = requerirContabilidad(usuario);
  const { desde, hasta } = rangoMes(anio, mes);

  const [gastosFiscales, egresosManuales] = await Promise.all([
    db.gastoObra.findMany({
      where: {
        empresaId,
        estatus: "APROBADO",
        requiereFactura: true,
        fecha: { gte: desde, lt: hasta },
      },
      include: {
        proyecto: { select: { nombre: true, tipo: true } },
        egreso: {
          include: {
            medioFinanciero: { select: { nombre: true } },
            factura: { select: { id: true, uuid: true } },
          },
        },
      },
      orderBy: { fecha: "desc" },
    }),
    db.egreso.findMany({
      where: { empresaId, gastoObraId: null, estatus: "VIGENTE", fecha: { gte: desde, lt: hasta } },
      include: {
        proyecto: { select: { nombre: true, tipo: true } },
        medioFinanciero: { select: { nombre: true } },
        factura: { select: { id: true, uuid: true } },
      },
      orderBy: { fecha: "desc" },
    }),
  ]);

  const filasDeGasto: FilaEgreso[] = gastosFiscales.map((g) => ({
    egresoId: g.egreso?.id ?? null,
    gastoObraId: g.id,
    fecha: g.fecha.toISOString(),
    concepto: g.descripcion,
    proyectoNombre: g.proyecto.tipo === "OFICINA" ? EMPRESA_PROYECTO_LABEL : g.proyecto.nombre,
    monto: Number(g.monto),
    medioFinancieroNombre: g.egreso?.medioFinanciero?.nombre ?? null,
    facturaId: g.egreso?.factura?.id ?? null,
    facturaUuid: g.egreso?.factura?.uuid ?? null,
    notasContables: g.egreso?.notasContables ?? null,
    estatus: g.egreso?.estatus ?? "VIGENTE",
  }));

  const filasManuales: FilaEgreso[] = egresosManuales.map((e) => ({
    egresoId: e.id,
    gastoObraId: null,
    fecha: (e.fecha ?? e.createdAt).toISOString(),
    concepto: e.concepto ?? "Egreso manual",
    proyectoNombre: e.proyecto ? (e.proyecto.tipo === "OFICINA" ? EMPRESA_PROYECTO_LABEL : e.proyecto.nombre) : null,
    monto: Number(e.monto ?? 0),
    medioFinancieroNombre: e.medioFinanciero?.nombre ?? null,
    facturaId: e.factura?.id ?? null,
    facturaUuid: e.factura?.uuid ?? null,
    notasContables: e.notasContables,
    estatus: e.estatus,
  }));

  return [...filasDeGasto, ...filasManuales].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

const DatosDecoracionSchema = z.object({
  medioFinancieroId: z.string().trim().optional().nullable(),
  facturaId: z.string().trim().optional().nullable(),
  notasContables: z.string().trim().optional().nullable(),
});

// Crea o actualiza la decoración fiscal de un GastoObra existente — nunca
// toca monto/fecha/concepto/proyecto/pagador del gasto.
export async function guardarDecoracionEgreso(
  usuario: UsuarioSesion,
  gastoObraId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const datos = DatosDecoracionSchema.parse(datosCrudos);

  const gasto = await db.gastoObra.findFirst({ where: { id: gastoObraId, empresaId } });
  if (!gasto) throw new RegistroNoEncontradoError("El gasto");
  await validarReferenciasEgreso(empresaId, datos);

  const data = {
    medioFinancieroId: datos.medioFinancieroId || null,
    facturaId: datos.facturaId || null,
    notasContables: datos.notasContables || null,
  };

  const egreso = await db.egreso.upsert({
    where: { gastoObraId },
    update: data,
    create: { empresaId, gastoObraId, registradoPorId: usuario.id, ...data },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Egreso",
    entidadId: egreso.id,
    accion: "EDITAR",
    valorNuevo: { gastoObraId, ...data },
  });

  return egreso;
}

const DatosEgresoManualSchema = z.object({
  fecha: z.coerce.date(),
  concepto: z.string().trim().min(1, "El concepto es obligatorio."),
  monto: z.coerce.number().positive("El monto debe ser mayor a cero."),
  proyectoId: z.string().trim().optional().nullable(),
  medioFinancieroId: z.string().trim().optional().nullable(),
  facturaId: z.string().trim().optional().nullable(),
  notasContables: z.string().trim().optional().nullable(),
});

export async function crearEgresoManual(usuario: UsuarioSesion, datosCrudos: unknown) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const datos = DatosEgresoManualSchema.parse(datosCrudos);
  await validarReferenciasEgreso(empresaId, datos);

  const egreso = await db.egreso.create({
    data: {
      empresaId,
      fecha: datos.fecha,
      concepto: datos.concepto,
      monto: datos.monto,
      proyectoId: datos.proyectoId || null,
      medioFinancieroId: datos.medioFinancieroId || null,
      facturaId: datos.facturaId || null,
      notasContables: datos.notasContables || null,
      registradoPorId: usuario.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Egreso",
    entidadId: egreso.id,
    accion: "CREAR",
    valorNuevo: { concepto: egreso.concepto, monto: datos.monto },
  });

  return egreso;
}

export async function editarEgresoManual(usuario: UsuarioSesion, id: string, datosCrudos: unknown) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeRegistrarMovimientoContable(usuario)) throw new SinPermisoError();
  const datos = DatosEgresoManualSchema.parse(datosCrudos);

  const anterior = await db.egreso.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El egreso");
  if (anterior.gastoObraId) {
    throw new ValidacionError("Este egreso proviene de un gasto — sus datos operativos se editan desde Gastos.");
  }
  await validarReferenciasEgreso(empresaId, datos);

  const egreso = await db.egreso.update({
    where: { id },
    data: {
      fecha: datos.fecha,
      concepto: datos.concepto,
      monto: datos.monto,
      proyectoId: datos.proyectoId || null,
      medioFinancieroId: datos.medioFinancieroId || null,
      facturaId: datos.facturaId || null,
      notasContables: datos.notasContables || null,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Egreso",
    entidadId: egreso.id,
    accion: "EDITAR",
    valorAnterior: { concepto: anterior.concepto, monto: Number(anterior.monto ?? 0) },
    valorNuevo: { concepto: egreso.concepto, monto: datos.monto },
  });

  return egreso;
}

export async function cancelarEgreso(usuario: UsuarioSesion, id: string) {
  const empresaId = requerirContabilidad(usuario);
  if (!puedeCancelarRegistroContable(usuario)) throw new SinPermisoError();

  const anterior = await db.egreso.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El egreso");

  const egreso = await db.egreso.update({ where: { id }, data: { estatus: "CANCELADO" } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "Egreso",
    entidadId: egreso.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: anterior.estatus },
    valorNuevo: { estatus: "CANCELADO" },
  });

  return egreso;
}
