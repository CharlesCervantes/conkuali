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
