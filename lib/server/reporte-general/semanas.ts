import "server-only";
import { db } from "@/lib/server/db";

// Número de semana ISO-8601 (lunes = inicio de semana, la semana que
// contiene el primer jueves del año es la semana 1).
function numeroSemanaISO(fecha: Date): { numero: number; anio: number } {
  const d = new Date(
    Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  );
  const diaISO = d.getUTCDay() || 7; // lunes=1 … domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - diaISO);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(
    ((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7
  );
  return { numero, anio: d.getUTCFullYear() };
}

function lunesDeLaSemana(fecha: Date): Date {
  const d = new Date(fecha);
  const dia = d.getDay() || 7;
  if (dia !== 1) d.setDate(d.getDate() - (dia - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

// El ciclo operativo de Conkuali es lunes a sábado
// (02-control-de-obra.md — "Ciclo operativo semanal (lunes a sábado)").
function rangoSemana(fecha: Date): {
  numero: number;
  anio: number;
  fechaInicio: Date;
  fechaFin: Date;
} {
  const { numero, anio } = numeroSemanaISO(fecha);
  const fechaInicio = lunesDeLaSemana(fecha);
  const fechaFin = new Date(fechaInicio);
  fechaFin.setDate(fechaFin.getDate() + 5);
  return { numero, anio, fechaInicio, fechaFin };
}

// Los renglones semanales se generan automáticamente (01-administracion-pagos-semanales.md)
// — aquí solo se garantiza que exista el registro de Semana, no los movimientos
// (esos dependen de que exista una participación beneficiario-proyecto, Etapa 3+).
export async function obtenerOCrearSemanaActual(empresaId: string) {
  const { numero, anio, fechaInicio, fechaFin } = rangoSemana(new Date());

  return db.semana.upsert({
    where: { empresaId_numero_anio: { empresaId, numero, anio } },
    update: {},
    create: { empresaId, numero, anio, fechaInicio, fechaFin },
  });
}

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

export function formatearRangoSemana(semana: {
  numero: number;
  anio: number;
  fechaInicio: Date;
  fechaFin: Date;
}): string {
  const inicio = semana.fechaInicio;
  const fin = semana.fechaFin;
  const mismoMes = inicio.getMonth() === fin.getMonth();
  const rango = mismoMes
    ? `${inicio.getDate()}–${fin.getDate()} ${MESES[fin.getMonth()]}`
    : `${inicio.getDate()} ${MESES[inicio.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`;
  return `Semana ${semana.numero} · ${rango} ${semana.anio}`;
}
