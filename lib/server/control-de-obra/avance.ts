import "server-only";
import * as z from "zod";
import { db } from "@/lib/server/db";
import { registrarAuditoria } from "@/lib/server/auditoria";
import { puedeReportarAvance, puedeAdministrarProyectos } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import type { EstatusAprobacionAvance } from "@/lib/generated/prisma/enums";
import { SinPermisoError, ValidacionError, obtenerProyecto } from "./proyectos";
import {
  partidasConConceptos,
  resolverContratistaPorConcepto,
  RegistroNoEncontradoError,
} from "./estructura-contractual";
import { verificarSemanaEditable } from "./cierre-semana";
import { sumaEjecutadaPorConcepto } from "./avance-calculo";

export { sumaEjecutadaPorConcepto };

function requerirEmpresa(usuario: UsuarioSesion): string {
  if (!usuario.empresa) throw new SinPermisoError();
  return usuario.empresa.id;
}

// ---------------------------------------------------------------------------
// Cálculo (nada de esto se guarda — siempre se deriva de AvanceConcepto)
// ---------------------------------------------------------------------------

export type EstadoAvanceConcepto = "SIN_INICIAR" | "EN_PROCESO" | "TERMINADO";

export type AvanceCalculado = {
  cantidadTotal: number;
  acumulado: number;
  pendiente: number;
  avancePorcentaje: number;
  estado: EstadoAvanceConcepto;
};

function calcularEstado(acumulado: number, total: number): EstadoAvanceConcepto {
  if (acumulado <= 0) return "SIN_INICIAR";
  if (acumulado >= total) return "TERMINADO";
  return "EN_PROCESO";
}

function calcularAvance(cantidadTotal: number, acumulado: number): AvanceCalculado {
  return {
    cantidadTotal,
    acumulado,
    pendiente: cantidadTotal - acumulado,
    avancePorcentaje: cantidadTotal > 0 ? (acumulado / cantidadTotal) * 100 : 0,
    estado: calcularEstado(acumulado, cantidadTotal),
  };
}

// ---------------------------------------------------------------------------
// Lectura — pestaña Avance de obra (una semana específica)
// ---------------------------------------------------------------------------

type ConceptoBase = Awaited<
  ReturnType<typeof partidasConConceptos>
>[number]["conceptos"][number];

// Campos Decimal de Concepto (presupuesto de Contrato General) — se
// convierten explícitamente a number antes de devolverse, porque esta forma
// cruza hacia FormAvanceSemanal ("use client") y las instancias de
// Prisma.Decimal no son serializables de Server a Client Component. No
// afecta lo que se guarda en Postgres/Prisma, solo esta lectura.
type CamposDecimalConcepto =
  | "cantidadContratada"
  | "precioUnitarioContratista"
  | "precioUnitarioMateriales"
  | "precioUnitarioIndirectos"
  | "precioUnitarioHerramienta"
  | "porcentajeUtilidad"
  | "porcentajeAdministracion"
  | "precioUnitarioContratistaPrivado"
  | "cantidadContratadaPrivado";

export type ConceptoConAvance = Omit<ConceptoBase, CamposDecimalConcepto> &
  AvanceCalculado & {
    cantidadContratada: number;
    precioUnitarioContratista: number | null;
    precioUnitarioMateriales: number | null;
    precioUnitarioIndirectos: number | null;
    precioUnitarioHerramienta: number | null;
    porcentajeUtilidad: number | null;
    porcentajeAdministracion: number | null;
    // No se usan en esta vista (operativo, no Privado) pero igual hay que
    // convertirlos — `...concepto` los arrastra sin tocarlos, y un
    // Prisma.Decimal crudo no es serializable de Server a Client Component
    // (rompía obtenerAvanceSemanal desde que se agregaron estos campos).
    precioUnitarioContratistaPrivado: number | null;
    cantidadContratadaPrivado: number | null;
    anterior: number;
    estaSemana: number;
    // null = nada capturado todavía esta semana (no hay fila que aprobar).
    estatusAprobacion: EstatusAprobacionAvance | null;
    // P.U. CONTRATADO (resuelto vía ContratoConcepto) — distinto del
    // presupuesto `Concepto.precioUnitarioContratista` (Etapa B, Contrato
    // General) que ya viene incluido arriba. null si el concepto no tiene
    // contratista asignado o si tiene varios (no atribuible, sección 49.8).
    // Visible a los 4 roles (sección 49.9, sustituye el gate por
    // puedeAdministrarProyectos que tenía esta pantalla antes).
    precioUnitarioContratistaContratado: number | null;
  };

function numOrNull(valor: { toNumber(): number } | null): number | null {
  return valor === null ? null : valor.toNumber();
}

export async function obtenerAvanceSemanal(
  usuario: UsuarioSesion,
  proyectoId: string,
  semana: { id: string; fechaInicio: Date }
) {
  await obtenerProyecto(usuario, proyectoId);

  // resolverContratistaPorConcepto no depende de conceptoIds (filtra por
  // proyectoId directamente) — va en la primera fase junto con partidas, no
  // en la segunda, donde tendría que esperar sin necesidad.
  const [partidas, resolucionContratista] = await Promise.all([
    partidasConConceptos(proyectoId),
    resolverContratistaPorConcepto(proyectoId),
  ]);
  const conceptoIds = partidas.flatMap((p) => p.conceptos.map((c) => c.id));

  const [anteriorPorConcepto, filasEstaSemana] = await Promise.all([
    sumaEjecutadaPorConcepto(conceptoIds, semana.fechaInicio),
    db.avanceConcepto.findMany({
      where: { conceptoId: { in: conceptoIds }, semanaId: semana.id },
    }),
  ]);
  const estaSemanaPorConcepto = new Map(
    filasEstaSemana.map((f) => [f.conceptoId, Number(f.cantidadEjecutada)])
  );
  const estatusPorConcepto = new Map(
    filasEstaSemana.map((f) => [f.conceptoId, f.estatusAprobacion])
  );

  return partidas.map((partida) => ({
    ...partida,
    conceptos: partida.conceptos.map((concepto): ConceptoConAvance => {
      const anterior = anteriorPorConcepto.get(concepto.id) ?? 0;
      const estaSemana = estaSemanaPorConcepto.get(concepto.id) ?? 0;
      // El acumulado "oficial" solo suma lo APROBADO. Mientras esta semana
      // esté pendiente/rechazada, Acumulado/Pendiente/% no se mueven todavía
      // — la vista de captura sigue mostrando lo tecleado, pero lo que cuenta
      // como oficial (aquí y en Contratistas) espera la aprobación.
      const estatusSemana = estatusPorConcepto.get(concepto.id) ?? null;
      const acumulado = anterior + (estatusSemana === "APROBADO" ? estaSemana : 0);
      return {
        ...concepto,
        cantidadContratada: Number(concepto.cantidadContratada),
        precioUnitarioContratista: numOrNull(concepto.precioUnitarioContratista),
        precioUnitarioMateriales: numOrNull(concepto.precioUnitarioMateriales),
        precioUnitarioIndirectos: numOrNull(concepto.precioUnitarioIndirectos),
        precioUnitarioHerramienta: numOrNull(concepto.precioUnitarioHerramienta),
        porcentajeUtilidad: numOrNull(concepto.porcentajeUtilidad),
        porcentajeAdministracion: numOrNull(concepto.porcentajeAdministracion),
        precioUnitarioContratistaPrivado: numOrNull(concepto.precioUnitarioContratistaPrivado),
        cantidadContratadaPrivado: numOrNull(concepto.cantidadContratadaPrivado),
        anterior,
        estaSemana,
        estatusAprobacion: estatusSemana,
        precioUnitarioContratistaContratado:
          resolucionContratista.get(concepto.id)?.precioUnitarioContratista ?? null,
        ...calcularAvance(Number(concepto.cantidadContratada), acumulado),
      };
    }),
  }));
}

// En semana cerrada, solo se muestran conceptos con avance real registrado
// ESA semana (estaSemana > 0) — una partida sin ningún concepto con
// movimiento tampoco se muestra. Compartido por Avance de obra y por Cliente/
// Cliente Priv. (misma regla, un solo lugar — sección 4/5 del diseño de
// Cliente, agosto 2026).
export function filtrarPartidasConMovimiento<
  P extends { conceptos: { estaSemana: number }[] },
>(partidas: P[]): P[] {
  return partidas
    .map((p) => ({ ...p, conceptos: p.conceptos.filter((c) => c.estaSemana > 0) }))
    .filter((p) => p.conceptos.length > 0);
}

// ---------------------------------------------------------------------------
// Lectura — enriquecer Contratistas con avance acumulado a la fecha
// ---------------------------------------------------------------------------

export async function obtenerAvanceAcumuladoPorConcepto(
  usuario: UsuarioSesion,
  proyectoId: string
): Promise<Map<string, AvanceCalculado>> {
  await obtenerProyecto(usuario, proyectoId);

  // Se resuelve por proyectoId, no a partir de la lista de conceptos de
  // `partidas` — así el caller no tiene que esperar a que esa consulta
  // termine primero y puede pedir todo en un solo Promise.all.
  const conceptos = await db.concepto.findMany({
    where: { partida: { proyectoId } },
    select: { id: true, cantidadContratada: true },
  });
  const conceptoIds = conceptos.map((c) => c.id);
  const acumuladoPorConcepto = await sumaEjecutadaPorConcepto(conceptoIds);

  const resultado = new Map<string, AvanceCalculado>();
  for (const concepto of conceptos) {
    const acumulado = acumuladoPorConcepto.get(concepto.id) ?? 0;
    resultado.set(
      concepto.id,
      calcularAvance(Number(concepto.cantidadContratada), acumulado)
    );
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Escritura — captura en lote
// ---------------------------------------------------------------------------

const FilaCapturaSchema = z.object({
  conceptoId: z.string().min(1),
  cantidadEjecutada: z.coerce.number().min(0, "La cantidad no puede ser negativa."),
});

const CapturaAvanceSchema = z.object({
  semanaId: z.string().min(1),
  filas: z.array(FilaCapturaSchema),
});

export async function guardarAvanceSemanal(
  usuario: UsuarioSesion,
  proyectoId: string,
  datosCrudos: unknown
): Promise<{ guardados: number }> {
  if (!puedeReportarAvance(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);
  await obtenerProyecto(usuario, proyectoId);

  const datos = CapturaAvanceSchema.parse(datosCrudos);
  if (datos.filas.length === 0) return { guardados: 0 };

  const semana = await db.semana.findFirst({ where: { id: datos.semanaId, empresaId } });
  if (!semana) throw new RegistroNoEncontradoError("La semana");

  // Bloqueo general: la semana está cerrada para este proyecto (candado
  // fino por concepto liquidado se revisa más abajo, una vez resuelto qué
  // conceptos de verdad van a cambiar).
  await verificarSemanaEditable(proyectoId, semana.id, []);

  // Solo conceptos que en verdad pertenecen a este proyecto (protege contra
  // enviar ids de otro proyecto/empresa).
  const conceptoIds = datos.filas.map((f) => f.conceptoId);
  const conceptos = await db.concepto.findMany({
    where: { id: { in: conceptoIds }, partida: { proyectoId } },
    select: { id: true, descripcion: true, cantidadContratada: true },
  });
  const conceptoPorId = new Map(conceptos.map((c) => [c.id, c]));

  const [anteriorPorConcepto, existentes] = await Promise.all([
    sumaEjecutadaPorConcepto([...conceptoPorId.keys()], semana.fechaInicio),
    db.avanceConcepto.findMany({
      where: { conceptoId: { in: [...conceptoPorId.keys()] }, semanaId: semana.id },
    }),
  ]);
  const existentePorConcepto = new Map(existentes.map((f) => [f.conceptoId, f]));

  // Pase 1: validar TODO antes de escribir nada — si algo excede lo
  // contratado, no se guarda ni siquiera lo que sí era válido en el mismo envío.
  const porGuardar: {
    conceptoId: string;
    cantidadEjecutada: number;
    existenteId?: string;
    valorPrevio: number;
  }[] = [];

  for (const fila of datos.filas) {
    const concepto = conceptoPorId.get(fila.conceptoId);
    if (!concepto) continue; // no pertenece a este proyecto — se ignora

    const existente = existentePorConcepto.get(fila.conceptoId);
    const valorPrevio = existente ? Number(existente.cantidadEjecutada) : 0;
    if (fila.cantidadEjecutada === valorPrevio) continue; // sin cambios

    const anterior = anteriorPorConcepto.get(fila.conceptoId) ?? 0;
    const acumuladoProspectivo = anterior + fila.cantidadEjecutada;
    const total = Number(concepto.cantidadContratada);

    if (acumuladoProspectivo > total) {
      throw new ValidacionError(
        `"${concepto.descripcion}" excede la cantidad contratada (${total}). ` +
          `El acumulado resultante sería ${acumuladoProspectivo}.`
      );
    }

    porGuardar.push({
      conceptoId: fila.conceptoId,
      cantidadEjecutada: fila.cantidadEjecutada,
      existenteId: existente?.id,
      valorPrevio,
    });
  }

  // Candado fino: aunque la semana esté abierta (nunca se cerró, o se
  // reabrió), un concepto que ya forma parte de un corte LIQUIDADO queda
  // protegido — solo se revisa contra lo que de verdad va a cambiar.
  await verificarSemanaEditable(
    proyectoId,
    semana.id,
    porGuardar.map((f) => f.conceptoId)
  );

  // Pase 2: escribir + auditar (upsert nunca duplica; cada semana conserva su
  // propia fila, nunca se sobreescribe el histórico de semanas anteriores).
  // Cualquier guardado — sea de Supervisor o de quien ya lo había aprobado —
  // regresa el registro a PENDIENTE: aprobar es siempre una acción explícita
  // aparte, nunca implícita al editar (decisión de sesión, agosto 2026).
  for (const fila of porGuardar) {
    const avance = await db.avanceConcepto.upsert({
      where: {
        conceptoId_semanaId: { conceptoId: fila.conceptoId, semanaId: semana.id },
      },
      update: {
        cantidadEjecutada: fila.cantidadEjecutada,
        registradoPorId: usuario.id,
        estatusAprobacion: "PENDIENTE",
        aprobadoPorId: null,
        fechaAprobacion: null,
      },
      create: {
        empresaId,
        conceptoId: fila.conceptoId,
        semanaId: semana.id,
        cantidadEjecutada: fila.cantidadEjecutada,
        registradoPorId: usuario.id,
        estatusAprobacion: "PENDIENTE",
      },
    });

    await registrarAuditoria({
      empresaId,
      usuarioId: usuario.id,
      entidad: "AvanceConcepto",
      entidadId: avance.id,
      accion: fila.existenteId ? "EDITAR" : "CREAR",
      valorAnterior: fila.existenteId ? { cantidadEjecutada: fila.valorPrevio } : null,
      valorNuevo: { cantidadEjecutada: fila.cantidadEjecutada },
    });
  }

  return { guardados: porGuardar.length };
}

// ---------------------------------------------------------------------------
// Aprobación
// ---------------------------------------------------------------------------

export async function cambiarEstatusAprobacionAvance(
  usuario: UsuarioSesion,
  conceptoId: string,
  semanaId: string,
  nuevoEstatus: "APROBADO" | "RECHAZADO"
) {
  if (!puedeAdministrarProyectos(usuario)) throw new SinPermisoError();
  const empresaId = requerirEmpresa(usuario);

  const avance = await db.avanceConcepto.findFirst({
    where: { conceptoId, semanaId, empresaId },
    include: { concepto: { select: { partida: { select: { proyectoId: true } } } } },
  });
  if (!avance) throw new RegistroNoEncontradoError("El avance de este concepto");

  await verificarSemanaEditable(avance.concepto.partida.proyectoId, semanaId, [conceptoId]);

  const actualizado = await db.avanceConcepto.update({
    where: { id: avance.id },
    data: {
      estatusAprobacion: nuevoEstatus,
      aprobadoPorId: usuario.id,
      fechaAprobacion: new Date(),
    },
  });

  await registrarAuditoria({
    empresaId,
    usuarioId: usuario.id,
    entidad: "AvanceConcepto",
    entidadId: actualizado.id,
    accion: nuevoEstatus === "APROBADO" ? "CONFIRMAR" : "RECHAZAR",
    valorAnterior: { estatusAprobacion: avance.estatusAprobacion },
    valorNuevo: { estatusAprobacion: actualizado.estatusAprobacion },
  });

  return actualizado;
}

// ---------------------------------------------------------------------------
// Aviso en el listado de Control de Obra
// ---------------------------------------------------------------------------

export async function contarPendientesPorProyecto(
  empresaId: string
): Promise<Map<string, number>> {
  const filas = await db.avanceConcepto.findMany({
    where: { empresaId, estatusAprobacion: "PENDIENTE" },
    select: { concepto: { select: { partida: { select: { proyectoId: true } } } } },
  });

  const conteo = new Map<string, number>();
  for (const fila of filas) {
    const proyectoId = fila.concepto.partida.proyectoId;
    conteo.set(proyectoId, (conteo.get(proyectoId) ?? 0) + 1);
  }
  return conteo;
}
