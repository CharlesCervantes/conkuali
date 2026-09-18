import "server-only";
import { db } from "@/lib/server/db";
import { Prisma } from "@/lib/generated/prisma/client";

// El Proyecto(tipo=OFICINA) es el vehículo TÉCNICO interno que reutiliza toda
// la arquitectura ya existente de Gastos/MovimientoSemanal/Reporte General
// para "Gastos de Empresa" — nunca una entidad paralela (Gastos transversal,
// septiembre 2026). Al usuario esto SIEMPRE se le muestra como "Empresa",
// nunca como "Oficina" ni con el nombre real de este Proyecto — ver
// EMPRESA_PROYECTO_LABEL más abajo, úsalo en vez de leer proyecto.nombre
// directamente en cualquier pantalla nueva de Gastos.
//
// Exactamente uno por Empresa — reforzado en base de datos con un índice
// único parcial (WHERE tipo = 'OFICINA', ver migración
// 20260910120000_gastos_transversal), no solo en este servicio. Se autocrea
// perezosamente la primera vez que hace falta (nunca hardcodeado a
// Conkuali ni a ninguna otra Empresa).
export const EMPRESA_PROYECTO_LABEL = "Empresa";

export async function obtenerOCrearProyectoOficina(empresaId: string): Promise<string> {
  const existente = await db.proyecto.findFirst({
    where: { empresaId, tipo: "OFICINA" },
    select: { id: true },
  });
  if (existente) return existente.id;

  try {
    const creado = await db.proyecto.create({
      data: {
        empresaId,
        // Nombre interno únicamente — nunca se muestra tal cual en ninguna
        // pantalla de Gastos (usar EMPRESA_PROYECTO_LABEL). Sirve solo como
        // valor de respaldo legible si esta fila llegara a inspeccionarse
        // directamente (ej. Prisma Studio, auditoría).
        nombre: "Gastos de Empresa",
        tipo: "OFICINA",
        estatus: "ACTIVO",
      },
      select: { id: true },
    });
    return creado.id;
  } catch (error) {
    // Carrera real (dos capturas de gasto de Empresa simultáneas, primera
    // vez): el índice único parcial gana y la otra transacción pierde con
    // P2002 — se trata como éxito idempotente, se relee el que sí se creó.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const ganador = await db.proyecto.findFirstOrThrow({
        where: { empresaId, tipo: "OFICINA" },
        select: { id: true },
      });
      return ganador.id;
    }
    throw error;
  }
}

// Solo lectura — nunca crea la fila. Para pantallas que solo necesitan
// MOSTRAR datos de Gastos de Empresa (Reporte General, dashboard): si la
// Empresa nunca ha capturado un gasto de Empresa, no hay Proyecto-Oficina
// todavía y no hay nada que mostrar — no tiene sentido crearlo solo por
// renderizar una página de lectura.
export async function obtenerProyectoOficinaId(empresaId: string): Promise<string | null> {
  const existente = await db.proyecto.findFirst({
    where: { empresaId, tipo: "OFICINA" },
    select: { id: true },
  });
  return existente?.id ?? null;
}

export async function esProyectoOficina(proyectoId: string): Promise<boolean> {
  const proyecto = await db.proyecto.findUnique({
    where: { id: proyectoId },
    select: { tipo: true },
  });
  return proyecto?.tipo === "OFICINA";
}
