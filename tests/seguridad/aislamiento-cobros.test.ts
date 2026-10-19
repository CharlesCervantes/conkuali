import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { aplicarFondoAEstimacionTx, obtenerMovimientosCapa } from "@/lib/server/control-de-obra/financiero-cliente";
import { crearBdEnMemoria, type CapaSimulada, type MovimientoSimulado } from "../helpers/bd-en-memoria";
import { usuarioDePrueba } from "../helpers/usuarios";

// C1 — aislamiento multiempresa en la consulta de cobros por capa: conocer
// el id de una capa de otra Empresa nunca debe permitir leer sus cobros.
// Base simulada en memoria (sin BD real); la Empresa simulada es
// "empresa-prueba". Cifras ficticias.

const OP: CapaSimulada = { id: "capa-op", estimacionClienteId: "est-1", capa: "OPERATIVO", estatus: "EMITIDA", total: 980000 };
const PR: CapaSimulada = { id: "capa-pr", estimacionClienteId: "est-1", capa: "PRIVADO", estatus: "EMITIDA", total: 1150000 };
const mov = (id: string, capaId: string | null, monto: number, tipo: MovimientoSimulado["tipo"] = "PAGO_ESTIMACION"): MovimientoSimulado => ({
  id,
  tipo,
  monto,
  fecha: new Date(2026, 8, 20, 12),
  createdAt: new Date(2026, 8, 20, 12),
  estimacionClienteCapaId: capaId,
  estatus: "VIGENTE",
});

const propia = {
  conPrivado: usuarioDePrueba({ rol: "ADMINISTRADOR" }),
  sinPrivado: usuarioDePrueba({ rol: "ADMINISTRADOR", vistaPrivadaActiva: false }),
  supervisor: usuarioDePrueba({ rol: "SUPERVISOR" }),
};
const otraEmpresa = {
  director: usuarioDePrueba({ rol: "DIRECTOR", empresaId: "empresa-ajena" }),
  administrador: usuarioDePrueba({ rol: "ADMINISTRADOR", empresaId: "empresa-ajena" }),
};

let bd: ReturnType<typeof crearBdEnMemoria> | null = null;
afterEach(() => {
  bd?.restaurar();
  bd = null;
});
const escenario = () =>
  (bd = crearBdEnMemoria({
    capas: [OP, PR],
    movimientos: [mov("cobro-op", "capa-op", 300000), mov("cobro-pr", "capa-pr", 600000), mov("aportacion", null, 500000, "APORTACION_FONDO")],
  }));

describe("C1 — consulta de cobros por capa: aislamiento multiempresa", () => {
  for (const [nombre, usuario] of Object.entries(otraEmpresa)) {
    for (const capaId of ["capa-op", "capa-pr"]) {
      test(`Usuario de otra Empresa (${nombre}) no puede leer los cobros de ${capaId} aunque conozca el id`, async () => {
        escenario();
        await assert.rejects(obtenerMovimientosCapa(usuario, capaId), (error: Error) => {
          // Mismo error que una capa inexistente: no revela que el id existe.
          assert.match(error.message, /no encontrad|no existe/i);
          assert.ok(!/300000|600000|300,000|600,000/.test(error.message));
          return true;
        });
      });
    }
  }

  test("MASTER (sin Empresa) no puede leer cobros por id", async () => {
    escenario();
    await assert.rejects(obtenerMovimientosCapa(usuarioDePrueba({ rol: "MASTER" }), "capa-op"));
  });

  test("Id inexistente: mismo error que una capa de otra Empresa", async () => {
    escenario();
    await assert.rejects(obtenerMovimientosCapa(propia.conPrivado, "capa-que-no-existe"), /no encontrad|no existe/i);
  });
});

describe("C1 — misma Empresa: la separación General/Privado no cambia", () => {
  test("Con acceso Privado: lee los cobros de Operativo y de Privado (cada capa los suyos)", async () => {
    escenario();
    assert.deepEqual((await obtenerMovimientosCapa(propia.conPrivado, "capa-op")).map((f) => [f.id, f.monto]), [["cobro-op", 300000]]);
    assert.deepEqual((await obtenerMovimientosCapa(propia.conPrivado, "capa-pr")).map((f) => [f.id, f.monto]), [["cobro-pr", 600000]]);
  });

  test("Sin acceso Privado: lee Operativo, nunca Privado", async () => {
    escenario();
    assert.equal((await obtenerMovimientosCapa(propia.sinPrivado, "capa-op")).length, 1);
    await assert.rejects(obtenerMovimientosCapa(propia.sinPrivado, "capa-pr"), /permiso/i);
  });

  test("Supervisor: sin acceso a cobros de ninguna capa", async () => {
    escenario();
    await assert.rejects(obtenerMovimientosCapa(propia.supervisor, "capa-op"), /permiso/i);
    await assert.rejects(obtenerMovimientosCapa(propia.supervisor, "capa-pr"), /permiso/i);
  });
});

describe("C1 — aplicarFondoAEstimacionTx: la capa debe pertenecer a la Empresa y proyecto del contexto", () => {
  test("Con un contexto de otra Empresa no aplica fondo a una capa ajena", async () => {
    escenario();
    await assert.rejects(
      bd!.transaccion((tx) =>
        aplicarFondoAEstimacionTx(tx as never, { empresaId: "empresa-ajena", proyectoId: bd!.proyectoId, usuarioId: "u" }, "capa-pr")
      )
    );
    assert.equal(bd!.cobroVigente("est-1"), 900000, "no se creó ninguna aplicación");
  });

  test("Con el contexto correcto aplica igual que antes (saldo real)", async () => {
    escenario();
    const { aplicado } = await bd!.transaccion((tx) =>
      aplicarFondoAEstimacionTx(tx as never, { empresaId: bd!.empresaId, proyectoId: bd!.proyectoId, usuarioId: "u" }, "capa-pr")
    );
    assert.equal(aplicado, 250000);
  });
});
