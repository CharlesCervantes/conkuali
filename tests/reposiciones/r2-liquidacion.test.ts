import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { liquidarMovimiento } from "@/lib/server/reporte-general/liquidar";
import { obtenerReposiciones, registrarAbonoReposicion } from "@/lib/server/control-de-obra/reposiciones";
import { aprobarGasto } from "@/lib/server/control-de-obra/gastos";
import { estadoDeReposicion } from "@/lib/control-de-obra/reposicion-estado";
import { crearBdReposiciones, EMPRESA, PROYECTO, SEMANA, type Abono, type Gasto, type Movimiento, type Reposicion } from "../helpers/bd-reposiciones";
import { usuarioDePrueba } from "../helpers/usuarios";

// R2 — una sola verdad para el pago de reposiciones: los abonos. Liquidar en
// Reporte General registra el abono final por el saldo; el movimiento
// conserva el importe original y solo marca la liquidación. Base simulada en
// memoria con candados y reversión por transacción (sin BD real). Cifras
// ficticias: reposición de Andrés por $10,000 (gastos de $6,000 y $4,000).

const admin = usuarioDePrueba({ rol: "ADMINISTRADOR" });
const supervisor = usuarioDePrueba({ rol: "SUPERVISOR" });
const LIQUIDACION = { fechaPago: "2026-10-09", metodoPago: "TRANSFERENCIA", referenciaPago: "SPEI-77", notasPago: "Pago semanal" };

const movimiento = (id: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id,
  beneficiarioProyectoId: "bp-andres",
  semanaId: SEMANA,
  origen: "REPOSICION_GASTOS",
  montoEntreSemana: 0,
  montoFinSemana: 10000,
  estatusAprobacion: "APROBADO",
  estatusPago: "PENDIENTE_PAGO",
  fechaPago: null,
  metodoPago: null,
  referenciaPago: null,
  notasPago: null,
  liquidadoPorId: null,
  ...extra,
});
const reposicion = (extra: Partial<Reposicion> = {}): Reposicion => ({
  id: "rep-andres",
  empresaId: EMPRESA,
  proyectoId: PROYECTO,
  semanaId: SEMANA,
  beneficiarioId: "benef-andres",
  folio: "REP-000001",
  estatus: "APROBADA",
  cerrada: false,
  movimientoSemanalId: "mov-rep",
  ...extra,
});
const gasto = (id: string, monto: number, extra: Partial<Gasto> = {}): Gasto => ({
  id,
  empresaId: EMPRESA,
  proyectoId: PROYECTO,
  semanaId: SEMANA,
  monto,
  estatus: "APROBADO",
  pagadorBeneficiarioId: "benef-andres",
  reposicionGastosId: "rep-andres",
  tratamientoCliente: "NO_COBRABLE",
  incluidoEnCapaOperativoId: null,
  incluidoEnCapaPrivadoId: null,
  descripcion: `Gasto ${id}`,
  fecha: new Date(2026, 9, 5),
  ...extra,
});
const abono = (id: string, monto: number): Abono => ({
  id,
  reposicionGastosId: "rep-andres",
  monto,
  fecha: new Date(2026, 9, 5),
  metodoPago: "EFECTIVO",
  referencia: null,
  notas: null,
  registradoPorId: "otro-usuario",
});

let bd: ReturnType<typeof crearBdReposiciones> | null = null;
afterEach(() => {
  bd?.restaurar();
  bd = null;
});
function escenario(opciones: { abonos?: Abono[]; reposicion?: Partial<Reposicion>; movimiento?: Partial<Movimiento>; extraGastos?: Gasto[] } = {}) {
  bd = crearBdReposiciones({
    movimientos: [
      movimiento("mov-rep", opciones.movimiento),
      movimiento("mov-corte", { origen: "CORTE_CONTRATISTA", beneficiarioProyectoId: "bp-contratista", montoFinSemana: 25000 }),
      movimiento("mov-oc", { origen: "ORDEN_COMPRA", beneficiarioProyectoId: "bp-proveedor", montoFinSemana: 8000 }),
      movimiento("mov-ajeno", { beneficiarioProyectoId: "bp-ajeno" }),
    ],
    reposiciones: [reposicion(opciones.reposicion)],
    gastos: [gasto("g1", 6000), gasto("g2", 4000), ...(opciones.extraGastos ?? [])],
    abonos: opciones.abonos ?? [],
  });
  return bd;
}
const abonosDe = (id = "rep-andres") => bd!.t.abonos.filter((a) => a.reposicionGastosId === id);
const mov = (id: string) => bd!.t.movimientos.find((m) => m.id === id)!;
const rep = (id = "rep-andres") => bd!.t.reposiciones.find((r) => r.id === id)!;

describe("R2 — liquidar una reposición desde Reporte General", () => {
  test("Sin abonos previos: un abono final por el total, con los datos de la liquidación", async () => {
    escenario();
    await liquidarMovimiento(admin, "mov-rep", LIQUIDACION);
    const abonos = abonosDe();
    assert.equal(abonos.length, 1);
    assert.equal(abonos[0].monto, 10000);
    assert.equal(abonos[0].fecha.toISOString().slice(0, 10), "2026-10-09");
    assert.equal(abonos[0].metodoPago, "TRANSFERENCIA");
    assert.equal(abonos[0].referencia, "SPEI-77");
    assert.equal(abonos[0].notas, "Pago semanal");
    assert.equal(abonos[0].registradoPorId, admin.id);
    assert.equal(mov("mov-rep").estatusPago, "LIQUIDADO");
    assert.equal(mov("mov-rep").montoFinSemana, 10000, "el movimiento conserva el importe original");
    assert.equal(rep().cerrada, true);
    assert.equal(bd!.t.gastos.length, 2, "no se crea ningún gasto");
  });

  test("Con abono parcial previo: el abono final cubre solo el saldo", async () => {
    escenario({ abonos: [abono("a1", 4000)] });
    await liquidarMovimiento(admin, "mov-rep", LIQUIDACION);
    assert.deepEqual(abonosDe().map((a) => a.monto), [4000, 6000]);
    assert.equal(bd!.abonado("rep-andres"), 10000);
    assert.equal(mov("mov-rep").montoFinSemana, 10000);
  });

  test("Abonos que completan el total liquidan sin crear un abono extra", async () => {
    escenario();
    await registrarAbonoReposicion(admin, "rep-andres", { monto: 4000, fecha: "2026-10-05", metodoPago: "EFECTIVO" });
    await registrarAbonoReposicion(admin, "rep-andres", { monto: 6000, fecha: "2026-10-08", metodoPago: "EFECTIVO" });
    assert.deepEqual(abonosDe().map((a) => a.monto), [4000, 6000]);
    assert.equal(mov("mov-rep").estatusPago, "LIQUIDADO");
    assert.equal(rep().cerrada, true);
  });

  test("Doble liquidación: la segunda no crea nada", async () => {
    escenario();
    await liquidarMovimiento(admin, "mov-rep", LIQUIDACION);
    await liquidarMovimiento(admin, "mov-rep", LIQUIDACION);
    assert.equal(abonosDe().length, 1);
    assert.equal(bd!.abonado("rep-andres"), 10000);
  });

  test("Abono después de liquidar: se rechaza", async () => {
    escenario();
    await liquidarMovimiento(admin, "mov-rep", LIQUIDACION);
    await assert.rejects(registrarAbonoReposicion(admin, "rep-andres", { monto: 1, fecha: "2026-10-10", metodoPago: "EFECTIVO" }), /liquidada/);
    assert.equal(bd!.abonado("rep-andres"), 10000);
  });

  test("Abono que intenta superar el total: se rechaza", async () => {
    escenario({ abonos: [abono("a1", 4000)] });
    await assert.rejects(registrarAbonoReposicion(admin, "rep-andres", { monto: 6000.01, fecha: "2026-10-10", metodoPago: "EFECTIVO" }), /excede el saldo/);
    assert.equal(bd!.abonado("rep-andres"), 4000);
  });

  for (const falla of ["movimiento.update", "reposicion.updateMany", "auditoria"]) {
    test(`Error intermedio (${falla}): rollback completo, sin abono ni liquidación`, async () => {
      escenario({ abonos: [abono("a1", 4000)] });
      bd!.fallarEn(falla);
      await assert.rejects(liquidarMovimiento(admin, "mov-rep", LIQUIDACION));
      assert.deepEqual(abonosDe().map((a) => a.monto), [4000]);
      assert.equal(mov("mov-rep").estatusPago, "PENDIENTE_PAGO");
      assert.equal(rep().cerrada, false);
    });
  }
});

describe("R2 — movimientos que no son reposiciones (sin cambios)", () => {
  for (const id of ["mov-corte", "mov-oc"]) {
    test(`${id}: se liquida igual que antes y no crea abonos`, async () => {
      escenario();
      await liquidarMovimiento(admin, id, LIQUIDACION);
      assert.equal(mov(id).estatusPago, "LIQUIDADO");
      assert.equal(bd!.t.abonos.length, 0);
    });
  }
});

describe("R2 — concurrencia", () => {
  test("Abono y liquidación simultáneos: nunca exceden el total", { timeout: 5000 }, async () => {
    escenario();
    await Promise.allSettled([
      registrarAbonoReposicion(admin, "rep-andres", { monto: 4000, fecha: "2026-10-08", metodoPago: "EFECTIVO" }),
      liquidarMovimiento(admin, "mov-rep", LIQUIDACION),
    ]);
    assert.equal(bd!.abonado("rep-andres"), 10000);
    assert.equal(mov("mov-rep").estatusPago, "LIQUIDADO");
    assert.ok(abonosDe().length <= 2);
  });

  test("Abono que completa el saldo y liquidación simultáneos: sin interbloqueo ni pago doble", { timeout: 5000 }, async () => {
    escenario({ abonos: [abono("a1", 4000)] });
    await Promise.allSettled([
      registrarAbonoReposicion(admin, "rep-andres", { monto: 6000, fecha: "2026-10-08", metodoPago: "EFECTIVO" }),
      liquidarMovimiento(admin, "mov-rep", LIQUIDACION),
    ]);
    assert.equal(bd!.abonado("rep-andres"), 10000);
    assert.equal(mov("mov-rep").estatusPago, "LIQUIDADO");
    assert.equal(abonosDe().length, 2);
  });

  test("Dos liquidaciones simultáneas: un solo abono final", { timeout: 5000 }, async () => {
    escenario({ abonos: [abono("a1", 4000)] });
    await Promise.allSettled([liquidarMovimiento(admin, "mov-rep", LIQUIDACION), liquidarMovimiento(admin, "mov-rep", LIQUIDACION)]);
    assert.deepEqual(abonosDe().map((a) => a.monto), [4000, 6000]);
  });

  test("Dos abonos simultáneos por el saldo: solo uno se registra", { timeout: 5000 }, async () => {
    escenario({ abonos: [abono("a1", 4000)] });
    const r = await Promise.allSettled([
      registrarAbonoReposicion(admin, "rep-andres", { monto: 6000, fecha: "2026-10-08", metodoPago: "EFECTIVO" }),
      registrarAbonoReposicion(admin, "rep-andres", { monto: 6000, fecha: "2026-10-08", metodoPago: "EFECTIVO" }),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(bd!.abonado("rep-andres"), 10000);
  });

  test("Aprobar un gasto mientras se liquida: sin bloqueo cruzado y sin pagos de más", { timeout: 5000 }, async () => {
    escenario({ extraGastos: [gasto("g3", 2000, { estatus: "PENDIENTE_REVISION", reposicionGastosId: null })] });
    const r = await Promise.allSettled([aprobarGasto(admin, "g3"), liquidarMovimiento(admin, "mov-rep", LIQUIDACION)]);
    assert.ok(r.every((x) => x.status === "fulfilled"), JSON.stringify(r));
    // Cada reposición: abonos ≤ total, y si está liquidada, abonos = total = importe del movimiento.
    for (const rp of bd!.t.reposiciones) {
      const total = bd!.t.gastos.filter((g) => g.reposicionGastosId === rp.id).reduce((s, g) => s + g.monto, 0);
      const m = bd!.t.movimientos.find((x) => x.id === rp.movimientoSemanalId)!;
      assert.equal(m.montoFinSemana, total, `movimiento de ${rp.id} = total de sus gastos`);
      if (m.estatusPago === "LIQUIDADO") assert.equal(bd!.abonado(rp.id), total);
      else assert.ok(bd!.abonado(rp.id) <= total);
    }
    const g3 = bd!.t.gastos.find((g) => g.id === "g3")!;
    const repG3 = bd!.t.reposiciones.find((x) => x.id === g3.reposicionGastosId)!;
    assert.ok(repG3, "el gasto quedó en una reposición");
    if (repG3.id !== "rep-andres") assert.equal(repG3.cerrada, false, "si llegó tarde, va a una reposición complementaria abierta");
  });
});

describe("R2 — orden de bloqueo en distintos intercalados", () => {
  // La liquidación arranca con distintos desfases respecto a la otra
  // operación, para recorrer los intercalados posibles: si alguna ruta
  // bloqueara la reposición antes que el movimiento, alguno de ellos se
  // interbloquea (como lo haría PostgreSQL).
  const desfasar = async (vueltas: number) => {
    for (let i = 0; i < vueltas; i++) await new Promise<void>((r) => setImmediate(r));
  };
  const sinInterbloqueo = <T,>(p: Promise<T>) =>
    Promise.race([p, new Promise<never>((_, rechazar) => setTimeout(() => rechazar(new Error("interbloqueo")), 1500))]);

  test("Aprobar un gasto y liquidar, con distintos desfases", { timeout: 60000 }, async () => {
    for (let vueltas = 0; vueltas <= 60; vueltas += 3) {
      bd?.restaurar();
      escenario({ extraGastos: [gasto("g3", 2000, { estatus: "PENDIENTE_REVISION", reposicionGastosId: null })] });
      const r = await sinInterbloqueo(
        Promise.allSettled([aprobarGasto(admin, "g3"), desfasar(vueltas).then(() => liquidarMovimiento(admin, "mov-rep", LIQUIDACION))])
      );
      assert.ok(r.every((x) => x.status === "fulfilled"), `desfase ${vueltas}: ${JSON.stringify(r)}`);
    }
  });

  test("Abono que completa el saldo y liquidar, con distintos desfases", { timeout: 60000 }, async () => {
    for (let vueltas = 0; vueltas <= 60; vueltas += 3) {
      bd?.restaurar();
      escenario({ abonos: [abono("a1", 4000)] });
      await sinInterbloqueo(
        Promise.allSettled([
          registrarAbonoReposicion(admin, "rep-andres", { monto: 6000, fecha: "2026-10-08", metodoPago: "EFECTIVO" }),
          desfasar(vueltas).then(() => liquidarMovimiento(admin, "mov-rep", LIQUIDACION)),
        ])
      );
      assert.equal(bd!.abonado("rep-andres"), 10000, `desfase ${vueltas}`);
      assert.equal(abonosDe().length, 2, `desfase ${vueltas}`);
    }
  });
});

describe("R2 — reposiciones históricas (sin modificarlas)", () => {
  test("Clase A — liquidada sin abonos: se ve pagada con pendiente 0", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: true } });
    const [fila] = await obtenerReposiciones(admin, PROYECTO, SEMANA);
    assert.deepEqual([fila.estado, fila.saldoPendiente, fila.requiereRevision], ["PAGADA", 0, false]);
    assert.equal(bd!.t.abonos.length, 0, "no se crean abonos retroactivos");
  });

  test("Clase A — liquidada con abonos que suman el total", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: true }, abonos: [abono("a1", 4000), abono("a2", 6000)] });
    const [fila] = await obtenerReposiciones(admin, PROYECTO, SEMANA);
    assert.deepEqual([fila.estado, fila.saldoPendiente, fila.requiereRevision], ["PAGADA", 0, false]);
  });

  test("Clase B — abonos parciales más liquidación: requiere revisión, cifras sin corregir", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: true }, abonos: [abono("a1", 4000)] });
    const [fila] = await obtenerReposiciones(admin, PROYECTO, SEMANA);
    assert.equal(fila.estado, "REQUIERE_REVISION");
    assert.equal(fila.requiereRevision, true);
    assert.equal(fila.saldoPendiente, 6000);
    assert.deepEqual(fila.motivosRevision, ["ABONOS_PARCIALES_Y_LIQUIDACION"]);
    assert.equal(bd!.t.abonos.length, 1);
  });

  for (const [nombre, opciones, esperado] of [
    ["abonos que exceden el total", { abonos: [abono("a1", 12000)] }, /revisi/],
    ["cerrada sin liquidar", { reposicion: { cerrada: true } }, /revisi/],
    ["movimiento distinto al total", { movimiento: { montoFinSemana: 9000 } }, /revisi/],
  ] as const) {
    test(`Clase B (${nombre}): liquidar se bloquea para no agravar la inconsistencia`, async () => {
      escenario(opciones as Parameters<typeof escenario>[0]);
      const abonosAntes = bd!.t.abonos.length;
      await assert.rejects(liquidarMovimiento(admin, "mov-rep", LIQUIDACION), esperado);
      assert.equal(bd!.t.abonos.length, abonosAntes);
      assert.equal(mov("mov-rep").estatusPago, "PENDIENTE_PAGO");
    });
  }
});

describe("R2 — multiempresa y permisos", () => {
  test("Movimiento de otra Empresa: no se encuentra ni se liquida", async () => {
    escenario();
    await assert.rejects(liquidarMovimiento(admin, "mov-ajeno", LIQUIDACION), /no existe|no pertenece/i);
    assert.equal(mov("mov-ajeno").estatusPago, "PENDIENTE_PAGO");
  });

  test("Reposición de otra Empresa: no admite abonos", async () => {
    escenario({ reposicion: { empresaId: "empresa-ajena" } });
    await assert.rejects(registrarAbonoReposicion(admin, "rep-andres", { monto: 100, fecha: "2026-10-08", metodoPago: "EFECTIVO" }), /no existe|no pertenece/i);
  });

  test("Supervisor no puede liquidar ni abonar", async () => {
    escenario();
    await assert.rejects(liquidarMovimiento(supervisor, "mov-rep", LIQUIDACION));
    await assert.rejects(registrarAbonoReposicion(supervisor, "rep-andres", { monto: 100, fecha: "2026-10-08", metodoPago: "EFECTIVO" }));
    assert.equal(bd!.t.abonos.length, 0);
  });
});

describe("R2 — clasificación pura del estado", () => {
  const base = { total: 10000, abonado: 0, cerrada: false, estatusPago: "PENDIENTE_PAGO", montoMovimiento: 10000 };
  test("Abierta con abonos parciales: saldo = total − abonos", () => {
    assert.deepEqual(estadoDeReposicion({ ...base, abonado: 4000 }), { estado: "ABIERTA", motivos: [], saldoPendiente: 6000 });
  });
  test("Pagada (clase A) sin abonos y con abonos completos", () => {
    assert.equal(estadoDeReposicion({ ...base, cerrada: true, estatusPago: "LIQUIDADO" }).estado, "PAGADA");
    assert.equal(estadoDeReposicion({ ...base, cerrada: true, estatusPago: "LIQUIDADO", abonado: 10000 }).saldoPendiente, 0);
  });
  test("Liquidada sin cerrar: requiere revisión", () => {
    assert.deepEqual(estadoDeReposicion({ ...base, estatusPago: "LIQUIDADO" }).motivos, ["LIQUIDADA_SIN_CERRAR"]);
  });
});
