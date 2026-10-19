import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { proyectarResumenEjecutivo, resolverAccesoDashboard, type PeriodoDashboard, type VistaDashboard } from "@/lib/server/dashboard";
import { usuarioDePrueba } from "../helpers/usuarios";
import { datosDePrueba, datosE1, HOY, rangoDePrueba } from "../helpers/datos-dashboard";

// E1 en Inicio: Flujo General (tope cronológico OPERATIVO por estimación) en
// vista General, Flujo real en vista Privado, y Por cobrar con el cobro real
// de ambas capas (P2 en Privado). Escenario: tests/helpers/datos-dashboard.ts.

const director = usuarioDePrueba({ rol: "DIRECTOR" });
const sinAccesoPrivado = [
  usuarioDePrueba({ rol: "ADMINISTRADOR", vistaPrivadaActiva: false }),
  usuarioDePrueba({ rol: "DIRECTOR", privadoHabilitado: false }),
];
function resumen(datos = datosE1(), vista: VistaDashboard = "general", periodo: PeriodoDashboard = "semana", usuario = director) {
  return proyectarResumenEjecutivo(datos, resolverAccesoDashboard(usuario, vista), periodo, rangoDePrueba(periodo), HOY);
}

// Semana 5–11 oct del escenario E1:
// Torre: 500,000 + 600,000 en PRIVADO con OP 980,000 → General 500,000 + 480,000.
// Bodega est. 1 (solo OP): 100,000.
// Bodega est. 2 (caso 3): 150,000 en OP (20 sep, fuera de la semana) + 300,000 en PRIVADO → General 250,000 (tope 400,000).
// Aportación: 75,000.
const SEMANA = {
  general: { entradas: 1405000, neto: 955000 },
  real: { entradas: 1575000, neto: 1125000 },
  pagosDeObra: 450000,
};

describe("E1 — Flujo General en vista General", () => {
  test("Entradas a valores General con tope cronológico por estimación", () => {
    const r = resumen();
    assert.equal(r.flujoDinero?.base, "general");
    assert.equal(r.flujoDinero?.entradas, SEMANA.general.entradas);
    assert.equal(r.flujoDinero?.pagosDeObra, SEMANA.pagosDeObra);
    assert.equal(r.flujoDinero?.neto, SEMANA.general.neto);
  });

  test("Cobro OPERATIVO anterior a la emisión PRIVADO: se reconoce en su fecha (septiembre)", () => {
    const r = resumen(datosE1(), "general", "mes_anterior");
    // Septiembre: solo el cobro de $150,000 en OPERATIVO de Bodega est. 2.
    assert.equal(r.flujoDinero?.entradas, 150000);
  });

  test("Usuarios sin acceso Privado reciben el Flujo General (T1 retirada) y nunca el real", () => {
    for (const usuario of sinAccesoPrivado) {
      for (const vista of ["general", "privado"] as const) {
        const r = resumen(datosE1(), vista, "semana", usuario);
        assert.equal(r.flujoDinero?.base, "general");
        assert.equal(r.flujoDinero?.entradas, SEMANA.general.entradas);
        const json = JSON.stringify(r);
        assert.ok(!json.includes(String(SEMANA.real.entradas)), "no debe aparecer la entrada real");
        assert.ok(!json.includes(String(SEMANA.real.neto)), "no debe aparecer el neto real");
      }
    }
  });

  test("Sin tope ni caso 3 (escenario base): mismas entradas que antes", () => {
    const r = resumen(datosDePrueba());
    assert.equal(r.flujoDinero?.entradas, 675000);
    assert.equal(r.flujoDinero?.neto, 225000);
  });
});

describe("E1 — Flujo real en vista Privado", () => {
  test("Conserva el cálculo actual (todo cobro real + aportaciones)", () => {
    const r = resumen(datosE1(), "privado");
    assert.equal(r.flujoDinero?.base, "real");
    assert.equal(r.flujoDinero?.entradas, SEMANA.real.entradas);
    assert.equal(r.flujoDinero?.neto, SEMANA.real.neto);
  });
});

describe("Por cobrar con el cobro real de ambas capas", () => {
  test("General: importe OPERATIVO menos cobro real con tope", () => {
    // Torre 980,000 − min(1,100,000, 980,000) = 0 · Bodega est. 1: 200,000 · Bodega est. 2: 400,000 − min(450,000, 400,000) = 0.
    assert.equal(resumen().porCobrar, 200000);
  });

  test("Privado (P2): total real de cada estimación (PRIVADO si existe; si no, OPERATIVO)", () => {
    // Torre 1,150,000 − 1,100,000 = 50,000 · Bodega est. 1 (solo OP) 200,000 · Bodega est. 2: 500,000 − 450,000 = 50,000.
    assert.equal(resumen(datosE1(), "privado").porCobrar, 300000);
  });

  test("Escenario base sin caso 3: General sin cambio; Privado incluye la estimación solo OPERATIVO (P2)", () => {
    assert.equal(resumen(datosDePrueba()).porCobrar, 680000);
    // Antes 650,000 (solo capas PRIVADO); con P2 suma la estimación solo OPERATIVO de Bodega (200,000).
    assert.equal(resumen(datosDePrueba(), "privado").porCobrar, 850000);
  });

  test("Vista General: la respuesta no contiene cobros reales que superan el importe General", () => {
    for (const usuario of [director, ...sinAccesoPrivado]) {
      const json = JSON.stringify(resumen(datosE1(), "general", "semana", usuario));
      // Cobro real de Torre (1,100,000) y entradas/neto reales de la semana.
      for (const real of [1100000, SEMANA.real.entradas, SEMANA.real.neto]) {
        assert.ok(!json.includes(String(real)), `no debe aparecer ${real}`);
      }
    }
  });
});
