import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { obtenerSaldosMediosFinancieros } from "@/lib/server/contabilidad/saldos";
import { usuarioDePrueba } from "../helpers/usuarios";

// C3 — saldos bancarios reales solo para quien puede ver información
// privada. Las consultas a la BD se sustituyen en memoria (sin BD real) para
// verificar QUÉ se consulta: con el acceso restringido no debe leerse ningún
// movimiento ni calcularse ningún saldo. Cifras ficticias.

type Args = { where?: Record<string, unknown>; select?: Record<string, unknown> };

// Dos Empresas, dos cuentas cada una.
const MEDIOS = [
  { empresaId: "empresa-prueba", id: "banco-a", nombre: "Banco A", tipo: "BANCO", activo: true, moneda: "MXN", numeroCuentaEnmascarado: "1234", saldoInicial: 100000, fechaSaldoInicial: new Date(2026, 0, 1) },
  { empresaId: "empresa-prueba", id: "caja", nombre: "Caja", tipo: "EFECTIVO", activo: true, moneda: "MXN", numeroCuentaEnmascarado: null, saldoInicial: 5000, fechaSaldoInicial: null },
  { empresaId: "empresa-ajena", id: "banco-ajeno", nombre: "Banco Ajeno", tipo: "BANCO", activo: true, moneda: "MXN", numeroCuentaEnmascarado: null, saldoInicial: 777, fechaSaldoInicial: null },
];
// Movimientos por cuenta (lo que devolverían las consultas del cálculo).
// banco-a: cobros 600,000 (incluye un cobro de capa PRIVADO de 432,109.55) + ingreso manual 20,000 − egresos 150,000 − 30,000.
const COBRO_PRIVADO = 432109.55;
const DATOS_CUENTA: Record<string, { cobros: number[]; ingresosManuales: number; egresosGasto: number[]; egresosManuales: number }> = {
  "banco-a": { cobros: [167890.45, COBRO_PRIVADO], ingresosManuales: 20000, egresosGasto: [150000], egresosManuales: 30000 },
  caja: { cobros: [], ingresosManuales: 0, egresosGasto: [1200], egresosManuales: 0 },
};
const SALDO_BANCO_A = 100000 + 600000 + 20000 - 150000 - 30000; // 540,000
const SALDO_CAJA = 5000 - 1200; // 3,800

let historiaPrivada: Set<string>;
let llamadas: { modelo: string; metodo: string; args: Args }[];
const originales: [Record<string, unknown>, string, unknown][] = [];

function sustituir(modelo: string, metodo: string, impl: (args: Args) => unknown) {
  const destino = (db as unknown as Record<string, Record<string, unknown>>)[modelo];
  originales.push([destino, metodo, destino[metodo]]);
  destino[metodo] = async (args: Args) => {
    llamadas.push({ modelo, metodo, args });
    return impl(args);
  };
}
const cuentaDe = (args: Args, campo: string) => {
  const w = args.where ?? {};
  if (campo === "ingreso") return ((w.ingreso as Record<string, unknown>)?.cuentaReceptoraId as string) ?? "";
  return (w[campo] as string) ?? "";
};
const dec = (n: number) => ({ toString: () => String(n), valueOf: () => n });

beforeEach(() => {
  historiaPrivada = new Set();
  llamadas = [];
  sustituir("medioFinanciero", "findMany", (a) => MEDIOS.filter((m) => m.empresaId === a.where?.empresaId).map((m) => ({ ...m, saldoInicial: dec(m.saldoInicial) })));
  // Comprobación de existencia (solo Empresas sin Privado).
  sustituir("ingreso", "findFirst", (a) => (historiaPrivada.has(a.where?.empresaId as string) ? { id: "ingreso-x" } : null));
  sustituir("movimientoFinancieroCliente", "findMany", (a) => (DATOS_CUENTA[cuentaDe(a, "ingreso")]?.cobros ?? []).map((m) => ({ monto: dec(m) })));
  sustituir("ingreso", "aggregate", (a) => ({ _sum: { monto: dec(DATOS_CUENTA[cuentaDe(a, "cuentaReceptoraId")]?.ingresosManuales ?? 0) } }));
  sustituir("egreso", "findMany", (a) => (DATOS_CUENTA[cuentaDe(a, "medioFinancieroId")]?.egresosGasto ?? []).map((m) => ({ gastoObra: { monto: dec(m) } })));
  sustituir("egreso", "aggregate", (a) => ({ _sum: { monto: dec(DATOS_CUENTA[cuentaDe(a, "medioFinancieroId")]?.egresosManuales ?? 0) } }));
});
afterEach(() => {
  for (const [destino, metodo, original] of originales.splice(0)) destino[metodo] = original;
});

const consultasDeMovimientos = () =>
  llamadas.filter((l) => (l.modelo === "movimientoFinancieroCliente" || l.modelo === "egreso" || (l.modelo === "ingreso" && l.metodo === "aggregate")));

function assertRestringido(r: Awaited<ReturnType<typeof obtenerSaldosMediosFinancieros>>) {
  assert.equal(r.saldosRestringidos, true);
  assert.deepEqual(r.medios.map((m) => m.saldoActual), [null, null], "todas las cuentas de la Empresa quedan restringidas");
  assert.equal(consultasDeMovimientos().length, 0, "no debe consultarse ningún movimiento para calcular saldos");
  const json = JSON.stringify(r);
  for (const monto of [SALDO_BANCO_A, SALDO_CAJA, COBRO_PRIVADO, 600000]) assert.ok(!json.includes(String(monto)), `no debe viajar ${monto}`);
  // Lo que sí permanece visible.
  assert.deepEqual(
    r.medios.map((m) => [m.nombre, m.tipo, m.moneda, m.activo, m.saldoInicial]),
    [["Banco A", "BANCO", "MXN", true, 100000], ["Caja", "EFECTIVO", "MXN", true, 5000]]
  );
}
function assertDisponible(r: Awaited<ReturnType<typeof obtenerSaldosMediosFinancieros>>) {
  assert.equal(r.saldosRestringidos, false);
  // Regresión: misma fórmula de siempre.
  assert.deepEqual(r.medios.map((m) => [m.id, m.saldoActual]), [["banco-a", SALDO_BANCO_A], ["caja", SALDO_CAJA]]);
}

describe("C3 — Empresa CON Privado habilitado", () => {
  for (const rol of ["DIRECTOR", "ADMINISTRADOR"] as const) {
    test(`${rol} con switch privado encendido: saldos reales`, async () => {
      assertDisponible(await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol })));
    });
    test(`${rol} con switch privado apagado: saldos restringidos`, async () => {
      assertRestringido(await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol, vistaPrivadaActiva: false })));
    });
  }

  test("No se hace la comprobación de historia privada (no hace falta)", async () => {
    await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol: "DIRECTOR", vistaPrivadaActiva: false }));
    assert.equal(llamadas.filter((l) => l.modelo === "ingreso" && l.metodo === "findFirst").length, 0);
  });
});

describe("C3 — Empresa SIN Privado habilitado", () => {
  for (const rol of ["DIRECTOR", "ADMINISTRADOR"] as const) {
    for (const vistaPrivadaActiva of [true, false]) {
      test(`${rol} (switch ${vistaPrivadaActiva ? "on" : "off"}) sin cobros privados históricos con cuenta: saldos reales`, async () => {
        assertDisponible(await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol, vistaPrivadaActiva, privadoHabilitado: false })));
      });
      test(`${rol} (switch ${vistaPrivadaActiva ? "on" : "off"}) con cobros privados históricos con cuenta: TODOS los saldos restringidos`, async () => {
        historiaPrivada.add("empresa-prueba");
        assertRestringido(await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol, vistaPrivadaActiva, privadoHabilitado: false })));
      });
    }
  }

  test("La comprobación de existencia es por Empresa, solo pide el id y filtra capa PRIVADO con cuenta", async () => {
    await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol: "DIRECTOR", privadoHabilitado: false }));
    const existencia = llamadas.filter((l) => l.modelo === "ingreso" && l.metodo === "findFirst");
    assert.equal(existencia.length, 1, "una sola comprobación para toda la Empresa, no por cuenta");
    const { where, select } = existencia[0].args;
    assert.deepEqual(select, { id: true }, "no devuelve importes, fechas, referencias ni detalles");
    assert.equal(where?.empresaId, "empresa-prueba");
    assert.ok(!("cuentaReceptoraId" in (where ?? {})) || typeof where?.cuentaReceptoraId === "object", "no se acota a una cuenta concreta");
    assert.match(JSON.stringify(where), /"capa":"PRIVADO"/);
    assert.match(JSON.stringify(where), /"estatus":"VIGENTE"/);
  });

  test("Historia privada de OTRA Empresa no restringe los saldos propios", async () => {
    historiaPrivada.add("empresa-ajena");
    assertDisponible(await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol: "DIRECTOR", privadoHabilitado: false })));
  });
});

describe("C3 — roles sin acceso y aislamiento multiempresa", () => {
  test("Supervisor y MASTER siguen sin acceso a Contabilidad", async () => {
    await assert.rejects(obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol: "SUPERVISOR" })));
    await assert.rejects(obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol: "MASTER" })));
    assert.equal(consultasDeMovimientos().length, 0);
  });

  test("Cada Empresa ve solo sus cuentas y sus saldos", async () => {
    const r = await obtenerSaldosMediosFinancieros(usuarioDePrueba({ rol: "DIRECTOR", empresaId: "empresa-ajena" }));
    assert.deepEqual(r.medios.map((m) => m.id), ["banco-ajeno"]);
    assert.ok(!JSON.stringify(r).includes('"banco-a"') && !JSON.stringify(r).includes('"caja"'));
    assert.equal(r.medios[0].saldoActual, 777, "saldo propio de la otra Empresa (sin movimientos)");
  });
});
