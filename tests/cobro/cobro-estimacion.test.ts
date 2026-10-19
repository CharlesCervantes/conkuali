import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  atribuirCobrosGeneral,
  calcularCobroEstimacion,
  capaRealDeEstimacion,
  ordenarCobros,
  saldoDisponible,
  situacionCobroCapa,
  type CapaDeEstimacion,
  type MovimientoCobro,
} from "@/lib/control-de-obra/cobro-estimacion";

// Ejemplos del diseño (design/prototypes/dashboard-inicio/diseno-e1-por-cobrar.md,
// sección 5). OP = 980,000 · PR = 1,150,000 salvo indicación. Cifras ficticias.

const OP = 980000;
const PR = 1150000;
let secuencia = 0;
const f = (mes: number, dia: number) => new Date(2026, mes - 1, dia, 12);
function mov(tipo: "PAGO" | "APLICACION", montoMxn: number, fecha: Date, extra: Partial<MovimientoCobro> = {}): MovimientoCobro {
  secuencia++;
  return {
    id: extra.id ?? `m${String(secuencia).padStart(4, "0")}`,
    tipo: tipo === "PAGO" ? "PAGO_ESTIMACION" : "APLICACION_ESTIMACION",
    monto: montoMxn,
    fecha,
    createdAt: extra.createdAt ?? new Date(fecha.getTime() + secuencia),
    estatus: extra.estatus ?? "VIGENTE",
  };
}
const entradas = (importe: number, movs: MovimientoCobro[]) => atribuirCobrosGeneral(importe, movs).map((a) => a.entradaGeneral);
const capas = (op: MovimientoCobro[] | null, pr: MovimientoCobro[] | null): CapaDeEstimacion[] => [
  ...(op ? [{ capa: "OPERATIVO" as const, estatus: "EMITIDA", total: OP, movimientos: op }] : []),
  ...(pr ? [{ capa: "PRIVADO" as const, estatus: "EMITIDA", total: PR, movimientos: pr }] : []),
];

describe("Ejemplos del diseño E1 / Por cobrar", () => {
  test("A — cobros parciales con ambas capas", () => {
    const pr = [mov("PAGO", 500000, f(9, 15)), mov("PAGO", 400000, f(9, 29)), mov("PAGO", 250000, f(10, 6))];
    assert.deepEqual(entradas(OP, pr), [500000, 400000, 80000]);
    const c = capas([], pr);
    assert.equal(situacionCobroCapa("OPERATIVO", OP, c).pendiente, 0);
    assert.equal(situacionCobroCapa("PRIVADO", PR, c).pendiente, 0);
    // Pendientes intermedios.
    assert.equal(situacionCobroCapa("OPERATIVO", OP, capas([], pr.slice(0, 1))).pendiente, 480000);
    assert.equal(situacionCobroCapa("PRIVADO", PR, capas([], pr.slice(0, 1))).pendiente, 650000);
    assert.equal(situacionCobroCapa("OPERATIVO", OP, capas([], pr.slice(0, 2))).pendiente, 80000);
    assert.equal(situacionCobroCapa("PRIVADO", PR, capas([], pr.slice(0, 2))).pendiente, 250000);
  });

  test("B — aplicación de fondo antes del pago: consume tope, no es entrada", () => {
    const pr = [mov("APLICACION", 300000, f(9, 15)), mov("PAGO", 850000, f(9, 29))];
    const a = atribuirCobrosGeneral(OP, pr);
    assert.deepEqual(a.map((x) => x.avanceGeneral), [300000, 680000]);
    assert.deepEqual(a.map((x) => x.entradaGeneral), [0, 680000]);
  });

  test("C — pago antes de la aplicación: el tope se consume en conjunto", () => {
    const pr = [mov("PAGO", 850000, f(9, 15)), mov("APLICACION", 300000, f(9, 29))];
    const a = atribuirCobrosGeneral(OP, pr);
    assert.deepEqual(a.map((x) => x.avanceGeneral), [850000, 130000]);
    assert.deepEqual(a.map((x) => x.entradaGeneral), [850000, 0]);
    assert.equal(a.reduce((t, x) => t + x.avanceGeneral, 0), OP);
  });

  test("D — cambio de fecha recalcula cronológicamente", () => {
    const p1 = mov("PAGO", 500000, f(9, 15));
    const p2 = mov("PAGO", 400000, f(9, 29));
    const p3 = mov("PAGO", 250000, f(9, 10)); // antes 6 oct
    const a = atribuirCobrosGeneral(OP, [p1, p2, p3]);
    assert.deepEqual(a.map((x) => [x.id, x.entradaGeneral]), [[p3.id, 250000], [p1.id, 500000], [p2.id, 230000]]);
    const septiembre = a.filter((x) => x.fecha.getMonth() === 8).reduce((t, x) => t + x.entradaGeneral, 0);
    assert.equal(septiembre, 980000);
  });

  test("E — cancelación: el cobro cancelado no participa y se recalcula", () => {
    const pr = [mov("PAGO", 500000, f(9, 15), { estatus: "CANCELADO" }), mov("PAGO", 400000, f(9, 29)), mov("PAGO", 250000, f(10, 6))];
    assert.deepEqual(entradas(OP, pr), [400000, 250000]);
    assert.equal(situacionCobroCapa("OPERATIVO", OP, capas([], pr)).pendiente, 330000);
    assert.equal(situacionCobroCapa("PRIVADO", PR, capas([], pr)).pendiente, 500000);
  });

  test("F — cobro en OPERATIVO antes de emitir PRIVADO (caso 3)", () => {
    const op = [mov("PAGO", 300000, f(9, 8))];
    const pr = [mov("PAGO", 600000, f(9, 29)), mov("PAGO", 250000, f(10, 6))];
    assert.deepEqual(entradas(OP, [...op, ...pr]), [300000, 600000, 80000]);
    const c = capas(op, pr);
    assert.equal(situacionCobroCapa("OPERATIVO", OP, c).pendiente, 0);
    assert.equal(situacionCobroCapa("PRIVADO", PR, c).pendiente, 0);
    assert.equal(situacionCobroCapa("OPERATIVO", OP, c).estado, "CUBIERTA");
    // Saldo real antes del último pago: 1,150,000 − (300,000 + 600,000) = 250,000.
    assert.equal(saldoDisponible(PR, [...op, pr[0]]), 250000);
  });

  test("G — solo PRIVADO emitida: General no tiene estimación (sin entradas)", () => {
    const pr = [mov("PAGO", 400000, f(10, 1))];
    assert.equal(capaRealDeEstimacion([{ capa: "PRIVADO", estatus: "EMITIDA" }, { capa: "OPERATIVO", estatus: "BORRADOR" }]), "PRIVADO");
    assert.equal(situacionCobroCapa("PRIVADO", PR, [{ capa: "PRIVADO", estatus: "EMITIDA", total: PR, movimientos: pr }]).pendiente, 750000);
  });

  test("H — sin capa privada: mismas cifras que antes (regresión)", () => {
    const op = [mov("PAGO", 100000, f(10, 1))];
    assert.deepEqual(entradas(300000, op), [100000]);
    const r = calcularCobroEstimacion(300000, op);
    assert.deepEqual({ ...r, excedente: undefined }, { aplicadoFondo: 0, pagoDirecto: 100000, pendiente: 200000, estado: "PARCIAL", excedente: undefined });
  });
});

describe("Sobrecobro histórico", () => {
  test("Cobro real mayor al total real: pendiente 0 y sobrecobro informado solo en la capa real", () => {
    const op = [mov("PAGO", 300000, f(9, 8))];
    const pr = [mov("PAGO", 1150000, f(9, 29))]; // se registró el total en PRIVADO ignorando el cobro previo
    const c = capas(op, pr);
    const privado = situacionCobroCapa("PRIVADO", PR, c);
    assert.equal(privado.pendiente, 0);
    assert.equal(privado.sobrecobro, 300000);
    const general = situacionCobroCapa("OPERATIVO", OP, c);
    assert.equal(general.pendiente, 0);
    assert.equal(general.sobrecobro, 0, "en Operativo con Privado emitida nunca se expone el excedente");
    assert.equal(saldoDisponible(PR, [...op, ...pr]), -300000);
  });

  test("Sin Privado: el sobrecobro se informa en Operativo", () => {
    const op = [mov("PAGO", 350000, f(9, 8))];
    assert.equal(situacionCobroCapa("OPERATIVO", 300000, [{ capa: "OPERATIVO", estatus: "EMITIDA", total: 300000, movimientos: op }]).sobrecobro, 50000);
  });
});

describe("Orden determinista", () => {
  test("Misma fecha: desempata por hora de registro y luego por id; barajar no cambia el resultado", () => {
    const dia = f(9, 15);
    const a = mov("PAGO", 600000, dia, { id: "b", createdAt: new Date(2026, 8, 15, 9) });
    const b = mov("PAGO", 600000, dia, { id: "a", createdAt: new Date(2026, 8, 15, 10) });
    const c = mov("PAGO", 100000, dia, { id: "c", createdAt: new Date(2026, 8, 15, 10) });
    assert.deepEqual(ordenarCobros([c, b, a]).map((m) => m.id), ["b", "a", "c"]);
    const r1 = atribuirCobrosGeneral(OP, [a, b, c]);
    const r2 = atribuirCobrosGeneral(OP, [c, a, b]);
    assert.deepEqual(r1, r2);
    assert.deepEqual(r1.map((x) => x.entradaGeneral), [600000, 380000, 0]);
  });
});

// Generador pseudoaleatorio con semilla fija (reproducible).
function generador(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

describe("Invariantes sobre 500 escenarios aleatorios", () => {
  test("I1–I6", () => {
    const azar = generador(20261008);
    for (let n = 0; n < 500; n++) {
      const importe = Math.round(100000 + azar() * 900000);
      const movs: MovimientoCobro[] = [];
      const cantidad = 1 + Math.floor(azar() * 6);
      for (let i = 0; i < cantidad; i++) {
        movs.push(
          mov(azar() < 0.3 ? "APLICACION" : "PAGO", Math.round(10000 + azar() * 500000), f(9, 1 + Math.floor(azar() * 28)), {
            estatus: azar() < 0.1 ? "CANCELADO" : "VIGENTE",
          })
        );
      }
      const atribuidos = atribuirCobrosGeneral(importe, movs);
      const vigentes = movs.filter((m) => m.estatus === "VIGENTE");
      const real = vigentes.reduce((t, m) => t + Number(m.monto), 0);

      // I1: el avance General acumulado nunca supera el importe y llega a min(R, importe).
      let acumulado = 0;
      for (const a of atribuidos) {
        acumulado += a.avanceGeneral;
        assert.ok(acumulado <= importe + 0.01);
      }
      assert.ok(Math.abs(acumulado - Math.min(real, importe)) < 0.02);
      // I2: cuadra con Por cobrar General.
      const { pendiente } = calcularCobroEstimacion(importe, movs);
      assert.ok(Math.abs(acumulado - (importe - pendiente)) < 0.02);
      for (const a of atribuidos) {
        // I3: nunca más que el monto real; las aplicaciones nunca son entrada.
        assert.ok(a.avanceGeneral <= a.montoReal + 0.01);
        if (a.tipo === "APLICACION_ESTIMACION") assert.equal(a.entradaGeneral, 0);
        // I5: ninguna entrada General revela un monto mayor al importe General.
        assert.ok(a.entradaGeneral <= importe + 0.01);
      }
      // I4: cada cobro vigente aparece exactamente una vez; los cancelados nunca.
      assert.deepEqual(atribuidos.map((a) => a.id).sort(), vigentes.map((m) => m.id).sort());
      // I6: el orden de entrada no cambia el resultado.
      assert.deepEqual(atribuirCobrosGeneral(importe, [...movs].reverse()), atribuidos);
    }
  });
});
