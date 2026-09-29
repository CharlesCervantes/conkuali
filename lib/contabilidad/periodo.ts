// Contabilidad se consulta por MES (?periodo=YYYY-MM) — deliberadamente
// distinto del ciclo semanal (?fecha=) de Reporte General/Gastos.

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export type Periodo = { anio: number; mes: number };

export function periodoActual(): Periodo {
  const hoy = new Date();
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
}

export function parametroAPeriodo(parametro: string | undefined): Periodo {
  if (!parametro) return periodoActual();
  const partes = parametro.split("-").map(Number);
  if (partes.length !== 2 || partes.some(Number.isNaN)) return periodoActual();
  const [anio, mes] = partes;
  if (mes < 1 || mes > 12) return periodoActual();
  return { anio, mes };
}

export function periodoAParametro(periodo: Periodo): string {
  return `${periodo.anio}-${String(periodo.mes).padStart(2, "0")}`;
}

export function periodoAnterior(periodo: Periodo): Periodo {
  return periodo.mes === 1 ? { anio: periodo.anio - 1, mes: 12 } : { anio: periodo.anio, mes: periodo.mes - 1 };
}

export function periodoSiguiente(periodo: Periodo): Periodo {
  return periodo.mes === 12 ? { anio: periodo.anio + 1, mes: 1 } : { anio: periodo.anio, mes: periodo.mes + 1 };
}

export function etiquetaPeriodo(periodo: Periodo): string {
  return `${MESES[periodo.mes - 1]} ${periodo.anio}`;
}

// ---------------------------------------------------------------------------
// Rangos de fecha del nuevo Estado de Resultados (Contabilidad —
// reconocimiento, septiembre 2026) — deliberadamente un tipo distinto de
// `Periodo` (mes calendario, ya usado por Ingresos/Egresos/Facturas): el
// selector nuevo (Este mes/Mes anterior/Trimestre/Año/Personalizado) es más
// amplio y ninguna pantalla existente lo necesitaba antes. `hasta` es
// exclusivo, mismo criterio que rangoMes() de cada servicio de Contabilidad.
// ---------------------------------------------------------------------------

export type RangoPeriodo = { desde: Date; hasta: Date; etiqueta: string };

export type TipoRango = "ESTE_MES" | "MES_ANTERIOR" | "TRIMESTRE" | "ANIO" | "PERSONALIZADO";

function inicioDia(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

function finDiaExclusivo(fecha: Date): Date {
  const d = inicioDia(fecha);
  d.setDate(d.getDate() + 1);
  return d;
}

export function resolverRango(
  tipo: TipoRango,
  personalizado?: { desde: string; hasta: string }
): RangoPeriodo {
  const hoy = new Date();

  if (tipo === "MES_ANTERIOR") {
    const p = periodoAnterior(periodoActual());
    const { desde, hasta } = rangoDeMes(p);
    return { desde, hasta, etiqueta: etiquetaPeriodo(p) };
  }

  if (tipo === "TRIMESTRE") {
    const trimestreInicio = Math.floor(hoy.getMonth() / 3) * 3;
    const desde = new Date(hoy.getFullYear(), trimestreInicio, 1);
    const hasta = new Date(hoy.getFullYear(), trimestreInicio + 3, 1);
    return { desde, hasta, etiqueta: `Trimestre ${Math.floor(trimestreInicio / 3) + 1} ${hoy.getFullYear()}` };
  }

  if (tipo === "ANIO") {
    const desde = new Date(hoy.getFullYear(), 0, 1);
    const hasta = new Date(hoy.getFullYear() + 1, 0, 1);
    return { desde, hasta, etiqueta: `${hoy.getFullYear()}` };
  }

  if (tipo === "PERSONALIZADO" && personalizado) {
    const desde = inicioDia(new Date(personalizado.desde));
    const hasta = finDiaExclusivo(new Date(personalizado.hasta));
    return { desde, hasta, etiqueta: "Personalizado" };
  }

  // ESTE_MES — también el fallback si PERSONALIZADO no trae fechas válidas.
  const p = periodoActual();
  const { desde, hasta } = rangoDeMes(p);
  return { desde, hasta, etiqueta: etiquetaPeriodo(p) };
}

function rangoDeMes(periodo: Periodo): { desde: Date; hasta: Date } {
  return { desde: new Date(periodo.anio, periodo.mes - 1, 1), hasta: new Date(periodo.anio, periodo.mes, 1) };
}

// Acumulado del año — mismo año que `hasta` del rango dado, desde el 1 de
// enero. Reutilizado por obtenerEstadoResultadosComparado para calcular la
// columna "Acumulado del año" con la MISMA función que el periodo actual,
// nunca una fórmula aparte (evita lógica contable duplicada).
export function rangoAcumuladoAnual(rango: RangoPeriodo): RangoPeriodo {
  const anio = rango.hasta.getMonth() === 0 && rango.hasta.getDate() === 1
    ? rango.hasta.getFullYear() - 1
    : rango.hasta.getFullYear();
  return {
    desde: new Date(anio, 0, 1),
    hasta: rango.hasta,
    etiqueta: `Acumulado ${anio}`,
  };
}
