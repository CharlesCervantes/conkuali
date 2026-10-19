import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { aprobarGasto } from "@/lib/server/control-de-obra/gastos";
import { crearBdReposiciones, EMPRESA, PROYECTO, SEMANA, type Abono, type Gasto, type Movimiento, type Reposicion } from "../helpers/bd-reposiciones";
import { usuarioDePrueba } from "../helpers/usuarios";

// Corrección posterior a R2 — asignarGastoAReposicionTx (vía aprobarGasto)
// nunca modifica ni reutiliza una reposición REQUIERE_REVISION: antes, una
// liquidada sin cerrar se marcaba `cerrada` en silencio. Base simulada en
// memoria (sin BD real). Cifras ficticias: reposición de Andrés por $10,000
// y un gasto nuevo de $2,000 pendiente de revisión.

const admin = usuarioDePrueba({ rol: "ADMINISTRADOR" });

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
const gastoNuevo = (extra: Partial<Gasto> = {}) => gasto("g3", 2000, { estatus: "PENDIENTE_REVISION", reposicionGastosId: null, ...extra });

let bd: ReturnType<typeof crearBdReposiciones> | null = null;
afterEach(() => {
  bd?.restaurar();
  bd = null;
});
function escenario(
  opciones: {
    abonos?: Abono[];
    reposicion?: Partial<Reposicion>;
    movimiento?: Partial<Movimiento>;
    extraMovimientos?: Movimiento[];
    extraReposiciones?: Reposicion[];
    extraGastos?: Gasto[];
  } = {}
) {
  bd = crearBdReposiciones({
    movimientos: [movimiento("mov-rep", opciones.movimiento), ...(opciones.extraMovimientos ?? [])],
    reposiciones: [reposicion(opciones.reposicion), ...(opciones.extraReposiciones ?? [])],
    gastos: [gasto("g1", 6000), gasto("g2", 4000), gastoNuevo(), ...(opciones.extraGastos ?? [])],
    abonos: opciones.abonos ?? [],
  });
  return bd;
}
const foto = () => JSON.stringify(bd!.t);
const g3 = () => bd!.t.gastos.find((g) => g.id === "g3")!;
const rep = (id = "rep-andres") => bd!.t.reposiciones.find((r) => r.id === id)!;
const mov = (id: string) => bd!.t.movimientos.find((m) => m.id === id)!;

// Rechazo de una REQUIERE_REVISION: error claro y CERO cambios en la base
// (ni la aprobación del gasto, ni su auditoría, ni la reposición, ni abonos,
// ni movimientos).
async function esperarRechazoSinCambios() {
  const antes = foto();
  await assert.rejects(aprobarGasto(admin, "g3"), /requiere revisión/);
  assert.equal(foto(), antes, "la base queda exactamente igual");
  assert.equal(g3().estatus, "PENDIENTE_REVISION");
  assert.equal(g3().reposicionGastosId, null);
}

describe("Asignar un gasto a una reposición que requiere revisión", () => {
  test("Liquidada sin cerrar: se rechaza y NO se marca cerrada", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: false }, abonos: [abono("a1", 10000)] });
    await esperarRechazoSinCambios();
    assert.equal(rep().cerrada, false, "no se corrige en silencio");
  });

  test("Liquidada sin cerrar y sin abonos (histórica): se rechaza sin cambios", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: false } });
    await esperarRechazoSinCambios();
  });

  test("Abonos que exceden el total: se rechaza sin cambios", async () => {
    escenario({ abonos: [abono("a1", 8000), abono("a2", 4000)] });
    await esperarRechazoSinCambios();
  });

  test("Importe del movimiento distinto al total: se rechaza sin cambios", async () => {
    escenario({ movimiento: { montoFinSemana: 9000 } });
    await esperarRechazoSinCambios();
  });

  test("Cerrada sin liquidar: nunca recibe el gasto ni se modifica (el gasto va a una complementaria)", async () => {
    escenario({ reposicion: { cerrada: true } });
    const repAntes = JSON.stringify(rep());
    const movAntes = JSON.stringify(mov("mov-rep"));
    await aprobarGasto(admin, "g3");
    assert.equal(JSON.stringify(rep()), repAntes);
    assert.equal(JSON.stringify(mov("mov-rep")), movAntes);
    assert.notEqual(g3().reposicionGastosId, "rep-andres");
    assert.equal(bd!.t.abonos.length, 0);
    assert.equal(bd!.t.gastos.filter((g) => g.reposicionGastosId === "rep-andres").length, 2);
  });
});

describe("Reposiciones válidas — comportamiento sin cambios", () => {
  test("Abierta válida (con abono parcial): recibe el gasto y su movimiento sube al nuevo total", async () => {
    escenario({ abonos: [abono("a1", 4000)] });
    await aprobarGasto(admin, "g3");
    assert.equal(g3().estatus, "APROBADO");
    assert.equal(g3().reposicionGastosId, "rep-andres");
    assert.equal(mov("mov-rep").montoFinSemana, 12000);
    assert.equal(rep().cerrada, false);
    assert.equal(bd!.t.abonos.length, 1, "no se crean abonos");
  });

  test("Pagada válida (liquidada y cerrada, abonos = total): intacta; el gasto abre una complementaria", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: true }, abonos: [abono("a1", 10000)] });
    const repAntes = JSON.stringify(rep());
    const movAntes = JSON.stringify(mov("mov-rep"));
    await aprobarGasto(admin, "g3");
    assert.equal(JSON.stringify(rep()), repAntes);
    assert.equal(JSON.stringify(mov("mov-rep")), movAntes);
    const nueva = rep(g3().reposicionGastosId!);
    assert.ok(nueva && nueva.id !== "rep-andres");
    assert.equal(nueva.cerrada, false);
    assert.equal(mov(nueva.movimientoSemanalId!).montoFinSemana, 2000);
    assert.equal(mov(nueva.movimientoSemanalId!).estatusPago, "PENDIENTE_PAGO");
    assert.equal(bd!.t.abonos.length, 1);
  });

  test("Pagada clase A (liquidada y cerrada sin abonos): intacta; complementaria", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: true } });
    const repAntes = JSON.stringify(rep());
    await aprobarGasto(admin, "g3");
    assert.equal(JSON.stringify(rep()), repAntes);
    assert.notEqual(g3().reposicionGastosId, "rep-andres");
    assert.equal(bd!.t.abonos.length, 0);
  });
});

describe("Atomicidad de aprobar + asignar", () => {
  // Cada falla ocurre DENTRO de la asignación, después de que el gasto ya se
  // marcó APROBADO y se auditó en la misma transacción: (op, vez).
  const fallas: [string, number, string][] = [
    ["gasto.update", 2, "al ligar el gasto a la reposición"],
    ["movimiento.update", 1, "al actualizar el importe del movimiento"],
    ["auditoria", 2, "al auditar el cambio del movimiento"],
  ];
  for (const [op, vez, cuando] of fallas) {
    test(`Falla ${cuando}: rollback completo, incluida la aprobación`, async () => {
      escenario();
      const antes = foto();
      bd!.fallarEn(op, vez);
      await assert.rejects(aprobarGasto(admin, "g3"), /Falla simulada/);
      assert.equal(foto(), antes, "la base queda exactamente igual");
      assert.equal(g3().estatus, "PENDIENTE_REVISION");
    });
  }

  test("Falla al crear la reposición complementaria: rollback completo", async () => {
    escenario({ movimiento: { estatusPago: "LIQUIDADO" }, reposicion: { cerrada: true }, abonos: [abono("a1", 10000)] });
    const antes = foto();
    bd!.fallarEn("movimiento.create");
    await assert.rejects(aprobarGasto(admin, "g3"), /Falla simulada/);
    assert.equal(foto(), antes);
  });
});

describe("Multiempresa", () => {
  test("Una reposición inconsistente de OTRA Empresa no bloquea ni se toca", async () => {
    escenario({
      extraMovimientos: [movimiento("mov-ajeno", { beneficiarioProyectoId: "bp-ajeno", estatusPago: "LIQUIDADO" })],
      extraReposiciones: [reposicion({ id: "rep-ajena", empresaId: "empresa-ajena", folio: "REP-000009", movimientoSemanalId: "mov-ajeno" })],
    });
    const ajenaAntes = JSON.stringify(rep("rep-ajena"));
    await aprobarGasto(admin, "g3");
    assert.equal(g3().reposicionGastosId, "rep-andres");
    assert.equal(JSON.stringify(rep("rep-ajena")), ajenaAntes);
  });

  test("Un gasto de otra Empresa no se encuentra ni se asigna", async () => {
    escenario({ extraGastos: [gasto("g-ajeno", 500, { empresaId: "empresa-ajena", estatus: "PENDIENTE_REVISION", reposicionGastosId: null })] });
    const antes = foto();
    await assert.rejects(aprobarGasto(admin, "g-ajeno"));
    assert.equal(foto(), antes);
  });
});
