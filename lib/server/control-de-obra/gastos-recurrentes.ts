import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { registrarAuditoria, registrarAuditoriaTx } from "@/lib/server/auditoria";
import {
  puedeAdministrarGastosRecurrentes,
  puedeCapturarCategoriaGasto,
  puedeVerContabilidad,
} from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { FrecuenciaGasto } from "@/lib/generated/prisma/enums";
import { CATEGORIAS_GASTO, CATEGORIA_GASTO_SENSIBLE } from "@/lib/control-de-obra/categorias-gasto";
import { SinPermisoError } from "./proyectos";
import { RegistroNoEncontradoError } from "./estructura-contractual";
import { EMPRESA_PROYECTO_LABEL } from "./proyecto-oficina";

// ---------------------------------------------------------------------------
// Plantillas de gasto recurrente — no son un gasto en sí, son el origen que
// genera ocurrencias reales (GastoObra) de forma perezosa e idempotente (ver
// asegurarGastosRecurrentesGenerados). Editar/desactivar una plantilla nunca
// reescribe una ocurrencia ya generada — cada GastoObra.recurrenteId apunta
// aquí pero es su propia fila independiente para siempre (Gastos
// transversal — recurrentes, septiembre 2026).
// ---------------------------------------------------------------------------

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function requerirAdministrarRecurrentes(usuario: UsuarioSesion): string {
  if (!puedeAdministrarGastosRecurrentes(usuario)) throw new SinPermisoError();
  return requerirEmpresa(usuario);
}

function requerirPermisoCategoria(usuario: UsuarioSesion, categoria: string): void {
  const esSensible = CATEGORIA_GASTO_SENSIBLE[categoria as keyof typeof CATEGORIA_GASTO_SENSIBLE] ?? false;
  if (!puedeCapturarCategoriaGasto(usuario, esSensible)) throw new SinPermisoError();
}

const DatosGastoRecurrenteSchema = z.object({
  proyectoId: z.string().trim().min(1, "Falta el destino (Proyecto o Empresa)."),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria."),
  categoria: z.enum(CATEGORIAS_GASTO),
  frecuencia: z.enum(["SEMANAL", "QUINCENAL", "MENSUAL"]),
  // null/ausente = monto variable — cada ocurrencia nace en BORRADOR con el
  // monto pendiente de captura.
  montoFijo: z.coerce.number().positive().optional().nullable(),
  pagadorBeneficiarioId: z.string().trim().optional().nullable(),
  fechaInicio: z.coerce.date(),
});

export type DatosGastoRecurrente = z.infer<typeof DatosGastoRecurrenteSchema>;

export async function crearGastoRecurrente(usuario: UsuarioSesion, datosCrudos: unknown) {
  const empresaId = requerirAdministrarRecurrentes(usuario);
  const datos = DatosGastoRecurrenteSchema.parse(datosCrudos);
  requerirPermisoCategoria(usuario, datos.categoria);

  const proyecto = await db.proyecto.findFirst({ where: { id: datos.proyectoId, empresaId } });
  if (!proyecto) throw new RegistroNoEncontradoError("El proyecto");

  if (datos.pagadorBeneficiarioId) {
    const beneficiario = await db.beneficiario.findFirst({
      where: { id: datos.pagadorBeneficiarioId, empresaId },
    });
    if (!beneficiario) throw new RegistroNoEncontradoError("El beneficiario seleccionado");
  }

  const recurrente = await db.gastoRecurrente.create({
    data: {
      empresaId,
      proyectoId: datos.proyectoId,
      descripcion: datos.descripcion,
      categoria: datos.categoria,
      frecuencia: datos.frecuencia,
      montoFijo: datos.montoFijo ?? null,
      pagadorBeneficiarioId: datos.pagadorBeneficiarioId || null,
      fechaInicio: datos.fechaInicio,
      creadoPorId: usuario.id,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoRecurrente",
    entidadId: recurrente.id,
    accion: "CREAR",
    valorNuevo: { descripcion: recurrente.descripcion, categoria: recurrente.categoria, frecuencia: recurrente.frecuencia },
  });

  return recurrente;
}

export async function editarGastoRecurrente(
  usuario: UsuarioSesion,
  id: string,
  datosCrudos: unknown
) {
  const empresaId = requerirAdministrarRecurrentes(usuario);
  const datos = DatosGastoRecurrenteSchema.parse(datosCrudos);
  requerirPermisoCategoria(usuario, datos.categoria);

  const anterior = await db.gastoRecurrente.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El gasto recurrente");

  if (datos.pagadorBeneficiarioId) {
    const beneficiario = await db.beneficiario.findFirst({
      where: { id: datos.pagadorBeneficiarioId, empresaId },
    });
    if (!beneficiario) throw new RegistroNoEncontradoError("El beneficiario seleccionado");
  }

  // Nunca reescribe ocurrencias ya generadas — solo cambia la plantilla, que
  // únicamente afecta ocurrencias futuras (regla explícita).
  const recurrente = await db.gastoRecurrente.update({
    where: { id },
    data: {
      descripcion: datos.descripcion,
      categoria: datos.categoria,
      frecuencia: datos.frecuencia,
      montoFijo: datos.montoFijo ?? null,
      pagadorBeneficiarioId: datos.pagadorBeneficiarioId || null,
      fechaInicio: datos.fechaInicio,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoRecurrente",
    entidadId: recurrente.id,
    accion: "EDITAR",
    valorAnterior: { descripcion: anterior.descripcion, categoria: anterior.categoria, frecuencia: anterior.frecuencia },
    valorNuevo: { descripcion: recurrente.descripcion, categoria: recurrente.categoria, frecuencia: recurrente.frecuencia },
  });

  return recurrente;
}

export async function cambiarEstatusGastoRecurrente(
  usuario: UsuarioSesion,
  id: string,
  activo: boolean
) {
  const empresaId = requerirAdministrarRecurrentes(usuario);
  const anterior = await db.gastoRecurrente.findFirst({ where: { id, empresaId } });
  if (!anterior) throw new RegistroNoEncontradoError("El gasto recurrente");

  const recurrente = await db.gastoRecurrente.update({ where: { id }, data: { activo } });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "GastoRecurrente",
    entidadId: recurrente.id,
    accion: activo ? "ACTIVAR" : "DESACTIVAR",
    valorAnterior: { activo: anterior.activo },
    valorNuevo: { activo },
  });

  return recurrente;
}

export type FilaGastoRecurrente = {
  id: string;
  proyectoId: string;
  esEmpresa: boolean;
  destinoNombre: string;
  descripcion: string;
  categoria: string;
  frecuencia: FrecuenciaGasto;
  montoFijo: number | null;
  pagadorNombre: string | null;
  fechaInicio: string;
  activo: boolean;
};

export async function listarGastosRecurrentes(usuario: UsuarioSesion): Promise<FilaGastoRecurrente[]> {
  const empresaId = requerirAdministrarRecurrentes(usuario);

  const recurrentes = await db.gastoRecurrente.findMany({
    where: { empresaId },
    include: {
      proyecto: { select: { id: true, nombre: true, tipo: true } },
      pagador: { select: { nombre: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return recurrentes.map((r) => ({
    id: r.id,
    proyectoId: r.proyectoId,
    esEmpresa: r.proyecto.tipo === "OFICINA",
    destinoNombre: r.proyecto.tipo === "OFICINA" ? "Empresa" : r.proyecto.nombre,
    descripcion: r.descripcion,
    categoria: r.categoria,
    frecuencia: r.frecuencia,
    montoFijo: r.montoFijo !== null ? Number(r.montoFijo) : null,
    pagadorNombre: r.pagador?.nombre ?? null,
    fechaInicio: r.fechaInicio.toISOString(),
    activo: r.activo,
  }));
}

// ---------------------------------------------------------------------------
// Generación perezosa e idempotente — se llama desde varios puntos de
// entrada naturales (crear/abrir una Semana, consultar Reporte General o
// Gastos de ese periodo, dashboard) en vez de un cron: si ya se generó la
// ocurrencia de este periodo, no hace nada; si no, la crea. Nunca depende de
// que alguien entre específicamente a la pantalla de esa semana (Gastos
// transversal — recurrentes, septiembre 2026).
// ---------------------------------------------------------------------------

// SEMANAL: toda semana desde fechaInicio. QUINCENAL: una de cada dos semanas,
// contadas desde fechaInicio (paridad fija, nunca se recalcula desde "hoy").
// MENSUAL: se resuelve aparte (ver existeOcurrenciaEnMesDeReferencia) porque
// "una vez al mes" no es una cuenta de semanas exacta (meses de distinta
// duración) — se define como "todavía no hay ninguna ocurrencia de este
// recurrente en el mismo año+mes que esta semana".
function semanaCoincideConFrecuenciaSimple(
  frecuencia: FrecuenciaGasto,
  fechaInicioRecurrente: Date,
  semanaFechaInicio: Date
): boolean {
  const diffMs = semanaFechaInicio.getTime() - fechaInicioRecurrente.getTime();
  if (diffMs < 0) return false;
  if (frecuencia === "SEMANAL") return true;
  if (frecuencia === "QUINCENAL") {
    const diffSemanas = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return diffSemanas % 2 === 0;
  }
  return false; // MENSUAL se resuelve aparte
}

async function existeOcurrenciaEnMesDeReferencia(
  tx: Prisma.TransactionClient,
  recurrenteId: string,
  fechaReferencia: Date
): Promise<boolean> {
  const inicioMes = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth(), 1);
  const inicioMesSiguiente = new Date(fechaReferencia.getFullYear(), fechaReferencia.getMonth() + 1, 1);
  const existente = await tx.gastoObra.findFirst({
    where: {
      recurrenteId,
      semana: { fechaInicio: { gte: inicioMes, lt: inicioMesSiguiente } },
    },
    select: { id: true },
  });
  return Boolean(existente);
}

export async function asegurarGastosRecurrentesGenerados(
  empresaId: string,
  semanaId: string
): Promise<void> {
  const semana = await db.semana.findFirst({ where: { id: semanaId, empresaId } });
  if (!semana) return;

  const recurrentes = await db.gastoRecurrente.findMany({
    where: { empresaId, activo: true, fechaInicio: { lte: semana.fechaInicio } },
  });
  if (recurrentes.length === 0) return;

  for (const r of recurrentes) {
    try {
      await db.$transaction(async (tx) => {
        // Bloqueo de fila sobre la plantilla — evita que dos llamadas
        // concurrentes (dos pantallas abriendo la misma semana nueva a la
        // vez) generen dos ocurrencias del mismo periodo MENSUAL en dos
        // semanas distintas (el índice único recurrenteId+semanaId ya cubre
        // el caso "misma semana exacta", pero no "mismo mes, semana
        // distinta").
        await tx.$queryRaw`SELECT id FROM gastos_recurrentes WHERE id = ${r.id} FOR UPDATE`;

        const debeGenerar =
          r.frecuencia === "MENSUAL"
            ? !(await existeOcurrenciaEnMesDeReferencia(tx, r.id, semana.fechaInicio))
            : semanaCoincideConFrecuenciaSimple(r.frecuencia, r.fechaInicio, semana.fechaInicio);
        if (!debeGenerar) return;

        const montoFijo = r.montoFijo !== null ? Number(r.montoFijo) : null;
        const creado = await tx.gastoObra.create({
          data: {
            empresaId,
            proyectoId: r.proyectoId,
            semanaId: semana.id,
            fecha: semana.fechaInicio,
            descripcion: r.descripcion,
            categoria: r.categoria,
            // Monto variable: nace en 0, en BORRADOR — alguien debe
            // completarlo y mandarlo a revisión (enviarGastoARevision) antes
            // de que cuente para nada. Monto fijo: nace ya con el monto de
            // la plantilla, directo a PENDIENTE_REVISION (mismo punto de
            // partida que un gasto capturado a mano).
            monto: montoFijo ?? 0,
            // Método de pago por default — desconocido hasta que se
            // confirme, editable como cualquier GastoObra en
            // BORRADOR/PENDIENTE_REVISION vía editarGasto.
            metodoPago: "TRANSFERENCIA",
            pagadorBeneficiarioId: r.pagadorBeneficiarioId,
            requiereFactura: false,
            tratamientoCliente: "NO_COBRABLE",
            estatus: montoFijo !== null ? "PENDIENTE_REVISION" : "BORRADOR",
            capturadoPorId: r.creadoPorId,
            recurrenteId: r.id,
          },
        });

        await registrarAuditoriaTx(tx, {
          empresaId,
          usuarioId: r.creadoPorId,
          entidad: "GastoObra",
          entidadId: creado.id,
          accion: "CREAR",
          valorNuevo: {
            descripcion: creado.descripcion,
            categoria: creado.categoria,
            origenRecurrenteId: r.id,
          },
        });
      });
    } catch (error) {
      // Carrera real: otra llamada concurrente ya generó esta misma
      // ocurrencia (recurrenteId+semanaId) — éxito idempotente, no error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Ocurrencias de monto variable pendientes de captura — para Inicio/
// Dashboard ("Próximos compromisos"/alertas, Rediseño de Inicio, septiembre
// 2026). Una ocurrencia nace en BORRADOR solo cuando su plantilla es de
// monto variable (ver asegurarGastosRecurrentesGenerados) — esto es
// exactamente "todavía no se sabe cuánto, alguien tiene que capturarlo".
// ---------------------------------------------------------------------------

export type OcurrenciaRecurrentePendiente = {
  gastoObraId: string;
  descripcion: string;
  proyectoNombre: string;
  fecha: string;
};

export async function obtenerOcurrenciasRecurrentesPendientes(
  usuario: UsuarioSesion
): Promise<OcurrenciaRecurrentePendiente[]> {
  if (!puedeVerContabilidad(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  const empresaId = usuario.empresa.id;

  const pendientes = await db.gastoObra.findMany({
    where: { empresaId, estatus: "BORRADOR", recurrenteId: { not: null } },
    include: { proyecto: { select: { nombre: true, tipo: true } } },
    orderBy: { fecha: "asc" },
  });

  return pendientes.map((g) => ({
    gastoObraId: g.id,
    descripcion: g.descripcion,
    proyectoNombre: g.proyecto.tipo === "OFICINA" ? EMPRESA_PROYECTO_LABEL : g.proyecto.nombre,
    fecha: g.fecha.toISOString(),
  }));
}
