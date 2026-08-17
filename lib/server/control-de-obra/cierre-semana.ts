import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { AccionAuditoria } from "@/lib/generated/prisma/enums";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeCerrarSemana, puedeReabrirSemana } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import { RegistroNoEncontradoError } from "./estructura-contractual";

type Cliente = Prisma.TransactionClient;

function requerirCerrar(usuario: UsuarioSesion): string {
  if (!puedeCerrarSemana(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

function requerirReabrir(usuario: UsuarioSesion): string {
  if (!puedeReabrirSemana(usuario)) throw new SinPermisoError();
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// Igual que registrarAuditoria (lib/server/auditoria.ts) pero atado a `tx` —
// necesario dentro de cerrarSemana: si el registro fuera vía el `db` global,
// sobreviviría aunque la transacción completa se revirtiera, rompiendo la
// atomicidad ("no debe quedar la semana medio cerrada").
function aJson(valor: Record<string, unknown> | null | undefined) {
  if (!valor) return undefined;
  return JSON.parse(JSON.stringify(valor));
}

async function auditarTx(
  tx: Cliente,
  params: {
    empresaId: string;
    usuarioId: string;
    entidad: string;
    entidadId: string;
    accion: AccionAuditoria;
    valorAnterior?: Record<string, unknown> | null;
    valorNuevo?: Record<string, unknown> | null;
  }
) {
  await tx.registroAuditoria.create({
    data: {
      empresaId: params.empresaId,
      usuarioId: params.usuarioId,
      entidad: params.entidad,
      entidadId: params.entidadId,
      accion: params.accion,
      valorAnterior: aJson(params.valorAnterior),
      valorNuevo: aJson(params.valorNuevo),
    },
  });
}

// ---------------------------------------------------------------------------
// Candado para avance.ts — semana cerrada bloquea todo; un concepto que ya
// forma parte de un corte LIQUIDADO queda protegido aunque la semana esté
// abierta (reapertura parcial, sección "reconciliación" del diseño).
// ---------------------------------------------------------------------------

export async function verificarSemanaEditable(
  proyectoId: string,
  semanaId: string,
  conceptoIds: string[]
): Promise<void> {
  const cierre = await db.cierreSemanaProyecto.findUnique({
    where: { proyectoId_semanaId: { proyectoId, semanaId } },
  });
  if (cierre?.estatus === "CERRADA") {
    throw new ValidacionError(
      "Esta semana ya está cerrada. Reábrela antes de modificar el avance."
    );
  }

  if (conceptoIds.length === 0) return;

  const bloqueados = await db.corteSemanalConcepto.findMany({
    where: {
      conceptoId: { in: conceptoIds },
      corteSemanal: { semanaId, movimientoSemanal: { estatusPago: "LIQUIDADO" } },
    },
    select: { descripcionConcepto: true },
  });
  if (bloqueados.length > 0) {
    const nombres = [...new Set(bloqueados.map((b) => b.descripcionConcepto))].join(", ");
    const plural = bloqueados.length === 1 ? "" : "n";
    throw new ValidacionError(
      `${nombres} ya forma${plural} parte de un corte liquidado y no puede${plural} modificarse.`
    );
  }
}

// ---------------------------------------------------------------------------
// Resumen — lo usa tanto la tarjeta de "Avance de obra" como, dentro de la
// transacción de cerrarSemana, la revalidación de las reglas de bloqueo (así
// nunca hay desfase entre lo que se muestra y lo que en verdad se exige).
// ---------------------------------------------------------------------------

type LineaAvanceParaCierre = {
  conceptoId: string;
  descripcionConcepto: string;
  unidad: string;
  avanceConceptoId: string;
  cantidadEjecutada: number;
  contratoConceptoId: string | null;
  contratoContratistaId: string | null;
  beneficiarioProyectoId: string | null;
  precioUnitarioContratista: number | null;
};

async function obtenerLineasAvanceAprobado(
  cliente: Cliente,
  proyectoId: string,
  semanaId: string
): Promise<LineaAvanceParaCierre[]> {
  const avances = await cliente.avanceConcepto.findMany({
    where: {
      semanaId,
      cantidadEjecutada: { gt: 0 },
      estatusAprobacion: "APROBADO",
      concepto: { partida: { proyectoId } },
    },
    select: {
      id: true,
      conceptoId: true,
      cantidadEjecutada: true,
      concepto: {
        select: {
          descripcion: true,
          unidad: true,
          // conceptoId es @unique en ContratoConcepto — a lo más una asignación.
          asignaciones: {
            select: {
              id: true,
              precioUnitarioContratista: true,
              contratoContratista: {
                select: { id: true, beneficiarioProyectoId: true },
              },
            },
          },
        },
      },
    },
  });

  return avances.map((a) => {
    const asignacion = a.concepto.asignaciones[0] ?? null;
    return {
      conceptoId: a.conceptoId,
      descripcionConcepto: a.concepto.descripcion,
      unidad: a.concepto.unidad,
      avanceConceptoId: a.id,
      cantidadEjecutada: Number(a.cantidadEjecutada),
      contratoConceptoId: asignacion?.id ?? null,
      contratoContratistaId: asignacion?.contratoContratista.id ?? null,
      beneficiarioProyectoId: asignacion?.contratoContratista.beneficiarioProyectoId ?? null,
      precioUnitarioContratista: asignacion ? Number(asignacion.precioUnitarioContratista) : null,
    };
  });
}

export type ResumenCierreSemana = {
  estatus: "NUNCA_CERRADA" | "ABIERTA" | "CERRADA";
  cerradoPorNombre: string | null;
  cerradoEn: string | null;
  reabiertoPorNombre: string | null;
  reabiertoEn: string | null;
  motivoReapertura: string | null;
  conceptosConAvance: number;
  avancesAprobados: number;
  pendientesPorAprobar: number;
  contratistasInvolucrados: number;
  montoManoDeObraAprobado: number;
  conceptosSinContratista: { id: string; descripcion: string }[];
  puedeCerrar: boolean;
  cortes: {
    beneficiarioProyectoId: string;
    nombreContratista: string;
    montoNeto: number;
    estatus: "GENERADO" | "ANULADO";
  }[];
};

// Sin gate de rol propio: visible a los mismos 4 roles que ya ven Avance de
// obra (obtenerAvanceSemanal tampoco lo tiene) — quien no puede cerrar/
// reabrir de todas formas no verá los botones (eso sí lo decide el caller
// con puedeCerrarSemana/puedeReabrirSemana), pero sí necesita saber que la
// semana está cerrada para entender por qué el formulario está en solo
// lectura.
export async function obtenerResumenCierreSemana(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<ResumenCierreSemana> {
  await obtenerProyecto(usuario, proyectoId);

  const [cierre, conceptosConAvance, pendientes, lineas, cortes] = await Promise.all([
    db.cierreSemanaProyecto.findUnique({
      where: { proyectoId_semanaId: { proyectoId, semanaId } },
      include: {
        cerradoPor: { select: { nombre: true } },
        reabiertoPor: { select: { nombre: true } },
      },
    }),
    db.avanceConcepto.count({
      where: { semanaId, cantidadEjecutada: { gt: 0 }, concepto: { partida: { proyectoId } } },
    }),
    db.avanceConcepto.count({
      where: {
        semanaId,
        estatusAprobacion: "PENDIENTE",
        cantidadEjecutada: { gt: 0 },
        concepto: { partida: { proyectoId } },
      },
    }),
    obtenerLineasAvanceAprobado(db, proyectoId, semanaId),
    db.corteSemanal.findMany({
      where: { proyectoId, semanaId },
      include: { beneficiarioProyecto: { include: { beneficiario: { select: { nombre: true } } } } },
    }),
  ]);

  const conceptosSinContratistaMap = new Map<string, string>();
  const beneficiariosInvolucrados = new Set<string>();
  let montoManoDeObraAprobado = 0;

  for (const linea of lineas) {
    if (!linea.beneficiarioProyectoId || linea.precioUnitarioContratista === null) {
      conceptosSinContratistaMap.set(linea.conceptoId, linea.descripcionConcepto);
      continue;
    }
    beneficiariosInvolucrados.add(linea.beneficiarioProyectoId);
    montoManoDeObraAprobado += linea.cantidadEjecutada * linea.precioUnitarioContratista;
  }

  return {
    estatus: !cierre ? "NUNCA_CERRADA" : cierre.estatus,
    cerradoPorNombre: cierre?.cerradoPor.nombre ?? null,
    cerradoEn: cierre?.cerradoEn.toISOString() ?? null,
    reabiertoPorNombre: cierre?.reabiertoPor?.nombre ?? null,
    reabiertoEn: cierre?.reabiertoEn?.toISOString() ?? null,
    motivoReapertura: cierre?.motivoReapertura ?? null,
    conceptosConAvance,
    avancesAprobados: lineas.length,
    pendientesPorAprobar: pendientes,
    contratistasInvolucrados: beneficiariosInvolucrados.size,
    montoManoDeObraAprobado,
    conceptosSinContratista: [...conceptosSinContratistaMap.entries()].map(([id, descripcion]) => ({
      id,
      descripcion,
    })),
    puedeCerrar: pendientes === 0 && conceptosSinContratistaMap.size === 0,
    cortes: cortes.map((c) => ({
      beneficiarioProyectoId: c.beneficiarioProyectoId,
      nombreContratista: c.beneficiarioProyecto.beneficiario.nombre,
      montoNeto: Number(c.montoNeto),
      estatus: c.estatus,
    })),
  };
}

// ---------------------------------------------------------------------------
// Cerrar semana — crea o reconcilia el corte de cada contratista, y su
// MovimientoSemanal, dentro de una sola transacción atómica.
// ---------------------------------------------------------------------------

type ResultadoCorte =
  | { tipo: "OMITIDO_LIQUIDADO" }
  | { tipo: "CREADO" | "RECONCILIADO" | "SIN_CAMBIOS"; montoNeto: number };

async function generarOReconciliarCorte(
  tx: Cliente,
  ctx: {
    empresaId: string;
    proyectoId: string;
    semanaId: string;
    cierreSemanaProyectoId: string;
    beneficiarioProyectoId: string;
    usuarioId: string;
  },
  lineas: LineaAvanceParaCierre[]
): Promise<ResultadoCorte> {
  const existente = await tx.corteSemanal.findUnique({
    where: {
      proyectoId_semanaId_beneficiarioProyectoId: {
        proyectoId: ctx.proyectoId,
        semanaId: ctx.semanaId,
        beneficiarioProyectoId: ctx.beneficiarioProyectoId,
      },
    },
    include: { movimientoSemanal: true, detalle: true },
  });

  // Financieramente congelado — no se toca nada, ni siquiera el detalle.
  if (existente?.movimientoSemanal?.estatusPago === "LIQUIDADO") {
    return { tipo: "OMITIDO_LIQUIDADO" };
  }

  const montoBruto = lineas.reduce(
    (t, l) => t + l.cantidadEjecutada * (l.precioUnitarioContratista ?? 0),
    0
  );
  const ajustes = existente ? Number(existente.ajustes) : 0;
  const montoNeto = montoBruto + ajustes;
  // > 0 vigente; = 0 (sin avance aprobado tras una reapertura) se anula, no
  // se borra — mismo criterio para su MovimientoSemanal (ver abajo).
  const nuevoEstatusCorte: "GENERADO" | "ANULADO" = montoNeto > 0 ? "GENERADO" : "ANULADO";

  // Un solo ContratoContratista involucrado → se anota en el movimiento
  // (mismo criterio "preparación, no implementado" que ya trae el schema);
  // más de uno → null, no se puede atribuir a uno solo.
  const contratosUnicos = new Set(
    lineas.map((l) => l.contratoContratistaId).filter((id): id is string => id !== null)
  );
  const contratoContratistaId = contratosUnicos.size === 1 ? [...contratosUnicos][0] : null;

  const datosDetalle = lineas.map((l) => ({
    conceptoId: l.conceptoId,
    contratoConceptoId: l.contratoConceptoId!,
    avanceConceptoId: l.avanceConceptoId,
    descripcionConcepto: l.descripcionConcepto,
    unidad: l.unidad,
    cantidadEjecutada: l.cantidadEjecutada,
    precioUnitarioContratista: l.precioUnitarioContratista ?? 0,
    importe: l.cantidadEjecutada * (l.precioUnitarioContratista ?? 0),
  }));

  if (existente) {
    // ¿Cambió algo de verdad? — mismo criterio de "no auditar/escribir lo que
    // no cambió" ya usado al editar conceptos (estructura-contractual.ts).
    const anteriorOrdenado = [...existente.detalle].sort((a, b) =>
      a.conceptoId.localeCompare(b.conceptoId)
    );
    const nuevoOrdenado = [...datosDetalle].sort((a, b) => a.conceptoId.localeCompare(b.conceptoId));
    const sinCambios =
      Number(existente.montoNeto) === montoNeto &&
      existente.estatus === nuevoEstatusCorte &&
      anteriorOrdenado.length === nuevoOrdenado.length &&
      anteriorOrdenado.every(
        (d, i) =>
          d.conceptoId === nuevoOrdenado[i].conceptoId &&
          Number(d.cantidadEjecutada) === nuevoOrdenado[i].cantidadEjecutada &&
          Number(d.precioUnitarioContratista) === nuevoOrdenado[i].precioUnitarioContratista
      );

    if (sinCambios) return { tipo: "SIN_CAMBIOS", montoNeto };

    const valorAnterior = {
      montoBruto: Number(existente.montoBruto),
      montoNeto: Number(existente.montoNeto),
      estatus: existente.estatus,
      detalle: anteriorOrdenado.map((d) => ({
        conceptoId: d.conceptoId,
        descripcionConcepto: d.descripcionConcepto,
        cantidadEjecutada: Number(d.cantidadEjecutada),
        precioUnitarioContratista: Number(d.precioUnitarioContratista),
        importe: Number(d.importe),
      })),
    };

    await tx.corteSemanalConcepto.deleteMany({ where: { corteSemanalId: existente.id } });
    const corte = await tx.corteSemanal.update({
      where: { id: existente.id },
      data: {
        montoBruto,
        montoNeto,
        estatus: nuevoEstatusCorte,
        detalle: { create: datosDetalle },
      },
    });

    const movimientoAnterior = existente.movimientoSemanal!;
    const movimiento = await tx.movimientoSemanal.update({
      where: { id: movimientoAnterior.id },
      data: {
        montoFinSemana: montoNeto,
        estatusAprobacion: nuevoEstatusCorte === "ANULADO" ? "CANCELADO" : "APROBADO",
        estatusPago: nuevoEstatusCorte === "ANULADO" ? "SIN_MOVIMIENTO" : "PENDIENTE_PAGO",
      },
    });

    await auditarTx(tx, {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      entidad: "CorteSemanal",
      entidadId: corte.id,
      accion: "EDITAR",
      valorAnterior,
      valorNuevo: { montoBruto, montoNeto, estatus: nuevoEstatusCorte, detalle: datosDetalle },
    });
    await auditarTx(tx, {
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuarioId,
      entidad: "MovimientoSemanal",
      entidadId: movimiento.id,
      accion: "EDITAR",
      valorAnterior: {
        montoFinSemana: Number(movimientoAnterior.montoFinSemana),
        estatusAprobacion: movimientoAnterior.estatusAprobacion,
        estatusPago: movimientoAnterior.estatusPago,
      },
      valorNuevo: {
        montoFinSemana: montoNeto,
        estatusAprobacion: movimiento.estatusAprobacion,
        estatusPago: movimiento.estatusPago,
      },
    });

    return { tipo: "RECONCILIADO", montoNeto };
  }

  // No existe corte todavía — nace GENERADO siempre, aunque el monto diera 0
  // no tiene sentido nacer ya anulado (no hay nada previo que congelar).
  const numero = (await tx.corteSemanal.count({ where: { proyectoId: ctx.proyectoId } })) + 1;

  const movimiento = await tx.movimientoSemanal.create({
    data: {
      beneficiarioProyectoId: ctx.beneficiarioProyectoId,
      semanaId: ctx.semanaId,
      contratoContratistaId,
      montoFinSemana: montoNeto,
      estatusAprobacion: "APROBADO",
      estatusPago: "PENDIENTE_PAGO",
      enviadoPorId: ctx.usuarioId,
      aprobadoPorId: ctx.usuarioId,
    },
  });

  const corte = await tx.corteSemanal.create({
    data: {
      empresaId: ctx.empresaId,
      proyectoId: ctx.proyectoId,
      semanaId: ctx.semanaId,
      cierreSemanaProyectoId: ctx.cierreSemanaProyectoId,
      beneficiarioProyectoId: ctx.beneficiarioProyectoId,
      numero,
      montoBruto,
      montoNeto,
      estatus: "GENERADO",
      movimientoSemanalId: movimiento.id,
      generadoPorId: ctx.usuarioId,
      detalle: { create: datosDetalle },
    },
  });

  await auditarTx(tx, {
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    entidad: "CorteSemanal",
    entidadId: corte.id,
    accion: "CREAR",
    valorNuevo: { montoBruto, montoNeto, estatus: "GENERADO", detalle: datosDetalle },
  });
  await auditarTx(tx, {
    empresaId: ctx.empresaId,
    usuarioId: ctx.usuarioId,
    entidad: "MovimientoSemanal",
    entidadId: movimiento.id,
    accion: "CREAR",
    valorNuevo: {
      beneficiarioProyectoId: ctx.beneficiarioProyectoId,
      semanaId: ctx.semanaId,
      montoFinSemana: montoNeto,
      estatusAprobacion: "APROBADO",
      estatusPago: "PENDIENTE_PAGO",
    },
  });

  return { tipo: "CREADO", montoNeto };
}

export type ResultadoCierreSemana = {
  yaEstabaCerrada: boolean;
  cortesGenerados: number;
  cortesReconciliados: number;
  cortesOmitidosPorLiquidado: number;
  montoTotalGenerado: number;
};

export async function cerrarSemana(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string
): Promise<ResultadoCierreSemana> {
  const empresaId = requerirCerrar(usuario);

  try {
    return await db.$transaction(
      async (tx) => {
        const proyecto = await tx.proyecto.findFirst({ where: { id: proyectoId, empresaId } });
        if (!proyecto) throw new RegistroNoEncontradoError("El proyecto");
        const semana = await tx.semana.findFirst({ where: { id: semanaId, empresaId } });
        if (!semana) throw new RegistroNoEncontradoError("La semana");

        const cierreExistente = await tx.cierreSemanaProyecto.findUnique({
          where: { proyectoId_semanaId: { proyectoId, semanaId } },
        });

        // No-op real: cerrar dos veces (doble clic, reintento) no crea ni
        // duplica nada.
        if (cierreExistente?.estatus === "CERRADA") {
          return {
            yaEstabaCerrada: true,
            cortesGenerados: 0,
            cortesReconciliados: 0,
            cortesOmitidosPorLiquidado: 0,
            montoTotalGenerado: 0,
          };
        }

        // Se revalidan las reglas de bloqueo DENTRO de la transacción — evita
        // que algo cambie entre ver el resumen y darle clic al botón.
        const pendientes = await tx.avanceConcepto.count({
          where: {
            semanaId,
            estatusAprobacion: "PENDIENTE",
            cantidadEjecutada: { gt: 0 },
            concepto: { partida: { proyectoId } },
          },
        });
        if (pendientes > 0) {
          const plural = pendientes === 1 ? "" : "s";
          throw new ValidacionError(
            `Hay ${pendientes} avance${plural} pendiente${plural} por aprobar esta semana. Apruébalo${plural} o recházalo${plural} antes de cerrar.`
          );
        }

        const lineas = await obtenerLineasAvanceAprobado(tx, proyectoId, semanaId);
        const sinContratista = lineas.filter((l) => !l.beneficiarioProyectoId);
        if (sinContratista.length > 0) {
          const nombres = [...new Set(sinContratista.map((l) => l.descripcionConcepto))].join(", ");
          const plural = sinContratista.length === 1 ? "" : "s";
          const verbo = sinContratista.length === 1 ? "tiene" : "tienen";
          throw new ValidacionError(
            `${sinContratista.length} concepto${plural} con avance aprobado no ${verbo} contratista asignado: ${nombres}.`
          );
        }

        const cierre = cierreExistente
          ? await tx.cierreSemanaProyecto.update({
              where: { id: cierreExistente.id },
              data: { estatus: "CERRADA", cerradoPorId: usuario.id, cerradoEn: new Date() },
            })
          : await tx.cierreSemanaProyecto.create({
              data: {
                empresaId,
                proyectoId,
                semanaId,
                estatus: "CERRADA",
                cerradoPorId: usuario.id,
              },
            });

        await auditarTx(tx, {
          empresaId,
          usuarioId: usuario.id,
          entidad: "CierreSemanaProyecto",
          entidadId: cierre.id,
          accion: cierreExistente ? "CAMBIAR_ESTATUS" : "CREAR",
          valorAnterior: cierreExistente ? { estatus: cierreExistente.estatus } : null,
          valorNuevo: { estatus: "CERRADA" },
        });

        const porContratista = new Map<string, LineaAvanceParaCierre[]>();
        for (const linea of lineas) {
          const grupo = porContratista.get(linea.beneficiarioProyectoId!) ?? [];
          grupo.push(linea);
          porContratista.set(linea.beneficiarioProyectoId!, grupo);
        }

        // Contratistas que YA tenían un corte vigente en un cierre anterior
        // pero que esta vez no aparecen en `lineas` (su avance aprobado bajó
        // a 0 tras una reapertura) — hay que reconciliarlos igual, para que
        // su corte pase a ANULADO en vez de quedar con un monto obsoleto.
        const cortesVigentesSinLineas = await tx.corteSemanal.findMany({
          where: {
            proyectoId,
            semanaId,
            estatus: "GENERADO",
            beneficiarioProyectoId: { notIn: [...porContratista.keys()] },
          },
          select: { beneficiarioProyectoId: true },
        });
        for (const c of cortesVigentesSinLineas) {
          if (!porContratista.has(c.beneficiarioProyectoId)) {
            porContratista.set(c.beneficiarioProyectoId, []);
          }
        }

        let cortesGenerados = 0;
        let cortesReconciliados = 0;
        let cortesOmitidosPorLiquidado = 0;
        let montoTotalGenerado = 0;

        for (const [beneficiarioProyectoId, grupoLineas] of porContratista) {
          const resultado = await generarOReconciliarCorte(
            tx,
            {
              empresaId,
              proyectoId,
              semanaId,
              cierreSemanaProyectoId: cierre.id,
              beneficiarioProyectoId,
              usuarioId: usuario.id,
            },
            grupoLineas
          );
          if (resultado.tipo === "OMITIDO_LIQUIDADO") {
            cortesOmitidosPorLiquidado++;
          } else {
            if (resultado.tipo === "CREADO") cortesGenerados++;
            if (resultado.tipo === "RECONCILIADO") cortesReconciliados++;
            montoTotalGenerado += resultado.montoNeto;
          }
        }

        return {
          yaEstabaCerrada: false,
          cortesGenerados,
          cortesReconciliados,
          cortesOmitidosPorLiquidado,
          montoTotalGenerado,
        };
      },
      { timeout: 20000 }
    );
  } catch (error) {
    // Carrera real (doble clic simultáneo): otro proceso ganó el candado
    // único de CierreSemanaProyecto — se trata como éxito idempotente, no
    // como error del usuario.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const cierre = await db.cierreSemanaProyecto.findUnique({
        where: { proyectoId_semanaId: { proyectoId, semanaId } },
      });
      if (cierre?.estatus === "CERRADA") {
        return {
          yaEstabaCerrada: true,
          cortesGenerados: 0,
          cortesReconciliados: 0,
          cortesOmitidosPorLiquidado: 0,
          montoTotalGenerado: 0,
        };
      }
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reabrir — solo cambia el candado de captura; nunca toca CorteSemanal ni
// MovimientoSemanal (eso solo pasa en un recierre posterior, y ahí un corte
// ya LIQUIDADO queda protegido — ver generarOReconciliarCorte).
// ---------------------------------------------------------------------------

const MotivoReaperturaSchema = z
  .string()
  .trim()
  .min(1, "El motivo de la reapertura es obligatorio.");

export async function reabrirSemana(
  usuario: UsuarioSesion,
  proyectoId: string,
  semanaId: string,
  motivoCrudo: unknown
) {
  const empresaId = requerirReabrir(usuario);
  const motivo = MotivoReaperturaSchema.parse(motivoCrudo);
  await obtenerProyecto(usuario, proyectoId);

  const cierre = await db.cierreSemanaProyecto.findFirst({
    where: { proyectoId, semanaId, empresaId },
  });
  if (!cierre) throw new RegistroNoEncontradoError("El cierre de esta semana");
  if (cierre.estatus === "ABIERTA") return cierre;

  const actualizado = await db.cierreSemanaProyecto.update({
    where: { id: cierre.id },
    data: {
      estatus: "ABIERTA",
      reabiertoPorId: usuario.id,
      reabiertoEn: new Date(),
      motivoReapertura: motivo,
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "CierreSemanaProyecto",
    entidadId: actualizado.id,
    accion: "CAMBIAR_ESTATUS",
    valorAnterior: { estatus: "CERRADA" },
    valorNuevo: { estatus: "ABIERTA", motivo },
  });

  return actualizado;
}
