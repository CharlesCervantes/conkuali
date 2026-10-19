import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { crearIngresoManual, editarIngresoManual, guardarDecoracionIngreso } from "@/lib/server/contabilidad/ingresos";
import {
  CAMPOS_DECORACION_INGRESO,
  CAMPOS_INGRESO_MANUAL,
  cambiosDesdeFormulario,
  decoracionIngresoDesdeFormulario,
  ingresoManualDesdeFormulario,
  prefijoOriginal,
} from "@/lib/contabilidad/formulario-ingreso";
import { usuarioDePrueba } from "../helpers/usuarios";

// Corrección de pérdida de datos en Contabilidad → Ingresos (octubre 2026):
// - contrato de actualización parcial (omitido conserva, null/"" limpia,
//   valor actualiza) en la decoración de un pago de cliente y en la edición
//   de un ingreso manual, con auditoría solo de cambios (anterior → nuevo);
// - formulario con precarga y originales ocultos (incluida la casilla);
// - privacidad de cobros PRIVADO (D-a), multiempresa, permisos y rollback.
// Base SIMULADA en memoria con reversión de transacciones (sin BD real).
// Cifras y datos ficticios.

type Fila = Record<string, unknown>;
type Movimiento = { id: string; empresaId: string; capa: "OPERATIVO" | "PRIVADO" | null };
type Ingreso = Fila & { id: string; empresaId: string; movimientoFinancieroClienteId: string | null };

const EMPRESA = "empresa-prueba";
const MOVIMIENTOS: Movimiento[] = [
  { id: "mov-general", empresaId: EMPRESA, capa: "OPERATIVO" },
  { id: "mov-sin-capa", empresaId: EMPRESA, capa: null },
  { id: "mov-privado", empresaId: EMPRESA, capa: "PRIVADO" },
  { id: "mov-ajeno", empresaId: "empresa-ajena", capa: "OPERATIVO" },
];
// Fecha de cobro histórica con hora distinta de medianoche: nunca debe
// normalizarse si no se modifica.
const FECHA_INGRESO = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
const FECHA_COBRO_HISTORICA = new Date(Date.UTC(2026, 9, 5, 17, 45, 30, 123));

let estado: { ingresos: Map<string, Ingreso>; auditorias: Fila[] };
let bloqueos: string[];
let fallarEn: string | null;
let siguiente: number;
const originales: [Record<string, unknown>, string, unknown][] = [];

function sustituir(destino: Record<string, unknown>, metodo: string, impl: unknown) {
  originales.push([destino, metodo, destino[metodo]]);
  destino[metodo] = impl;
}
const modelo = (nombre: string) => (db as unknown as Record<string, Record<string, unknown>>)[nombre];
const clonar = () => ({
  ingresos: new Map([...estado.ingresos].map(([k, v]) => [k, { ...v }])),
  auditorias: [...estado.auditorias],
});
function escribir(op: string) {
  if (fallarEn === op) throw new Error(`Falla simulada en ${op}`);
}
// Referencias (cuenta, factura, proyecto): las de otra Empresa contienen "ajen".
const referenciaPropia = (where: Fila) => where.empresaId === EMPRESA && !String(where.id).includes("ajen");

beforeEach(() => {
  estado = { ingresos: new Map(), auditorias: [] };
  bloqueos = [];
  fallarEn = null;
  siguiente = 1;
  const cliente = db as unknown as Record<string, unknown>;
  sustituir(cliente, "$transaction", async (fn: (tx: unknown) => Promise<unknown>) => {
    const respaldo = clonar();
    try {
      return await fn(db);
    } catch (error) {
      estado = respaldo;
      throw error;
    }
  });
  sustituir(cliente, "$queryRaw", async (partes: TemplateStringsArray, ...valores: unknown[]) => {
    bloqueos.push(`${partes.join("?")} [${valores.join(",")}]`);
    return [];
  });
  sustituir(modelo("movimientoFinancieroCliente"), "findFirst", async ({ where }: { where: Fila }) => {
    const m = MOVIMIENTOS.find((x) => x.id === where.id && x.empresaId === where.empresaId);
    return m ? { id: m.id, estimacionClienteCapa: m.capa ? { capa: m.capa } : null } : null;
  });
  sustituir(modelo("ingreso"), "findUnique", async ({ where }: { where: Fila }) => {
    const i = [...estado.ingresos.values()].find((x) => x.movimientoFinancieroClienteId === where.movimientoFinancieroClienteId);
    return i ? { ...i } : null;
  });
  sustituir(modelo("ingreso"), "findFirst", async ({ where }: { where: Fila }) => {
    const i = estado.ingresos.get(where.id as string);
    return i && i.empresaId === where.empresaId ? { ...i } : null;
  });
  sustituir(modelo("ingreso"), "create", async ({ data }: { data: Fila }) => {
    escribir("ingreso.create");
    const nuevo = { id: `ingreso-${siguiente++}`, ...data } as Ingreso;
    estado.ingresos.set(nuevo.id, nuevo);
    return { ...nuevo };
  });
  sustituir(modelo("ingreso"), "update", async ({ where, data }: { where: Fila; data: Fila }) => {
    escribir("ingreso.update");
    const i = where.id
      ? estado.ingresos.get(where.id as string)!
      : [...estado.ingresos.values()].find((x) => x.movimientoFinancieroClienteId === where.movimientoFinancieroClienteId)!;
    Object.assign(i, data);
    return { ...i };
  });
  for (const m of ["medioFinanciero", "factura", "proyecto"]) {
    sustituir(modelo(m), "findFirst", async ({ where }: { where: Fila }) => (referenciaPropia(where) ? { id: where.id } : null));
  }
  sustituir(modelo("registroAuditoria"), "create", async ({ data }: { data: Fila }) => {
    escribir("auditoria");
    estado.auditorias.push(data);
    return data;
  });
});
afterEach(() => {
  for (const [destino, metodo, original] of originales.splice(0).reverse()) destino[metodo] = original;
});

const admin = usuarioDePrueba({ rol: "ADMINISTRADOR" });
const adminSinPrivado = usuarioDePrueba({ rol: "ADMINISTRADOR", vistaPrivadaActiva: false });
const supervisor = usuarioDePrueba({ rol: "SUPERVISOR" });
const adminAjeno = usuarioDePrueba({ rol: "ADMINISTRADOR", empresaId: "empresa-ajena" });

const DECORACION_COMPLETA = {
  clienteNombre: "Cliente Ficticio SA",
  metodoIngreso: "TRANSFERENCIA",
  cuentaReceptoraId: "banco-a",
  referencia: null,
  comprobanteRef: "comprobantes/abc.pdf",
  comprobanteNombre: "abc.pdf",
  facturaId: "factura-1",
  facturaEsperada: true,
  comentarios: "Comentario previo",
};
function decoracionExistente(movimientoId: string, valores: Fila = {}) {
  const id = `ingreso-${movimientoId}`;
  estado.ingresos.set(id, { id, empresaId: EMPRESA, movimientoFinancieroClienteId: movimientoId, ...DECORACION_COMPLETA, ...valores });
  return id;
}
const MANUAL_COMPLETO = {
  fecha: FECHA_INGRESO,
  concepto: "Venta de material sobrante",
  monto: 1500,
  proyectoId: "proyecto-1",
  clienteNombre: "Cliente Ficticio SA",
  metodoIngreso: "DEPOSITO",
  cuentaReceptoraId: "banco-a",
  referencia: "DEP-77",
  comprobanteRef: "comprobantes/m.pdf",
  comprobanteNombre: "m.pdf",
  facturaId: "factura-1",
  facturaEsperada: true,
  comentarios: "Comentario previo",
  fechaCobro: FECHA_COBRO_HISTORICA,
  clasificacionManual: "INGRESO_OPERATIVO",
  estatus: "VIGENTE",
};
function manualExistente(valores: Fila = {}) {
  estado.ingresos.set("ingreso-manual", { id: "ingreso-manual", empresaId: EMPRESA, movimientoFinancieroClienteId: null, ...MANUAL_COMPLETO, ...valores });
  return "ingreso-manual";
}
const ingreso = (id: string) => estado.ingresos.get(id)!;
const auditorias = () => estado.auditorias;

// Simula el envío de los formularios tal como los arma ingresos-view.tsx:
// originales ocultos + valores visibles (por defecto, los precargados).
function valoresFormulario(i: Fila): Record<string, string> {
  const dia = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : "");
  return {
    clienteNombre: (i.clienteNombre as string) ?? "",
    metodoIngreso: (i.metodoIngreso as string) ?? "",
    cuentaReceptoraId: (i.cuentaReceptoraId as string) ?? "",
    facturaId: (i.facturaId as string) ?? "",
    comentarios: (i.comentarios as string) ?? "",
    fecha: dia(i.fecha),
    concepto: (i.concepto as string) ?? "",
    monto: i.monto === undefined || i.monto === null ? "" : String(i.monto),
    proyectoId: (i.proyectoId as string) ?? "",
    clasificacionManual: (i.clasificacionManual as string) ?? "",
    fechaCobro: dia(i.fechaCobro),
    referencia: (i.referencia as string) ?? "",
  };
}
function formulario(campos: readonly string[], i: Fila, cambios: Record<string, string> = {}, casilla?: boolean) {
  const actuales = valoresFormulario(i);
  const fd = new FormData();
  for (const campo of campos) {
    fd.set(prefijoOriginal(campo), actuales[campo]);
    fd.set(campo, cambios[campo] ?? actuales[campo]);
  }
  const original = Boolean(i.facturaEsperada);
  fd.set(prefijoOriginal("facturaEsperada"), original ? "true" : "false");
  if (casilla ?? original) fd.set("facturaEsperada", "on");
  return fd;
}
const formDecoracion = (i: Fila, cambios: Record<string, string> = {}, casilla?: boolean) =>
  decoracionIngresoDesdeFormulario(formulario(CAMPOS_DECORACION_INGRESO, i, cambios, casilla));
const formManual = (i: Fila, cambios: Record<string, string> = {}, casilla?: boolean) =>
  ingresoManualDesdeFormulario(formulario(CAMPOS_INGRESO_MANUAL, i, cambios, casilla));

describe("Formulario de Ingresos: precarga + originales ocultos", () => {
  test("Sin cambios: no se envía ningún campo", () => {
    assert.deepEqual(formDecoracion(DECORACION_COMPLETA), {});
    assert.deepEqual(formManual(MANUAL_COMPLETO), {});
  });
  test("Solo viaja lo que el usuario modificó; vaciar es null explícito", () => {
    assert.deepEqual(formDecoracion(DECORACION_COMPLETA, { comentarios: "Nuevo", facturaId: "" }), { comentarios: "Nuevo", facturaId: null });
  });
  test("Casilla: sin cambio se omite; marcar y desmarcar se envían", () => {
    assert.deepEqual(formDecoracion(DECORACION_COMPLETA, {}, true), {});
    assert.deepEqual(formDecoracion(DECORACION_COMPLETA, {}, false), { facturaEsperada: false });
    assert.deepEqual(formDecoracion({ ...DECORACION_COMPLETA, facturaEsperada: false }, {}, true), { facturaEsperada: true });
    assert.deepEqual(formDecoracion({ ...DECORACION_COMPLETA, facturaEsperada: false }, {}, false), {});
  });
  test("Un campo que el formulario no muestra nunca se envía", () => {
    const fd = new FormData();
    fd.set(prefijoOriginal("facturaEsperada"), "true");
    fd.set("facturaEsperada", "on");
    assert.deepEqual(decoracionIngresoDesdeFormulario(fd), {});
  });
  test("Valor actual fuera de la lista (opción \"(actual)\" seleccionada): se omite", () => {
    assert.deepEqual(formDecoracion({ ...DECORACION_COMPLETA, cuentaReceptoraId: "cuenta-inactiva" }), {});
  });
  test("Registro nuevo (sin originales): se envía todo", () => {
    const fd = new FormData();
    fd.set("comentarios", "Hola");
    fd.set("facturaId", "");
    assert.deepEqual(cambiosDesdeFormulario(fd, ["comentarios", "facturaId"]), { comentarios: "Hola", facturaId: null, facturaEsperada: false });
  });
});

describe("Decoración de un pago de cliente — contrato parcial", () => {
  test("Editar solo comentarios conserva cuenta, factura, cliente, método, factura esperada y comprobante", async () => {
    const id = decoracionExistente("mov-general");
    await guardarDecoracionIngreso(admin, "mov-general", formDecoracion(DECORACION_COMPLETA, { comentarios: "Nuevo comentario" }));
    assert.deepEqual(ingreso(id), { id, empresaId: EMPRESA, movimientoFinancieroClienteId: "mov-general", ...DECORACION_COMPLETA, comentarios: "Nuevo comentario" });
    assert.equal(auditorias().length, 1);
    assert.deepEqual(auditorias()[0].valorAnterior, { comentarios: "Comentario previo" });
    assert.deepEqual(auditorias()[0].valorNuevo, { movimientoFinancieroClienteId: "mov-general", comentarios: "Nuevo comentario" });
  });

  test("Cambiar solo la cuenta: cambia solo la cuenta y se audita anterior → nuevo", async () => {
    const id = decoracionExistente("mov-general");
    await guardarDecoracionIngreso(admin, "mov-general", formDecoracion(DECORACION_COMPLETA, { cuentaReceptoraId: "banco-b" }));
    assert.equal(ingreso(id).cuentaReceptoraId, "banco-b");
    assert.equal(ingreso(id).facturaId, "factura-1");
    assert.deepEqual(auditorias()[0].valorAnterior, { cuentaReceptoraId: "banco-a" });
  });

  test("Omitido conserva, null y \"\" limpian, valor actualiza", async () => {
    const id = decoracionExistente("mov-general");
    await guardarDecoracionIngreso(admin, "mov-general", { facturaId: null, comentarios: "", clienteNombre: "Otro Cliente" });
    const i = ingreso(id);
    assert.equal(i.facturaId, null);
    assert.equal(i.comentarios, null);
    assert.equal(i.clienteNombre, "Otro Cliente");
    assert.equal(i.cuentaReceptoraId, "banco-a");
    assert.equal(i.facturaEsperada, true);
  });

  test("Sin cambios efectivos: no escribe ni audita", async () => {
    const id = decoracionExistente("mov-general");
    const antes = { ...ingreso(id) };
    await guardarDecoracionIngreso(admin, "mov-general", formDecoracion(DECORACION_COMPLETA));
    await guardarDecoracionIngreso(admin, "mov-general", { cuentaReceptoraId: "banco-a" });
    assert.deepEqual(ingreso(id), antes);
    assert.equal(auditorias().length, 0);
  });

  test("Casilla \"se espera factura\": desmarcar y volver a marcar", async () => {
    const id = decoracionExistente("mov-general");
    await guardarDecoracionIngreso(admin, "mov-general", formDecoracion(DECORACION_COMPLETA, {}, false));
    assert.equal(ingreso(id).facturaEsperada, false);
    await guardarDecoracionIngreso(admin, "mov-general", formDecoracion({ ...DECORACION_COMPLETA, facturaEsperada: false }, {}, true));
    assert.equal(ingreso(id).facturaEsperada, true);
  });

  test("Comprobante: sin archivo nuevo se conserva; uno nuevo lo reemplaza", async () => {
    const id = decoracionExistente("mov-general");
    await guardarDecoracionIngreso(admin, "mov-general", { comentarios: "x", comprobanteRef: undefined, comprobanteNombre: undefined });
    assert.equal(ingreso(id).comprobanteRef, "comprobantes/abc.pdf");
    await guardarDecoracionIngreso(admin, "mov-general", { comprobanteRef: "comprobantes/nuevo.pdf", comprobanteNombre: "nuevo.pdf" });
    assert.equal(ingreso(id).comprobanteRef, "comprobantes/nuevo.pdf");
  });

  test("La referencia del cobro nunca se escribe desde la decoración (D-b)", async () => {
    const id = decoracionExistente("mov-general");
    await guardarDecoracionIngreso(admin, "mov-general", { referencia: "INTENTO", comentarios: "y" });
    assert.equal(ingreso(id).referencia, null);
  });

  test("Primera decoración: crea con lo enviado y deja vacío lo omitido", async () => {
    await guardarDecoracionIngreso(admin, "mov-sin-capa", { cuentaReceptoraId: "banco-a" });
    const creado = [...estado.ingresos.values()][0];
    assert.equal(creado.cuentaReceptoraId, "banco-a");
    assert.equal(creado.facturaId, null);
    assert.equal(creado.facturaEsperada, false);
    assert.equal(auditorias()[0].valorAnterior, undefined);
  });

  test("Serializa con bloqueo de fila del cobro", async () => {
    decoracionExistente("mov-general");
    await guardarDecoracionIngreso(admin, "mov-general", { comentarios: "z" });
    assert.ok(bloqueos.some((b) => /movimientos_financieros_cliente/.test(b) && /FOR UPDATE/.test(b) && b.includes("mov-general")));
  });

  test("Rollback: si falla la auditoría, la decoración no cambia", async () => {
    const id = decoracionExistente("mov-general");
    const antes = { ...ingreso(id) };
    fallarEn = "auditoria";
    await assert.rejects(guardarDecoracionIngreso(admin, "mov-general", { comentarios: "no debe quedar" }), /Falla simulada/);
    assert.deepEqual(ingreso(id), antes);
  });
});

describe("Decoración — privacidad (D-a), multiempresa y permisos", () => {
  test("Sin permiso privado, un cobro PRIVADO responde \"no encontrado\" y no se escribe nada", async () => {
    const id = decoracionExistente("mov-privado");
    const antes = { ...ingreso(id) };
    await assert.rejects(guardarDecoracionIngreso(adminSinPrivado, "mov-privado", { comentarios: "x" }), /no encontr|no existe/i);
    assert.deepEqual(ingreso(id), antes);
    assert.equal(auditorias().length, 0);
  });
  test("Sin permiso privado sí decora cobros General y sin capa", async () => {
    await guardarDecoracionIngreso(adminSinPrivado, "mov-general", { comentarios: "ok" });
    await guardarDecoracionIngreso(adminSinPrivado, "mov-sin-capa", { comentarios: "ok" });
    assert.equal(estado.ingresos.size, 2);
  });
  test("Con permiso privado decora un cobro PRIVADO", async () => {
    await guardarDecoracionIngreso(admin, "mov-privado", { comentarios: "ok" });
    assert.equal(estado.ingresos.size, 1);
  });
  test("Cobro de otra Empresa: no encontrado", async () => {
    await assert.rejects(guardarDecoracionIngreso(admin, "mov-ajeno", { comentarios: "x" }), /no encontr|no existe/i);
    await assert.rejects(guardarDecoracionIngreso(adminAjeno, "mov-general", { comentarios: "x" }), /no encontr|no existe/i);
    assert.equal(estado.ingresos.size, 0);
  });
  test("Cuenta o factura de otra Empresa: se rechaza y no se escribe", async () => {
    const id = decoracionExistente("mov-general");
    await assert.rejects(guardarDecoracionIngreso(admin, "mov-general", { cuentaReceptoraId: "banco-ajeno" }));
    await assert.rejects(guardarDecoracionIngreso(admin, "mov-general", { facturaId: "factura-ajena" }));
    assert.equal(ingreso(id).cuentaReceptoraId, "banco-a");
    assert.equal(ingreso(id).facturaId, "factura-1");
  });
  test("Supervisor no puede decorar", async () => {
    await assert.rejects(guardarDecoracionIngreso(supervisor, "mov-general", { comentarios: "x" }));
    assert.equal(estado.ingresos.size, 0);
  });
});

describe("Edición de un ingreso manual — contrato parcial", () => {
  test("Editar solo el concepto conserva todo lo demás, incluida la fecha de cobro histórica exacta", async () => {
    const id = manualExistente();
    await editarIngresoManual(admin, id, formManual(MANUAL_COMPLETO, { concepto: "Venta de material (corregido)" }));
    const i = ingreso(id);
    assert.equal(i.concepto, "Venta de material (corregido)");
    for (const campo of ["proyectoId", "clasificacionManual", "cuentaReceptoraId", "referencia", "facturaId", "comentarios", "facturaEsperada", "monto", "comprobanteRef"]) {
      assert.deepEqual(i[campo], (MANUAL_COMPLETO as Fila)[campo], campo);
    }
    assert.equal((i.fechaCobro as Date).getTime(), FECHA_COBRO_HISTORICA.getTime(), "fecha de cobro sin normalizar");
    assert.equal((i.fecha as Date).getTime(), FECHA_INGRESO.getTime());
    assert.deepEqual(auditorias()[0].valorAnterior, { concepto: "Venta de material sobrante" });
    assert.deepEqual(auditorias()[0].valorNuevo, { concepto: "Venta de material (corregido)" });
  });

  test("Regresión: la fecha de cobro ya no se reemplaza por la fecha del ingreso", async () => {
    const id = manualExistente();
    await editarIngresoManual(admin, id, formManual(MANUAL_COMPLETO, { comentarios: "otro" }));
    assert.notEqual((ingreso(id).fechaCobro as Date).getTime(), FECHA_INGRESO.getTime());
    assert.equal((ingreso(id).fechaCobro as Date).getTime(), FECHA_COBRO_HISTORICA.getTime());
  });

  test("Vaciar la fecha de cobro lo deja por cobrar; cambiarla la actualiza (auditado)", async () => {
    const id = manualExistente();
    await editarIngresoManual(admin, id, formManual(MANUAL_COMPLETO, { fechaCobro: "" }));
    assert.equal(ingreso(id).fechaCobro, null);
    await editarIngresoManual(admin, id, formManual({ ...MANUAL_COMPLETO, fechaCobro: null }, { fechaCobro: "2026-10-09" }));
    assert.equal((ingreso(id).fechaCobro as Date).toISOString().slice(0, 10), "2026-10-09");
    assert.deepEqual(auditorias()[0].valorAnterior, { fechaCobro: FECHA_COBRO_HISTORICA.toISOString() });
  });

  test("Los obligatorios no se pueden vaciar", async () => {
    const id = manualExistente();
    const antes = { ...ingreso(id) };
    for (const campo of ["concepto", "monto", "fecha", "clasificacionManual"]) {
      await assert.rejects(editarIngresoManual(admin, id, { [campo]: "" }), /obligatori|Selecciona/, campo);
      await assert.rejects(editarIngresoManual(admin, id, { [campo]: null }), /obligatori|Selecciona/, campo);
    }
    assert.deepEqual(ingreso(id), antes);
  });

  test("Clasificación histórica vacía: se conserva vacía si no se elige", async () => {
    const id = manualExistente({ clasificacionManual: null });
    await editarIngresoManual(admin, id, formManual({ ...MANUAL_COMPLETO, clasificacionManual: null }, { comentarios: "otro" }));
    assert.equal(ingreso(id).clasificacionManual, null);
    assert.equal(ingreso(id).comentarios, "otro");
  });

  test("Mismo monto escrito distinto (1500 vs 1500.00): no es un cambio", async () => {
    const id = manualExistente();
    await editarIngresoManual(admin, id, formManual(MANUAL_COMPLETO, { monto: "1500.00" }));
    assert.equal(auditorias().length, 0);
  });

  test("Vaciar proyecto/cuenta/factura/referencia es explícito y se audita", async () => {
    const id = manualExistente();
    await editarIngresoManual(admin, id, formManual(MANUAL_COMPLETO, { proyectoId: "", cuentaReceptoraId: "", facturaId: "", referencia: "" }));
    const i = ingreso(id);
    assert.deepEqual([i.proyectoId, i.cuentaReceptoraId, i.facturaId, i.referencia], [null, null, null, null]);
    assert.equal(i.comentarios, "Comentario previo");
    assert.deepEqual(Object.keys(auditorias()[0].valorAnterior as object).sort(), ["cuentaReceptoraId", "facturaId", "proyectoId", "referencia"]);
  });

  test("Un ingreso que decora un pago no se edita como manual", async () => {
    const id = decoracionExistente("mov-general");
    await assert.rejects(editarIngresoManual(admin, id, { concepto: "x" }), /pago de cliente/);
  });

  test("Referencias de otra Empresa se rechazan; ingreso de otra Empresa no se encuentra", async () => {
    const id = manualExistente();
    await assert.rejects(editarIngresoManual(admin, id, { proyectoId: "proyecto-ajeno" }));
    await assert.rejects(editarIngresoManual(admin, id, { cuentaReceptoraId: "banco-ajeno" }));
    await assert.rejects(editarIngresoManual(adminAjeno, id, { concepto: "x" }), /no encontr|no existe/i);
    assert.equal(ingreso(id).proyectoId, "proyecto-1");
  });

  test("Supervisor no puede editar; rollback si falla la auditoría", async () => {
    const id = manualExistente();
    await assert.rejects(editarIngresoManual(supervisor, id, { concepto: "x" }));
    fallarEn = "auditoria";
    await assert.rejects(editarIngresoManual(admin, id, { concepto: "no debe quedar" }), /Falla simulada/);
    assert.equal(ingreso(id).concepto, "Venta de material sobrante");
  });

  test("Serializa con bloqueo de fila del ingreso", async () => {
    const id = manualExistente();
    await editarIngresoManual(admin, id, { concepto: "x" });
    assert.ok(bloqueos.some((b) => /FROM ingresos/.test(b) && /FOR UPDATE/.test(b) && b.includes(id)));
  });
});

describe("Registro nuevo: validaciones obligatorias sin cambios", () => {
  test("Crear un ingreso manual sigue exigiendo la clasificación", async () => {
    await assert.rejects(crearIngresoManual(admin, { fecha: "2026-10-01", concepto: "x", monto: "10" }));
    await crearIngresoManual(admin, { fecha: "2026-10-01", concepto: "x", monto: "10", clasificacionManual: "INGRESO_OPERATIVO" });
    assert.equal(estado.ingresos.size, 1);
  });
});
