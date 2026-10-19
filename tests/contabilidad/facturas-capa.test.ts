import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { obtenerFacturasPendientes } from "@/lib/server/contabilidad/facturas-pendientes";
import { obtenerFacturasConDiferencia } from "@/lib/server/contabilidad/facturas";
import { filtroMovimientoClienteVisible } from "@/lib/server/contabilidad/capa-privada";
import { usuarioDePrueba } from "../helpers/usuarios";

// Facturas pendientes / con diferencia (Contabilidad): sin acceso Privado no
// debe llegar ningún ingreso ligado a la capa PRIVADO. Las consultas se
// interceptan en memoria (sin BD) para verificar el filtro enviado; los
// egresos no cambian en ningún caso.

const SIN_PRIVADO = { OR: [{ estimacionClienteCapaId: null }, { estimacionClienteCapa: { capa: "OPERATIVO" } }] };

type Args = { where: Record<string, unknown> };
let consultasIngreso: Args[] = [];
let consultasGasto: Args[] = [];
let consultasEgreso: Args[] = [];

// Los delegados de Prisma exponen findMany como accesor (mock.method no
// aplica): se sustituye por asignación y se restaura después de cada prueba.
type Delegado = { findMany: unknown };
const delegados = { ingreso: db.ingreso, gastoObra: db.gastoObra, egreso: db.egreso } as unknown as Record<string, Delegado>;
const originales = Object.fromEntries(Object.entries(delegados).map(([k, d]) => [k, d.findMany]));

beforeEach(() => {
  consultasIngreso = [];
  consultasGasto = [];
  consultasEgreso = [];
  delegados.ingreso.findMany = async (args: Args) => (consultasIngreso.push(args), []);
  delegados.gastoObra.findMany = async (args: Args) => (consultasGasto.push(args), []);
  delegados.egreso.findMany = async (args: Args) => (consultasEgreso.push(args), []);
});
afterEach(() => {
  for (const [k, d] of Object.entries(delegados)) d.findMany = originales[k];
});

const conPermiso = () => usuarioDePrueba({ rol: "ADMINISTRADOR" });
const sinPermiso = [
  { nombre: "switch personal apagado", usuario: () => usuarioDePrueba({ rol: "ADMINISTRADOR", vistaPrivadaActiva: false }) },
  { nombre: "Empresa sin Privado", usuario: () => usuarioDePrueba({ rol: "DIRECTOR", privadoHabilitado: false }) },
];

describe("Política de capa en facturas (Contabilidad)", () => {
  test("Filtro de movimiento visible: vacío con Privado, solo sin capa u OPERATIVO sin Privado", () => {
    assert.deepEqual(filtroMovimientoClienteVisible(true), {});
    assert.deepEqual(filtroMovimientoClienteVisible(false), SIN_PRIVADO);
  });

  describe("obtenerFacturasPendientes", () => {
    test("Con acceso Privado: la consulta de ingresos es la misma que antes (regresión)", async () => {
      await obtenerFacturasPendientes(conPermiso());
      assert.deepEqual(consultasIngreso[0].where.OR, [
        { movimientoFinancieroClienteId: null },
        { movimientoFinancieroCliente: { estatus: "VIGENTE" } },
      ]);
    });

    for (const caso of sinPermiso) {
      test(`Sin acceso Privado (${caso.nombre}): excluye ingresos de capa PRIVADO, conserva manuales y aportaciones`, async () => {
        await obtenerFacturasPendientes(caso.usuario());
        assert.deepEqual(consultasIngreso[0].where.OR, [
          { movimientoFinancieroClienteId: null },
          { movimientoFinancieroCliente: { estatus: "VIGENTE", ...SIN_PRIVADO } },
        ]);
      });
    }

    test("Inicio puede forzar la vista General aunque el usuario tenga acceso Privado", async () => {
      await obtenerFacturasPendientes(conPermiso(), { incluirPrivado: false });
      assert.deepEqual((consultasIngreso[0].where.OR as unknown[])[1], {
        movimientoFinancieroCliente: { estatus: "VIGENTE", ...SIN_PRIVADO },
      });
    });

    test("Los gastos (egresos) no cambian con o sin acceso Privado", async () => {
      await obtenerFacturasPendientes(conPermiso());
      await obtenerFacturasPendientes(sinPermiso[0].usuario());
      assert.deepEqual(consultasGasto[0], consultasGasto[1]);
    });
  });

  describe("obtenerFacturasConDiferencia", () => {
    test("Con acceso Privado: la consulta de ingresos es la misma que antes (regresión)", async () => {
      await obtenerFacturasConDiferencia(conPermiso());
      assert.deepEqual(consultasIngreso[0].where.movimientoFinancieroCliente, { estatus: "VIGENTE" });
    });

    for (const caso of sinPermiso) {
      test(`Sin acceso Privado (${caso.nombre}): excluye ingresos de capa PRIVADO`, async () => {
        await obtenerFacturasConDiferencia(caso.usuario());
        assert.deepEqual(consultasIngreso[0].where.movimientoFinancieroCliente, { estatus: "VIGENTE", ...SIN_PRIVADO });
      });
    }

    test("Los egresos no cambian con o sin acceso Privado", async () => {
      await obtenerFacturasConDiferencia(conPermiso());
      await obtenerFacturasConDiferencia(sinPermiso[0].usuario());
      assert.deepEqual(consultasEgreso[0], consultasEgreso[1]);
    });
  });

  test("Supervisor no tiene acceso a Contabilidad", async () => {
    await assert.rejects(obtenerFacturasPendientes(usuarioDePrueba({ rol: "SUPERVISOR" })));
    await assert.rejects(obtenerFacturasConDiferencia(usuarioDePrueba({ rol: "SUPERVISOR" })));
  });
});
