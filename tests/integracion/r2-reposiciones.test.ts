import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { aprobarGasto } from "@/lib/server/control-de-obra/gastos";
import { obtenerReposiciones, registrarAbonoReposicion } from "@/lib/server/control-de-obra/reposiciones";
import { liquidarMovimiento } from "@/lib/server/reporte-general/liquidar";
import {
  BENEFICIARIO,
  EMPRESA,
  PROYECTO,
  SEMANA,
  abonosDe,
  admin,
  adminAjeno,
  baseLimpiaConDatos,
  conFallaSimulada,
  crearGasto,
  rechazosInesperados,
  repetir,
  sinInterbloqueos,
  sumaAbonos,
  supervisor,
} from "./apoyo/base";

// R2 contra PostgreSQL REAL (base local dedicada, verificada por
// tests/setup/integracion.mjs): candados FOR UPDATE reales, detección de
// interbloqueos de PostgreSQL, índice único parcial, numeric(14,2) y
// rollback real. Datos ficticios: reposición de Andrés por $10,000.00.

const LIQUIDACION = { fechaPago: "2026-10-09", metodoPago: "TRANSFERENCIA", referenciaPago: "SPEI-INT", notasPago: "Prueba de integración" };
const abono = (monto: number) => ({ monto, fecha: "2026-10-08", metodoPago: "EFECTIVO" });
const VUELTAS_CONCURRENCIA = 8;

after(() => db.$disconnect());
beforeEach(() => baseLimpiaConDatos());

// Flujo real: gastos pendientes → aprobarGasto → reposición + movimiento.
async function reposicionAprobada(montos = ["6000.00", "4000.00"]) {
  for (const [i, monto] of montos.entries()) {
    await crearGasto(`g${i + 1}`, monto);
    await aprobarGasto(admin, `g${i + 1}`);
  }
  const rep = await db.reposicionGastos.findFirstOrThrow({ where: { empresaId: EMPRESA, cerrada: false } });
  return { repId: rep.id, movId: rep.movimientoSemanalId! };
}

const movimiento = (id: string) => db.movimientoSemanal.findUniqueOrThrow({ where: { id } });
const reposicion = (id: string) => db.reposicionGastos.findUniqueOrThrow({ where: { id } });

// Reposición histórica (anterior a R2) sembrada directamente, sin pasar por
// los flujos actuales — para clases A y B.
async function historica(opciones: { cerrada: boolean; estatusPago: "LIQUIDADO" | "PENDIENTE_PAGO"; montoMovimiento?: string; abonos?: string[] }) {
  const bp = await db.beneficiarioProyecto.create({ data: { beneficiarioId: BENEFICIARIO, proyectoId: PROYECTO } });
  const liquidado = opciones.estatusPago === "LIQUIDADO";
  const mov = await db.movimientoSemanal.create({
    data: {
      beneficiarioProyectoId: bp.id,
      semanaId: SEMANA,
      origen: "REPOSICION_GASTOS",
      montoFinSemana: opciones.montoMovimiento ?? "10000.00",
      estatusAprobacion: "APROBADO",
      estatusPago: opciones.estatusPago,
      enviadoPorId: admin.id,
      aprobadoPorId: admin.id,
      ...(liquidado ? { fechaPago: new Date(Date.UTC(2026, 8, 30)), liquidadoPorId: admin.id, liquidadoEn: new Date(Date.UTC(2026, 8, 30)) } : {}),
    },
  });
  const rep = await db.reposicionGastos.create({
    data: {
      id: "rep-historica",
      empresaId: EMPRESA,
      proyectoId: PROYECTO,
      semanaId: SEMANA,
      folio: "REP-H-0001",
      numeroFolio: 9001,
      beneficiarioId: BENEFICIARIO,
      creadoPorId: admin.id,
      estatus: "APROBADA",
      cerrada: opciones.cerrada,
      movimientoSemanalId: mov.id,
    },
  });
  await crearGasto("gh1", "6000.00", { estatus: "APROBADO", reposicionGastosId: rep.id });
  await crearGasto("gh2", "4000.00", { estatus: "APROBADO", reposicionGastosId: rep.id });
  for (const monto of opciones.abonos ?? []) {
    await db.abonoReposicion.create({
      data: { reposicionGastosId: rep.id, monto, fecha: new Date(Date.UTC(2026, 8, 29)), metodoPago: "EFECTIVO", registradoPorId: admin.id },
    });
  }
  return { repId: rep.id, movId: mov.id };
}

describe("R2 en PostgreSQL — liquidación", () => {
  test("Sin abonos previos: un abono final por el total exacto", async () => {
    const { repId, movId } = await reposicionAprobada();
    await liquidarMovimiento(admin, movId, LIQUIDACION);
    assert.deepEqual(await abonosDe(repId), ["10000.00"]);
    assert.equal((await movimiento(movId)).estatusPago, "LIQUIDADO");
    assert.equal(Number((await movimiento(movId)).montoFinSemana), 10000, "el movimiento conserva el importe original");
    assert.equal((await reposicion(repId)).cerrada, true);
  });

  test("Precisión decimal: el abono final es el saldo exacto en centavos", async () => {
    const { repId, movId } = await reposicionAprobada(["3333.33", "3333.33", "3333.34"]);
    await registrarAbonoReposicion(admin, repId, abono(1234.56));
    await liquidarMovimiento(admin, movId, LIQUIDACION);
    assert.deepEqual(await abonosDe(repId), ["1234.56", "8765.44"]);
    assert.equal(await sumaAbonos(repId), "10000.00");
  });

  test("Doble liquidación: la segunda no crea nada", async () => {
    const { repId, movId } = await reposicionAprobada();
    await liquidarMovimiento(admin, movId, LIQUIDACION);
    await liquidarMovimiento(admin, movId, LIQUIDACION);
    assert.deepEqual(await abonosDe(repId), ["10000.00"]);
  });

  test("Abono después de liquidar: se rechaza", async () => {
    const { repId, movId } = await reposicionAprobada();
    await liquidarMovimiento(admin, movId, LIQUIDACION);
    await assert.rejects(registrarAbonoReposicion(admin, repId, abono(1)), /liquidada/);
    assert.equal(await sumaAbonos(repId), "10000.00");
  });

  test("Rollback real: si falla marcar el movimiento, no queda abono final ni cierre", async () => {
    const { repId, movId } = await reposicionAprobada();
    const auditoriasAntes = await db.registroAuditoria.count();
    await conFallaSimulada("movimientos_semanales", `NEW."estatusPago" = 'LIQUIDADO'`, () =>
      assert.rejects(liquidarMovimiento(admin, movId, LIQUIDACION), /Falla simulada/)
    );
    assert.deepEqual(await abonosDe(repId), []);
    assert.equal((await movimiento(movId)).estatusPago, "PENDIENTE_PAGO");
    assert.equal((await reposicion(repId)).cerrada, false);
    assert.equal(await db.registroAuditoria.count(), auditoriasAntes);
  });

  test("Rollback real: si falla la asignación, la aprobación del gasto se revierte", async () => {
    const { repId, movId } = await reposicionAprobada();
    await crearGasto("g3", "2000.00");
    const auditoriasAntes = await db.registroAuditoria.count();
    await conFallaSimulada("movimientos_semanales", `TG_OP = 'UPDATE' AND NEW."montoFinSemana" IS DISTINCT FROM OLD."montoFinSemana"`, () =>
      assert.rejects(aprobarGasto(admin, "g3"), /Falla simulada/)
    );
    const g3 = await db.gastoObra.findUniqueOrThrow({ where: { id: "g3" } });
    assert.equal(g3.estatus, "PENDIENTE_REVISION");
    assert.equal(g3.reposicionGastosId, null);
    assert.equal(Number((await movimiento(movId)).montoFinSemana), 10000);
    assert.equal(await db.gastoObra.count({ where: { reposicionGastosId: repId } }), 2);
    assert.equal(await db.registroAuditoria.count(), auditoriasAntes);
  });
});

describe("R2 en PostgreSQL — concurrencia con candados reales", () => {
  test("Dos liquidaciones simultáneas: un solo abono final", async () => {
    await repetir(VUELTAS_CONCURRENCIA, async () => {
      await baseLimpiaConDatos();
      const { repId, movId } = await reposicionAprobada();
      const r = await Promise.allSettled([liquidarMovimiento(admin, movId, LIQUIDACION), liquidarMovimiento(admin, movId, LIQUIDACION)]);
      sinInterbloqueos(r);
      assert.deepEqual(rechazosInesperados(r, /^$/), []);
      assert.deepEqual(await abonosDe(repId), ["10000.00"]);
    });
  });

  test("Abono parcial y liquidación simultáneos: nunca exceden el total", async () => {
    await repetir(VUELTAS_CONCURRENCIA, async () => {
      await baseLimpiaConDatos();
      const { repId, movId } = await reposicionAprobada();
      const r = await Promise.allSettled([registrarAbonoReposicion(admin, repId, abono(4000)), liquidarMovimiento(admin, movId, LIQUIDACION)]);
      sinInterbloqueos(r);
      assert.deepEqual(rechazosInesperados(r, /liquidada/), []);
      assert.equal(await sumaAbonos(repId), "10000.00");
      assert.equal((await movimiento(movId)).estatusPago, "LIQUIDADO");
    });
  });

  test("Abono que completa el saldo y liquidación simultáneos: sin interbloqueo ni pago doble", async () => {
    await repetir(VUELTAS_CONCURRENCIA, async () => {
      await baseLimpiaConDatos();
      const { repId, movId } = await reposicionAprobada();
      await registrarAbonoReposicion(admin, repId, abono(4000));
      const r = await Promise.allSettled([registrarAbonoReposicion(admin, repId, abono(6000)), liquidarMovimiento(admin, movId, LIQUIDACION)]);
      sinInterbloqueos(r);
      assert.deepEqual(rechazosInesperados(r, /liquidada/), []);
      assert.equal(await sumaAbonos(repId), "10000.00");
      assert.equal((await abonosDe(repId)).length, 2);
      assert.equal((await movimiento(movId)).estatusPago, "LIQUIDADO");
    });
  });

  test("Dos abonos simultáneos por el saldo: solo uno se registra", async () => {
    await repetir(VUELTAS_CONCURRENCIA, async () => {
      await baseLimpiaConDatos();
      const { repId, movId } = await reposicionAprobada();
      await registrarAbonoReposicion(admin, repId, abono(4000));
      const r = await Promise.allSettled([registrarAbonoReposicion(admin, repId, abono(6000)), registrarAbonoReposicion(admin, repId, abono(6000))]);
      sinInterbloqueos(r);
      assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
      assert.deepEqual(rechazosInesperados(r, /liquidada|excede/), []);
      assert.equal(await sumaAbonos(repId), "10000.00");
      assert.equal((await movimiento(movId)).estatusPago, "LIQUIDADO");
    });
  });

  test("Aprobar un gasto mientras se liquida: sin interbloqueo y sin pagos de más", async () => {
    await repetir(VUELTAS_CONCURRENCIA, async () => {
      await baseLimpiaConDatos();
      const { movId } = await reposicionAprobada();
      await crearGasto("g3", "2000.00");
      const r = await Promise.allSettled([aprobarGasto(admin, "g3"), liquidarMovimiento(admin, movId, LIQUIDACION)]);
      sinInterbloqueos(r);
      assert.deepEqual(rechazosInesperados(r, /^$/), []);
      for (const rep of await db.reposicionGastos.findMany({ where: { empresaId: EMPRESA } })) {
        const total = (await db.gastoObra.findMany({ where: { reposicionGastosId: rep.id } })).reduce((s, g) => s + Number(g.monto), 0);
        const mov = await movimiento(rep.movimientoSemanalId!);
        assert.equal(Number(mov.montoEntreSemana) + Number(mov.montoFinSemana), total, "movimiento = total de sus gastos");
        if (mov.estatusPago === "LIQUIDADO") assert.equal(Number(await sumaAbonos(rep.id)), total);
        else assert.equal(rep.cerrada, false);
      }
      const g3 = await db.gastoObra.findUniqueOrThrow({ where: { id: "g3" } });
      assert.ok(g3.reposicionGastosId, "el gasto quedó en una reposición");
    });
  });
});

describe("R2 en PostgreSQL — índice único de reposiciones abiertas", () => {
  test("No puede haber dos reposiciones abiertas para el mismo beneficiario, obra y semana", async () => {
    await reposicionAprobada();
    await assert.rejects(
      db.reposicionGastos.create({
        data: {
          empresaId: EMPRESA,
          proyectoId: PROYECTO,
          semanaId: SEMANA,
          folio: "REP-DUP-0001",
          numeroFolio: 9999,
          beneficiarioId: BENEFICIARIO,
          creadoPorId: admin.id,
          estatus: "APROBADA",
        },
      }),
      (error: { code?: string; message?: string }) => error.code === "P2002" || /unique|única|duplicate/i.test(String(error.message))
    );
  });

  test("Tras liquidar, un gasto nuevo abre una complementaria válida", async () => {
    const { repId, movId } = await reposicionAprobada();
    await liquidarMovimiento(admin, movId, LIQUIDACION);
    await crearGasto("g3", "2000.00");
    await aprobarGasto(admin, "g3");
    const reps = await db.reposicionGastos.findMany({ where: { empresaId: EMPRESA }, orderBy: { createdAt: "asc" } });
    assert.equal(reps.length, 2);
    assert.equal(reps[0].id, repId);
    assert.equal(reps[0].cerrada, true);
    assert.equal(reps[1].cerrada, false);
    const complementaria = await movimiento(reps[1].movimientoSemanalId!);
    assert.equal(Number(complementaria.montoFinSemana), 2000);
    assert.equal(complementaria.estatusPago, "PENDIENTE_PAGO");
    assert.deepEqual(await abonosDe(repId), ["10000.00"], "la original no cambia");
  });
});

describe("R2 en PostgreSQL — reposiciones históricas (sin modificarlas)", () => {
  test("Clase A — liquidada y cerrada sin abonos: se ve pagada, pendiente 0, sin abonos retroactivos", async () => {
    const { repId } = await historica({ cerrada: true, estatusPago: "LIQUIDADO" });
    const fila = (await obtenerReposiciones(admin, PROYECTO, SEMANA)).find((f) => f.id === repId)!;
    assert.deepEqual([fila.estado, fila.saldoPendiente, fila.requiereRevision], ["PAGADA", 0, false]);
    assert.deepEqual(await abonosDe(repId), []);
  });

  test("Clase B — liquidada sin cerrar: rechaza gastos nuevos y queda intacta", async () => {
    const { repId } = await historica({ cerrada: false, estatusPago: "LIQUIDADO" });
    const antes = JSON.stringify(await reposicion(repId));
    await crearGasto("g-nuevo", "500.00");
    await assert.rejects(aprobarGasto(admin, "g-nuevo"), /requiere revisión/);
    assert.equal(JSON.stringify(await reposicion(repId)), antes);
    assert.equal((await db.gastoObra.findUniqueOrThrow({ where: { id: "g-nuevo" } })).estatus, "PENDIENTE_REVISION");
    assert.deepEqual(await abonosDe(repId), []);
  });

  test("Clase B — cerrada sin liquidar: queda intacta, se crea complementaria y su liquidación se bloquea", async () => {
    const { repId, movId } = await historica({ cerrada: true, estatusPago: "PENDIENTE_PAGO" });
    const antes = JSON.stringify(await reposicion(repId));
    await crearGasto("g-nuevo", "500.00");
    await aprobarGasto(admin, "g-nuevo");
    assert.equal(JSON.stringify(await reposicion(repId)), antes);
    const nuevo = await db.gastoObra.findUniqueOrThrow({ where: { id: "g-nuevo" } });
    assert.notEqual(nuevo.reposicionGastosId, repId);
    await assert.rejects(liquidarMovimiento(admin, movId, LIQUIDACION), /requiere revisión/);
    assert.deepEqual(await abonosDe(repId), []);
    assert.equal((await movimiento(movId)).estatusPago, "PENDIENTE_PAGO");
  });

  test("Clase B — abonos que exceden el total: cifras sin corregir y liquidación bloqueada", async () => {
    const { repId, movId } = await historica({ cerrada: false, estatusPago: "PENDIENTE_PAGO", abonos: ["8000.00", "4000.00"] });
    const fila = (await obtenerReposiciones(admin, PROYECTO, SEMANA)).find((f) => f.id === repId)!;
    assert.equal(fila.requiereRevision, true);
    assert.equal(fila.saldoPendiente, -2000);
    await assert.rejects(liquidarMovimiento(admin, movId, LIQUIDACION), /requiere revisión/);
    assert.equal(await sumaAbonos(repId), "12000.00");
  });
});

describe("R2 en PostgreSQL — multiempresa y permisos", () => {
  test("Otra Empresa no liquida, no abona, no ve ni aprueba lo de esta Empresa", async () => {
    const { repId, movId } = await reposicionAprobada();
    await crearGasto("g3", "2000.00");
    await assert.rejects(liquidarMovimiento(adminAjeno, movId, LIQUIDACION));
    await assert.rejects(registrarAbonoReposicion(adminAjeno, repId, abono(100)));
    await assert.rejects(aprobarGasto(adminAjeno, "g3"));
    const visibles = await obtenerReposiciones(adminAjeno, PROYECTO, SEMANA).catch(() => []);
    assert.equal(visibles.length, 0);
    assert.deepEqual(await abonosDe(repId), []);
    assert.equal((await movimiento(movId)).estatusPago, "PENDIENTE_PAGO");
  });

  test("Supervisor no puede liquidar ni abonar", async () => {
    const { repId, movId } = await reposicionAprobada();
    await assert.rejects(liquidarMovimiento(supervisor, movId, LIQUIDACION));
    await assert.rejects(registrarAbonoReposicion(supervisor, repId, abono(100)));
    assert.deepEqual(await abonosDe(repId), []);
  });
});
