import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarFondoAEstimacion,
  aplicarFondoAEstimacionTx,
  cancelarMovimientoFinancieroCliente,
  editarMontoPagoEstimacion,
  registrarPagoEstimacion,
} from "@/lib/server/control-de-obra/financiero-cliente";
import { crearBdEnMemoria, type CapaSimulada, type MovimientoSimulado } from "../helpers/bd-en-memoria";
import { usuarioDePrueba } from "../helpers/usuarios";

// Validación del saldo real en TODAS las rutas que registran o modifican
// cobros: registrar pago, editar monto, aplicar fondo (manual y al emitir) y
// cancelar. Base simulada en memoria (sin BD real). OP = 980,000 · PR =
// 1,150,000. Cifras ficticias.

const conPrivado = usuarioDePrueba({ rol: "ADMINISTRADOR" });
const sinPrivado = usuarioDePrueba({ rol: "ADMINISTRADOR", vistaPrivadaActiva: false });

const f = (mes: number, dia: number) => new Date(2026, mes - 1, dia, 12);
let n = 0;
const pago = (capaId: string, monto: number, fecha: Date, tipo: MovimientoSimulado["tipo"] = "PAGO_ESTIMACION"): MovimientoSimulado => ({
  id: `mov-${++n}`,
  tipo,
  monto,
  fecha,
  createdAt: new Date(fecha.getTime() + n),
  estimacionClienteCapaId: tipo === "APORTACION_FONDO" ? null : capaId,
  estatus: "VIGENTE",
});

const OP: CapaSimulada = { id: "capa-op", estimacionClienteId: "est-1", capa: "OPERATIVO", estatus: "EMITIDA", total: 980000 };
const PR: CapaSimulada = { id: "capa-pr", estimacionClienteId: "est-1", capa: "PRIVADO", estatus: "EMITIDA", total: 1150000 };
const SOLO_OP: CapaSimulada = { id: "capa-solo-op", estimacionClienteId: "est-2", capa: "OPERATIVO", estatus: "EMITIDA", total: 300000 };

// Caso 3: $300,000 cobrados en OPERATIVO antes de emitir PRIVADO + $600,000 en PRIVADO → saldo real $250,000.
function escenarioCaso3(extra: MovimientoSimulado[] = []) {
  return crearBdEnMemoria({
    capas: [OP, PR, SOLO_OP],
    movimientos: [pago("capa-op", 300000, f(9, 8)), pago("capa-pr", 600000, f(9, 29)), ...extra],
  });
}

let bd: ReturnType<typeof crearBdEnMemoria> | null = null;
afterEach(() => {
  bd?.restaurar();
  bd = null;
});

const datosPago = (monto: number) => ({ monto, fecha: "2026-10-06" });

describe("Registrar pago — saldo real de la estimación (ambas capas)", () => {
  test("Solo OPERATIVO: mismo límite que antes (regresión)", async () => {
    bd = crearBdEnMemoria({ capas: [SOLO_OP], movimientos: [pago("capa-solo-op", 100000, f(10, 1))] });
    await assert.rejects(registrarPagoEstimacion(sinPrivado, "capa-solo-op", datosPago(200000.01)), /excede el saldo/);
    await registrarPagoEstimacion(sinPrivado, "capa-solo-op", datosPago(200000));
    assert.equal(bd.cobroVigente("est-2"), 300000);
  });

  test("Caso 3: no permite cobrar más que el saldo real (antes permitía $550,000)", async () => {
    bd = escenarioCaso3();
    await assert.rejects(registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(250000.01)), /excede el saldo/);
    await registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(250000));
    assert.equal(bd.cobroVigente("est-1"), 1150000);
  });

  test("Sobrecobro histórico: no permite registrar nuevos cobros", async () => {
    bd = escenarioCaso3([pago("capa-pr", 550000, f(10, 1))]); // cobro real 1,450,000 > 1,150,000
    await assert.rejects(registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(1)), /no tiene saldo/);
  });

  test("Cancelar un cobro libera saldo", async () => {
    bd = escenarioCaso3([pago("capa-pr", 250000, f(10, 1))]); // estimación cubierta
    await assert.rejects(registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(1)), /no tiene saldo/);
    const ultimo = bd.movimientos.at(-1)!;
    await cancelarMovimientoFinancieroCliente(conPrivado, ultimo.id, { motivo: "Pago duplicado" });
    await registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(250000));
  });
});

describe("Editar monto — saldo real y no exposición", () => {
  test("Caso 3: editar el cobro histórico de OPERATIVO respeta el saldo real", async () => {
    bd = escenarioCaso3();
    const historico = bd.movimientos[0];
    await assert.rejects(editarMontoPagoEstimacion(conPrivado, historico.id, 550000.01), /excede el saldo/);
    await editarMontoPagoEstimacion(conPrivado, historico.id, 550000);
    assert.equal(bd.cobroVigente("est-1"), 1150000);
  });

  test("Sin acceso Privado: el rechazo no revela importes derivados de la capa Privado", async () => {
    bd = escenarioCaso3();
    const historico = bd.movimientos[0];
    await assert.rejects(editarMontoPagoEstimacion(sinPrivado, historico.id, 900000), (error: Error) => {
      assert.ok(!/\$\s?\d/.test(error.message), `no debe incluir montos: "${error.message}"`);
      return true;
    });
  });

  test("Solo OPERATIVO: mismo límite que antes (regresión)", async () => {
    bd = crearBdEnMemoria({ capas: [SOLO_OP], movimientos: [pago("capa-solo-op", 100000, f(10, 1)), pago("capa-solo-op", 50000, f(10, 2))] });
    const primero = bd.movimientos[0];
    await assert.rejects(editarMontoPagoEstimacion(sinPrivado, primero.id, 250000.01), /excede el saldo/);
    await editarMontoPagoEstimacion(sinPrivado, primero.id, 250000);
  });
});

describe("Aplicar fondo — saldo real", () => {
  test("Caso 3 (manual): aplica como máximo el saldo real", async () => {
    bd = escenarioCaso3([pago("", 500000, f(9, 1), "APORTACION_FONDO")]);
    const { aplicado } = await aplicarFondoAEstimacion(conPrivado, "capa-pr");
    assert.equal(aplicado, 250000);
    assert.equal(bd.cobroVigente("est-1"), 1150000);
  });

  test("Caso 3 (al emitir, aplicarFondoAEstimacionTx): aplica como máximo el saldo real", async () => {
    bd = escenarioCaso3([pago("", 500000, f(9, 1), "APORTACION_FONDO")]);
    const { aplicado } = await bd.transaccion((tx) =>
      aplicarFondoAEstimacionTx(tx as never, { empresaId: bd!.empresaId, proyectoId: bd!.proyectoId, usuarioId: "u" }, "capa-pr")
    );
    assert.equal(aplicado, 250000);
  });

  test("Sobrecobro histórico: no aplica fondo", async () => {
    bd = escenarioCaso3([pago("capa-pr", 550000, f(10, 1)), pago("", 500000, f(9, 1), "APORTACION_FONDO")]);
    await assert.rejects(aplicarFondoAEstimacion(conPrivado, "capa-pr"), /ya está cubierta/);
  });
});

describe("Intentos de cobro simultáneos", () => {
  test("Dos pagos simultáneos que juntos exceden el saldo: solo uno se registra", async () => {
    bd = escenarioCaso3();
    const resultados = await Promise.allSettled([
      registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(200000)),
      registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(200000)),
    ]);
    assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
    assert.ok(bd.cobroVigente("est-1") <= 1150000);
  });

  test("Editar el cobro OPERATIVO histórico y registrar en PRIVADO a la vez: nunca exceden el saldo", async () => {
    bd = escenarioCaso3();
    const historico = bd.movimientos[0];
    const resultados = await Promise.allSettled([
      editarMontoPagoEstimacion(conPrivado, historico.id, 500000), // +200,000
      registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(200000)),
    ]);
    assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
    assert.ok(bd.cobroVigente("est-1") <= 1150000);
  });

  test("Aplicar fondo y registrar pago a la vez: nunca exceden el saldo", async () => {
    bd = escenarioCaso3([pago("", 500000, f(9, 1), "APORTACION_FONDO")]);
    await Promise.allSettled([
      aplicarFondoAEstimacion(conPrivado, "capa-pr"),
      registrarPagoEstimacion(conPrivado, "capa-pr", datosPago(200000)),
    ]);
    assert.ok(bd.cobroVigente("est-1") <= 1150000);
  });
});
