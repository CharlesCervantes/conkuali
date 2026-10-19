import { db } from "@/lib/server/db";

// Base de datos SIMULADA en memoria para probar el ciclo de Reposiciones
// (aprobar gasto → reposición → abonos / liquidación en Reporte General):
// - implementa solo las consultas que esas rutas usan;
// - `SELECT … FOR UPDATE` toma un candado real por fila (cola), que se libera
//   al terminar la transacción, y cada consulta cede el turno para que las
//   transacciones concurrentes realmente se intercalen;
// - cada transacción lleva su propia bitácora de deshacer: si falla, solo se
//   revierte lo que ELLA escribió (nunca lo que otra ya confirmó).
// Nunca toca una base real. Se instala sobre el cliente `db` y se restaura con
// `restaurar()`.

type Fila = Record<string, unknown>;

export const EMPRESA = "empresa-prueba";
export const PROYECTO = "proyecto-1";
export const SEMANA = "semana-41";

export type Movimiento = {
  id: string;
  beneficiarioProyectoId: string;
  semanaId: string;
  origen: "CORTE_CONTRATISTA" | "REPOSICION_GASTOS" | "ORDEN_COMPRA" | "MANUAL";
  montoEntreSemana: number;
  montoFinSemana: number;
  estatusAprobacion: string;
  estatusPago: string;
  fechaPago: Date | null;
  metodoPago: string | null;
  referenciaPago: string | null;
  notasPago: string | null;
  liquidadoPorId: string | null;
};
export type Reposicion = {
  id: string;
  empresaId: string;
  proyectoId: string;
  semanaId: string;
  beneficiarioId: string;
  folio: string;
  estatus: string;
  cerrada: boolean;
  movimientoSemanalId: string | null;
};
export type Gasto = {
  id: string;
  empresaId: string;
  proyectoId: string;
  semanaId: string;
  monto: number;
  estatus: string;
  pagadorBeneficiarioId: string | null;
  reposicionGastosId: string | null;
  tratamientoCliente: string;
  incluidoEnCapaOperativoId: string | null;
  incluidoEnCapaPrivadoId: string | null;
  descripcion?: string;
  fecha?: Date;
};
export type Abono = {
  id: string;
  reposicionGastosId: string;
  monto: number;
  fecha: Date;
  metodoPago: string;
  referencia: string | null;
  notas: string | null;
  registradoPorId: string;
};

const ceder = () => new Promise<void>((r) => setImmediate(r));
const cederVarias = async () => {
  for (let i = 0; i < 15; i++) await ceder();
};

function coincide(fila: Fila, where: Fila | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([llave, esperado]) => {
    const valor = fila[llave];
    if (esperado !== null && typeof esperado === "object" && !(esperado instanceof Date)) {
      const op = esperado as { in?: unknown[]; not?: unknown };
      if (op.in) return op.in.includes(valor);
      if ("not" in op) return valor !== op.not;
      return true; // relación anidada: se resuelve fuera
    }
    return valor === esperado;
  });
}

export function crearBdReposiciones(inicial: {
  movimientos?: Movimiento[];
  reposiciones?: Reposicion[];
  gastos?: Gasto[];
  abonos?: Abono[];
}) {
  const t = {
    movimientos: (inicial.movimientos ?? []).map((x) => ({ ...x })),
    reposiciones: (inicial.reposiciones ?? []).map((x) => ({ ...x })),
    gastos: (inicial.gastos ?? []).map((x) => ({ ...x })),
    abonos: (inicial.abonos ?? []).map((x) => ({ ...x })),
    beneficiarioProyectos: [] as { id: string; beneficiarioId: string; proyectoId: string }[],
    auditorias: [] as Fila[],
  };
  let folio = 100;
  let siguiente = 1;
  let fallarEn: string | null = null;
  // Falla en la n-ésima escritura de `fallarEn` (1 = la primera).
  let fallarEnVez = 1;
  let vecesVistas = 0;

  // Candados por fila.
  const candados = new Map<string, Promise<void>>();
  async function tomarCandado(llave: string): Promise<() => void> {
    const anterior = candados.get(llave) ?? Promise.resolve();
    let liberar!: () => void;
    const actual = new Promise<void>((r) => (liberar = r));
    candados.set(llave, anterior.then(() => actual));
    await anterior;
    return liberar;
  }

  const empresaDeMovimiento = (m: Movimiento) => (m.beneficiarioProyectoId.startsWith("bp-ajeno") ? "empresa-ajena" : EMPRESA);

  // `candadoImplicito`: como en PostgreSQL, un UPDATE dentro de una
  // transacción toma el candado de la fila aunque no se haya pedido FOR
  // UPDATE — así un orden de bloqueo inconsistente se manifiesta (cuelga) aquí.
  function delegados(deshacer: (() => void)[] | null, candadoImplicito?: (clave: string) => Promise<void>) {
    const candado = async (clave: string) => {
      if (candadoImplicito) await candadoImplicito(clave);
    };
    const anotar = (fn: () => void) => deshacer?.push(fn);
    const escribir = async (op: string) => {
      await cederVarias();
      if (fallarEn === op && ++vecesVistas === fallarEnVez) throw new Error(`Falla simulada en ${op}`);
    };
    const reposicionConRelaciones = (r: Reposicion) => ({
      ...r,
      gastos: t.gastos.filter((g) => g.reposicionGastosId === r.id).map((g) => ({ ...g })),
      abonos: t.abonos.filter((a) => a.reposicionGastosId === r.id).map((a) => ({ ...a, registradoPor: { nombre: "Usuario Prueba" } })),
      movimientoSemanal: r.movimientoSemanalId ? { ...t.movimientos.find((m) => m.id === r.movimientoSemanalId)! } : null,
      beneficiario: { nombre: "Andrés" },
      creadoPor: { nombre: "Usuario Prueba" },
      createdAt: new Date(2026, 9, 1),
    });
    const actualizarFila = <T extends Fila>(fila: T, data: Fila) => {
      const previo = { ...fila };
      Object.assign(fila, data);
      // Deshacer exacto: también quita las columnas que la escritura agregó.
      anotar(() => {
        for (const clave of Object.keys(fila)) if (!(clave in previo)) delete fila[clave];
        Object.assign(fila, previo);
      });
      return { ...fila };
    };

    return {
      movimientoSemanal: {
        findFirst: async ({ where }: { where: Fila }) => {
          await ceder();
          const empresaId = ((where.beneficiarioProyecto as Fila)?.proyecto as Fila)?.empresaId;
          const m = t.movimientos.find((x) => coincide(x, where) && (!empresaId || empresaDeMovimiento(x) === empresaId));
          return m ? { ...m } : null;
        },
        findUnique: async ({ where }: { where: Fila }) => (await ceder(), t.movimientos.find((m) => m.id === where.id) ? { ...t.movimientos.find((m) => m.id === where.id)! } : null),
        findUniqueOrThrow: async ({ where }: { where: Fila }) => {
          await ceder();
          const m = t.movimientos.find((x) => x.id === where.id);
          if (!m) throw new Error("No encontrado");
          return { ...m };
        },
        update: async ({ where, data }: { where: Fila; data: Fila }) => {
          await candado(`movimientos_semanales:${String(where.id)}`);
          await escribir("movimiento.update");
          return actualizarFila(t.movimientos.find((m) => m.id === where.id)! as unknown as Fila, data);
        },
        create: async ({ data }: { data: Fila }) => {
          await escribir("movimiento.create");
          const m = { id: `mov-${siguiente++}`, montoEntreSemana: 0, fechaPago: null, metodoPago: null, referenciaPago: null, notasPago: null, liquidadoPorId: null, ...data } as Movimiento;
          m.montoFinSemana = Number(m.montoFinSemana);
          t.movimientos.push(m);
          anotar(() => t.movimientos.splice(t.movimientos.indexOf(m), 1));
          return { ...m };
        },
      },
      reposicionGastos: {
        findFirst: async ({ where }: { where: Fila }) => {
          await ceder();
          const r = t.reposiciones.find((x) => coincide(x, where));
          return r ? reposicionConRelaciones(r) : null;
        },
        findFirstOrThrow: async ({ where }: { where: Fila }) => {
          await ceder();
          const r = t.reposiciones.find((x) => coincide(x, where));
          if (!r) throw new Error("No encontrada");
          return reposicionConRelaciones(r);
        },
        findUnique: async ({ where }: { where: Fila }) => {
          await ceder();
          const r = t.reposiciones.find((x) => coincide(x, where));
          return r ? reposicionConRelaciones(r) : null;
        },
        findUniqueOrThrow: async ({ where }: { where: Fila }) => {
          await ceder();
          const r = t.reposiciones.find((x) => coincide(x, where));
          if (!r) throw new Error("No encontrada");
          return reposicionConRelaciones(r);
        },
        findMany: async ({ where }: { where: Fila }) => (await ceder(), t.reposiciones.filter((x) => coincide(x, where)).map(reposicionConRelaciones)),
        update: async ({ where, data }: { where: Fila; data: Fila }) => {
          await candado(`reposiciones_gastos:${String(where.id)}`);
          await escribir("reposicion.update");
          return actualizarFila(t.reposiciones.find((r) => r.id === where.id)! as unknown as Fila, data);
        },
        updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
          for (const r of t.reposiciones.filter((x) => coincide(x, where))) await candado(`reposiciones_gastos:${r.id}`);
          await escribir("reposicion.updateMany");
          const filas = t.reposiciones.filter((r) => coincide(r, where));
          filas.forEach((r) => actualizarFila(r as unknown as Fila, data));
          return { count: filas.length };
        },
        create: async ({ data }: { data: Fila }) => {
          await escribir("reposicion.create");
          const r = { id: `rep-${siguiente++}`, cerrada: false, movimientoSemanalId: null, ...data } as Reposicion;
          t.reposiciones.push(r);
          anotar(() => t.reposiciones.splice(t.reposiciones.indexOf(r), 1));
          return reposicionConRelaciones(r);
        },
      },
      gastoObra: {
        findFirst: async ({ where }: { where: Fila }) => (await ceder(), t.gastos.find((g) => coincide(g, where)) ? { ...t.gastos.find((g) => coincide(g, where))! } : null),
        findMany: async ({ where }: { where: Fila }) => (await ceder(), t.gastos.filter((g) => coincide(g, where)).map((g) => ({ ...g }))),
        update: async ({ where, data }: { where: Fila; data: Fila }) => {
          await escribir("gasto.update");
          return actualizarFila(t.gastos.find((g) => g.id === where.id)! as unknown as Fila, data);
        },
      },
      abonoReposicion: {
        create: async ({ data }: { data: Fila }) => {
          await escribir("abono.create");
          const a = { id: `abono-${siguiente++}`, referencia: null, notas: null, ...data, monto: Number(data.monto) } as Abono;
          t.abonos.push(a);
          anotar(() => t.abonos.splice(t.abonos.indexOf(a), 1));
          return { ...a };
        },
      },
      empresa: {
        update: async () => {
          await escribir("empresa.update");
          folio++;
          return { ultimoFolioReposicion: folio };
        },
      },
      beneficiarioProyecto: {
        upsert: async ({ where }: { where: Fila }) => {
          await ceder();
          const clave = where.beneficiarioId_proyectoId as { beneficiarioId: string; proyectoId: string };
          let bp = t.beneficiarioProyectos.find((x) => x.beneficiarioId === clave.beneficiarioId && x.proyectoId === clave.proyectoId);
          if (!bp) {
            const nuevo = { id: `bp-${clave.beneficiarioId}`, ...clave };
            t.beneficiarioProyectos.push(nuevo);
            anotar(() => t.beneficiarioProyectos.splice(t.beneficiarioProyectos.indexOf(nuevo), 1));
            bp = nuevo;
          }
          return bp;
        },
      },
      proyecto: {
        findFirst: async ({ where }: { where: Fila }) => (await ceder(), where.id === PROYECTO && where.empresaId === EMPRESA ? { id: PROYECTO, empresaId: EMPRESA, nombre: "Obra Prueba" } : null),
      },
      registroAuditoria: {
        create: async ({ data }: { data: Fila }) => {
          await escribir("auditoria");
          t.auditorias.push(data);
          anotar(() => t.auditorias.splice(t.auditorias.indexOf(data), 1));
          return data;
        },
      },
    };
  }

  async function transaccion<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const deshacer: (() => void)[] = [];
    const liberaciones: (() => void)[] = [];
    // Como en PostgreSQL, una transacción que ya tiene el candado de una fila
    // puede volver a pedirlo sin bloquearse a sí misma.
    const candadosTomados = new Set<string>();
    const tomarReentrante = async (clave: string) => {
      if (candadosTomados.has(clave)) return;
      candadosTomados.add(clave);
      liberaciones.push(await tomarCandado(clave));
    };
    const tx = {
      ...delegados(deshacer, tomarReentrante),
      $queryRaw: async (partes: TemplateStringsArray, ...valores: unknown[]) => {
        const sql = partes.join("?");
        if (/FOR UPDATE/i.test(sql)) {
          const tabla = /FROM\s+(\w+)/i.exec(sql)?.[1] ?? "?";
          await tomarReentrante(`${tabla}:${String(valores[0])}`);
        }
        await ceder();
        return [];
      },
    };
    try {
      return await fn(tx);
    } catch (error) {
      for (const d of deshacer.reverse()) d();
      throw error;
    } finally {
      liberaciones.reverse().forEach((l) => l());
    }
  }

  const cliente = db as unknown as Record<string, Record<string, unknown>> & { $transaction: unknown };
  const originales: [Record<string, unknown>, string, unknown][] = [];
  for (const [nombre, metodos] of Object.entries(delegados(null))) {
    const destino = cliente[nombre];
    for (const [metodo, impl] of Object.entries(metodos)) {
      originales.push([destino, metodo, destino[metodo]]);
      destino[metodo] = impl;
    }
  }
  const transaccionOriginal = cliente.$transaction;
  (cliente as { $transaction: unknown }).$transaction = transaccion;

  return {
    t,
    fallarEn: (op: string | null, vez = 1) => {
      fallarEn = op;
      fallarEnVez = vez;
      vecesVistas = 0;
    },
    abonado: (reposicionId: string) => t.abonos.filter((a) => a.reposicionGastosId === reposicionId).reduce((s, a) => s + a.monto, 0),
    restaurar: () => {
      for (const [destino, metodo, original] of originales) destino[metodo] = original;
      (cliente as { $transaction: unknown }).$transaction = transaccionOriginal;
    },
  };
}
