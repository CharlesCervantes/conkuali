import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import { puedeVerRecibosFinancieros } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { EstatusPago } from "@/lib/generated/prisma/enums";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { RegistroNoEncontradoError, sumarContratoVigentePorBeneficiario } from "./estructura-contractual";
import { obtenerArchivo } from "@/lib/server/archivos";

function requerirVerRecibos(usuario: UsuarioSesion): string {
  if (!puedeVerRecibosFinancieros(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// ---------------------------------------------------------------------------
// Resumen financiero por contratista (expediente) — proyecto+beneficiario.
// Todo se lee de CorteSemanal, nunca se recalcula desde Contrato General ni
// desde Avance de Obra (regla explícita de esta etapa). "Contrato vigente"
// sigue siendo la suma de ContratoConcepto (cantidad × P.U.), la misma lógica
// que ya usa contratistas-view.tsx, calculada aquí por beneficiario en vez de
// por contrato individual (un contratista puede tener más de un contrato).
//
// Nota para el futuro (no implementado a propósito): Aditiva ya existe como
// modelo pero pertenece al flujo más viejo de Reporte General
// (BeneficiarioProyecto.montoContrato en texto libre) — cuando este módulo
// necesite anticipos/aditivas propios de Contrato General, este es el lugar
// donde Saldo contractual tendría que restarlos también.
// ---------------------------------------------------------------------------

export type ResumenFinancieroContratista = {
  contratoVigente: number;
  estimadoAcumulado: number;
  pagadoAcumulado: number;
  saldoContractual: number;
};

export async function obtenerResumenFinancieroContratistas(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<Map<string, ResumenFinancieroContratista>> {
  requerirVerRecibos(usuario);
  await obtenerProyecto(usuario, proyectoId);

  const [contratos, cortes] = await Promise.all([
    db.contratoContratista.findMany({
      where: { beneficiarioProyecto: { proyectoId } },
      select: {
        beneficiarioProyectoId: true,
        conceptos: { select: { cantidad: true, precioUnitarioContratista: true } },
      },
    }),
    db.corteSemanal.findMany({
      where: { proyectoId, estatus: "GENERADO" },
      select: {
        beneficiarioProyectoId: true,
        montoNeto: true,
        movimientoSemanal: { select: { estatusPago: true } },
      },
    }),
  ]);

  const contratoVigentePorBeneficiario = sumarContratoVigentePorBeneficiario(contratos);

  const estimadoPorBeneficiario = new Map<string, number>();
  const pagadoPorBeneficiario = new Map<string, number>();
  for (const corte of cortes) {
    const monto = Number(corte.montoNeto);
    estimadoPorBeneficiario.set(
      corte.beneficiarioProyectoId,
      (estimadoPorBeneficiario.get(corte.beneficiarioProyectoId) ?? 0) + monto
    );
    if (corte.movimientoSemanal?.estatusPago === "LIQUIDADO") {
      pagadoPorBeneficiario.set(
        corte.beneficiarioProyectoId,
        (pagadoPorBeneficiario.get(corte.beneficiarioProyectoId) ?? 0) + monto
      );
    }
  }

  const beneficiarioIds = new Set([
    ...contratoVigentePorBeneficiario.keys(),
    ...estimadoPorBeneficiario.keys(),
  ]);

  const resultado = new Map<string, ResumenFinancieroContratista>();
  for (const id of beneficiarioIds) {
    const contratoVigente = contratoVigentePorBeneficiario.get(id) ?? 0;
    const estimadoAcumulado = estimadoPorBeneficiario.get(id) ?? 0;
    resultado.set(id, {
      contratoVigente,
      estimadoAcumulado,
      pagadoAcumulado: pagadoPorBeneficiario.get(id) ?? 0,
      saldoContractual: contratoVigente - estimadoAcumulado,
    });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Historial de cortes — solo GENERADO (ANULADO se conserva en histórico/
// auditoría pero no aparece en la vista operativa normal, tal como se pidió).
// ---------------------------------------------------------------------------

export type CorteHistorial = {
  id: string;
  numero: number;
  semanaId: string;
  semanaNumero: number;
  semanaAnio: number;
  montoNeto: number;
  estatusPago: EstatusPago | null;
  reciboVigenteId: string | null;
  reciboVigenteFolio: string | null;
  reciboVigenteFirmado: boolean;
  createdAt: string;
};

export async function obtenerHistorialCortes(
  usuario: UsuarioSesion,
  proyectoId: string,
  beneficiarioProyectoId: string
): Promise<CorteHistorial[]> {
  requerirVerRecibos(usuario);
  await obtenerProyecto(usuario, proyectoId);

  const cortes = await db.corteSemanal.findMany({
    where: { proyectoId, beneficiarioProyectoId, estatus: "GENERADO" },
    orderBy: { semana: { fechaInicio: "desc" } },
    include: {
      semana: { select: { numero: true, anio: true } },
      movimientoSemanal: { select: { estatusPago: true } },
      recibos: { where: { estatus: "VIGENTE" }, select: { id: true, folio: true, archivoEvidenciaRef: true } },
    },
  });

  return cortes.map((c) => {
    const recibo = c.recibos[0] ?? null;
    return {
      id: c.id,
      numero: c.numero,
      semanaId: c.semanaId,
      semanaNumero: c.semana.numero,
      semanaAnio: c.semana.anio,
      montoNeto: Number(c.montoNeto),
      estatusPago: c.movimientoSemanal?.estatusPago ?? null,
      reciboVigenteId: recibo?.id ?? null,
      reciboVigenteFolio: recibo?.folio ?? null,
      reciboVigenteFirmado: Boolean(recibo?.archivoEvidenciaRef),
      createdAt: c.createdAt.toISOString(),
    };
  });
}

// Igual que obtenerHistorialCortes pero para TODOS los contratistas del
// proyecto de una sola consulta (evita N+1 al pintar Contratistas completo).
export async function obtenerHistorialCortesPorProyecto(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<Map<string, CorteHistorial[]>> {
  requerirVerRecibos(usuario);
  await obtenerProyecto(usuario, proyectoId);

  const cortes = await db.corteSemanal.findMany({
    where: { proyectoId, estatus: "GENERADO" },
    orderBy: { semana: { fechaInicio: "desc" } },
    include: {
      semana: { select: { numero: true, anio: true } },
      movimientoSemanal: { select: { estatusPago: true } },
      recibos: { where: { estatus: "VIGENTE" }, select: { id: true, folio: true, archivoEvidenciaRef: true } },
    },
  });

  const resultado = new Map<string, CorteHistorial[]>();
  for (const c of cortes) {
    const recibo = c.recibos[0] ?? null;
    const fila: CorteHistorial = {
      id: c.id,
      numero: c.numero,
      semanaId: c.semanaId,
      semanaNumero: c.semana.numero,
      semanaAnio: c.semana.anio,
      montoNeto: Number(c.montoNeto),
      estatusPago: c.movimientoSemanal?.estatusPago ?? null,
      reciboVigenteId: recibo?.id ?? null,
      reciboVigenteFolio: recibo?.folio ?? null,
      reciboVigenteFirmado: Boolean(recibo?.archivoEvidenciaRef),
      createdAt: c.createdAt.toISOString(),
    };
    const lista = resultado.get(c.beneficiarioProyectoId) ?? [];
    lista.push(fila);
    resultado.set(c.beneficiarioProyectoId, lista);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Detalle de un corte — snapshot congelado exclusivamente desde
// CorteSemanalConcepto. La Partida se resuelve en vivo vía Concepto.partida
// (organizativo, no un precio) — nunca se lee ningún P.U. actual.
// ---------------------------------------------------------------------------

export type DetalleCorte = {
  id: string;
  numero: number;
  proyectoNombre: string;
  contratistaNombre: string;
  semanaNumero: number;
  semanaAnio: number;
  fechaCorte: string;
  generadoPorNombre: string;
  estatus: "GENERADO" | "ANULADO";
  estatusPago: EstatusPago | null;
  montoBruto: number;
  ajustes: number;
  montoNeto: number;
  reciboVigente: {
    id: string;
    folio: string;
    archivoEvidenciaRef: string | null;
    archivoEvidenciaNombre: string | null;
    fechaRecepcion: string | null;
  } | null;
  detalle: {
    id: string;
    partidaNombre: string | null;
    descripcionConcepto: string;
    unidad: string;
    cantidadEjecutada: number;
    precioUnitarioContratista: number;
    importe: number;
  }[];
};

export async function obtenerDetalleCorte(
  usuario: UsuarioSesion,
  corteSemanalId: string
): Promise<DetalleCorte> {
  const empresaId = requerirVerRecibos(usuario);

  const corte = await db.corteSemanal.findFirst({
    where: { id: corteSemanalId, empresaId },
    include: {
      proyecto: { select: { nombre: true } },
      beneficiarioProyecto: { include: { beneficiario: { select: { nombre: true } } } },
      semana: { select: { numero: true, anio: true } },
      generadoPor: { select: { nombre: true } },
      movimientoSemanal: { select: { estatusPago: true } },
      recibos: {
        where: { estatus: "VIGENTE" },
        select: {
          id: true,
          folio: true,
          archivoEvidenciaRef: true,
          archivoEvidenciaNombre: true,
          fechaRecepcion: true,
        },
      },
      detalle: {
        include: { concepto: { select: { partida: { select: { nombre: true } } } } },
      },
    },
  });
  if (!corte) throw new RegistroNoEncontradoError("El corte");

  const reciboVigente = corte.recibos[0] ?? null;

  return {
    id: corte.id,
    numero: corte.numero,
    proyectoNombre: corte.proyecto.nombre,
    contratistaNombre: corte.beneficiarioProyecto.beneficiario.nombre,
    semanaNumero: corte.semana.numero,
    semanaAnio: corte.semana.anio,
    fechaCorte: corte.createdAt.toISOString(),
    generadoPorNombre: corte.generadoPor.nombre,
    estatus: corte.estatus,
    estatusPago: corte.movimientoSemanal?.estatusPago ?? null,
    montoBruto: Number(corte.montoBruto),
    ajustes: Number(corte.ajustes),
    montoNeto: Number(corte.montoNeto),
    reciboVigente: reciboVigente
      ? {
          id: reciboVigente.id,
          folio: reciboVigente.folio,
          archivoEvidenciaRef: reciboVigente.archivoEvidenciaRef,
          archivoEvidenciaNombre: reciboVigente.archivoEvidenciaNombre,
          fechaRecepcion: reciboVigente.fechaRecepcion?.toISOString() ?? null,
        }
      : null,
    detalle: corte.detalle.map((d) => ({
      id: d.id,
      partidaNombre: d.concepto.partida.nombre,
      descripcionConcepto: d.descripcionConcepto,
      unidad: d.unidad,
      cantidadEjecutada: Number(d.cantidadEjecutada),
      precioUnitarioContratista: Number(d.precioUnitarioContratista),
      importe: Number(d.importe),
    })),
  };
}

// ---------------------------------------------------------------------------
// Generar/regenerar recibo — folio atómico por empresa, "un corte, a lo más
// un recibo VIGENTE a la vez" resuelto en el servicio dentro de una
// transacción.
// ---------------------------------------------------------------------------

export type ReciboGenerado = {
  id: string;
  folio: string;
  esRegeneracion: boolean;
};

export async function generarRecibo(
  usuario: UsuarioSesion,
  corteSemanalId: string
): Promise<ReciboGenerado> {
  const empresaId = requerirVerRecibos(usuario);

  return db.$transaction(async (tx) => {
    const corte = await tx.corteSemanal.findFirst({
      where: { id: corteSemanalId, empresaId },
      include: { recibos: { where: { estatus: "VIGENTE" } } },
    });
    if (!corte) throw new RegistroNoEncontradoError("El corte");
    if (corte.estatus !== "GENERADO") {
      throw new ValidacionError(
        "Este corte está anulado (sin avance aprobado) — no se puede generar un recibo."
      );
    }

    const vigente = corte.recibos[0] ?? null;
    if (vigente?.archivoEvidenciaRef) {
      throw new ValidacionError(
        "Ya existe un recibo firmado para este corte. No se puede regenerar — cualquier corrección se maneja aparte."
      );
    }

    if (vigente) {
      await tx.reciboPago.update({
        where: { id: vigente.id },
        data: { estatus: "SUPERSEDIDO" },
      });
    }

    // Contador atómico: Postgres bloquea esta fila hasta que la transacción
    // termina — dos generaciones simultáneas de la misma empresa nunca
    // pueden sacar el mismo folio (ver prisma/schema.prisma, Empresa).
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: { ultimoFolioRecibo: { increment: 1 } },
    });
    const folio = `REC-${String(empresa.ultimoFolioRecibo).padStart(6, "0")}`;

    const configuracionSnapshot = {
      titulo: empresa.reciboTitulo,
      leyenda: empresa.reciboLeyenda,
      razonSocial: empresa.reciboRazonSocial ?? empresa.razonSocial ?? empresa.nombre,
      mostrarDetalle: empresa.reciboMostrarDetalle,
      mostrarPU: empresa.reciboMostrarPU,
      // Logo AL MOMENTO de generar — el documento histórico se ve igual
      // aunque el logo de la Empresa cambie después (branding congelado,
      // Portal Master). La clave sigue llamándose `logoUrl` por compatibilidad
      // con snapshots ya guardados; el valor es una referencia de
      // almacenamiento (lib/server/archivos.ts), no una URL usable directo —
      // se resuelve recién al armar los datos del PDF (obtenerDatosPdfRecibo).
      logoUrl: empresa.logoRef,
    };

    const recibo = await tx.reciboPago.create({
      data: {
        empresaId,
        corteSemanalId: corte.id,
        numeroFolio: empresa.ultimoFolioRecibo,
        folio,
        estatus: "VIGENTE",
        configuracionSnapshot,
        generadoPorId: usuario.id,
      },
    });

    await registrarAuditoriaTx(tx, {
      empresaId,
      usuarioId: usuario.id,
      entidad: "ReciboPago",
      entidadId: recibo.id,
      accion: vigente ? "EDITAR" : "CREAR",
      valorAnterior: vigente ? { folio: vigente.folio, estatus: "VIGENTE" } : null,
      valorNuevo: { folio: recibo.folio, estatus: "VIGENTE", corteSemanalId: corte.id },
    });

    return { id: recibo.id, folio: recibo.folio, esRegeneracion: Boolean(vigente) };
  });
}

// ---------------------------------------------------------------------------
// Evidencia firmada — la sube la Server Action (que ya subió el archivo vía
// subirArchivo(), lib/server/archivos.ts) y esta función solo persiste la
// referencia resultante + audita.
// ---------------------------------------------------------------------------

const EvidenciaSchema = z.object({
  archivoEvidenciaRef: z.string().trim().min(1),
  archivoEvidenciaNombre: z.string().trim().min(1),
  fechaRecepcion: z.coerce.date().optional().nullable(),
});

export async function registrarEvidenciaRecibo(
  usuario: UsuarioSesion,
  reciboId: string,
  datosCrudos: unknown
) {
  const empresaId = requerirVerRecibos(usuario);
  const datos = EvidenciaSchema.parse(datosCrudos);

  const recibo = await db.reciboPago.findFirst({ where: { id: reciboId, empresaId } });
  if (!recibo) throw new RegistroNoEncontradoError("El recibo");
  if (recibo.estatus !== "VIGENTE") {
    throw new ValidacionError(
      "Este recibo ya no está vigente (fue reemplazado por uno más reciente) — la evidencia debe subirse sobre el recibo vigente actual."
    );
  }

  const actualizado = await db.reciboPago.update({
    where: { id: recibo.id },
    data: {
      archivoEvidenciaRef: datos.archivoEvidenciaRef,
      archivoEvidenciaNombre: datos.archivoEvidenciaNombre,
      fechaRecepcion: datos.fechaRecepcion ?? new Date(),
      subidoPorId: usuario.id,
      subidoEn: new Date(),
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "ReciboPago",
    entidadId: actualizado.id,
    accion: "EDITAR",
    valorAnterior: { archivoEvidenciaRef: recibo.archivoEvidenciaRef },
    valorNuevo: {
      archivoEvidenciaRef: actualizado.archivoEvidenciaRef,
      archivoEvidenciaNombre: actualizado.archivoEvidenciaNombre,
    },
  });

  return actualizado;
}

// Referencia de almacenamiento de la evidencia firmada de UN recibo, para el
// endpoint de descarga autenticada — mismo gate que el resto de este archivo
// (puedeVerRecibosFinancieros, capa de privacidad financiera/Vista Privada).
export async function obtenerRefEvidenciaRecibo(
  usuario: UsuarioSesion,
  reciboId: string
): Promise<string | null> {
  const empresaId = requerirVerRecibos(usuario);
  const recibo = await db.reciboPago.findFirst({
    where: { id: reciboId, empresaId },
    select: { archivoEvidenciaRef: true },
  });
  if (!recibo) throw new RegistroNoEncontradoError("El recibo");
  return recibo.archivoEvidenciaRef;
}

// ---------------------------------------------------------------------------
// Datos para el PDF — recibo individual y el combinado por semana.
// ---------------------------------------------------------------------------

export type DatosPdfRecibo = {
  folio: string;
  proyectoNombre: string;
  contratistaNombre: string;
  semanaNumero: number;
  semanaAnio: number;
  fechaGeneracion: string;
  numeroCorte: number;
  configuracion: {
    titulo: string;
    leyenda: string | null;
    razonSocial: string;
    mostrarDetalle: boolean;
    mostrarPU: boolean;
  };
  // Bytes ya resueltos del logo (o null si no hay/si no se pudo descargar) —
  // el PDF nunca recibe una URL/ref cruda, evita depender de que
  // @react-pdf/renderer resuelva una URL firmada antes de que expire.
  logoBuffer: Buffer | null;
  detalle: { descripcion: string; unidad: string; cantidad: number; precioUnitario: number; importe: number }[];
  total: number;
};

export async function obtenerDatosPdfRecibo(
  usuario: UsuarioSesion,
  reciboId: string
): Promise<DatosPdfRecibo> {
  const empresaId = requerirVerRecibos(usuario);

  const recibo = await db.reciboPago.findFirst({
    where: { id: reciboId, empresaId },
    include: {
      corteSemanal: {
        include: {
          proyecto: { select: { nombre: true } },
          beneficiarioProyecto: { include: { beneficiario: { select: { nombre: true } } } },
          semana: { select: { numero: true, anio: true } },
          detalle: true,
        },
      },
    },
  });
  if (!recibo) throw new RegistroNoEncontradoError("El recibo");

  // Recibos generados antes de agregar `logoUrl` al snapshot no lo tienen en
  // su JSON guardado — se completa con null, nunca con el logo actual de la
  // Empresa (el snapshot histórico no se "repara" retroactivamente).
  const configGuardada = recibo.configuracionSnapshot as DatosPdfRecibo["configuracion"] & {
    logoUrl: string | null;
  };
  const logoRefGuardada = configGuardada.logoUrl ?? null;
  // Resuelve la referencia (ref de R2 o URL histórica de Vercel Blob) a
  // bytes reales — si falla (archivo ya no existe, referencia corrupta), el
  // PDF se genera igual, sin logo, en vez de romper la descarga completa.
  const logoBuffer = logoRefGuardada ? await obtenerArchivo(logoRefGuardada).catch(() => null) : null;

  return {
    folio: recibo.folio,
    proyectoNombre: recibo.corteSemanal.proyecto.nombre,
    contratistaNombre: recibo.corteSemanal.beneficiarioProyecto.beneficiario.nombre,
    semanaNumero: recibo.corteSemanal.semana.numero,
    semanaAnio: recibo.corteSemanal.semana.anio,
    fechaGeneracion: recibo.createdAt.toISOString(),
    numeroCorte: recibo.corteSemanal.numero,
    configuracion: {
      titulo: configGuardada.titulo,
      leyenda: configGuardada.leyenda,
      razonSocial: configGuardada.razonSocial,
      mostrarDetalle: configGuardada.mostrarDetalle,
      mostrarPU: configGuardada.mostrarPU,
    },
    logoBuffer,
    detalle: recibo.corteSemanal.detalle.map((d) => ({
      descripcion: d.descripcionConcepto,
      unidad: d.unidad,
      cantidad: Number(d.cantidadEjecutada),
      precioUnitario: Number(d.precioUnitarioContratista),
      importe: Number(d.importe),
    })),
    total: Number(recibo.corteSemanal.montoNeto),
  };
}

// Para "Descargar todos los recibos de la semana" — solo cortes GENERADO con
// monto > 0, cada uno con su recibo VIGENTE (se genera uno al vuelo si no
// existe todavía, mismo folio atómico que generarRecibo).
export async function obtenerDatosPdfRecibosSemana(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<DatosPdfRecibo[]> {
  requerirVerRecibos(usuario);
  await obtenerProyecto(usuario, proyectoId);

  const cortes = await db.corteSemanal.findMany({
    where: { proyectoId, semanaId, estatus: "GENERADO", montoNeto: { gt: 0 } },
    select: { id: true, recibos: { where: { estatus: "VIGENTE" }, select: { id: true } } },
  });

  const datos: DatosPdfRecibo[] = [];
  for (const corte of cortes) {
    const reciboId = corte.recibos[0]?.id ?? (await generarRecibo(usuario, corte.id)).id;
    datos.push(await obtenerDatosPdfRecibo(usuario, reciboId));
  }
  return datos;
}
