import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { guardarDecoracionEgreso, obtenerEgresos } from "@/lib/server/contabilidad/egresos";
import { confirmarVinculadoAExistente } from "@/lib/server/contabilidad/documentos/confirmar-propuesta";
import { decoracionEgresoDesdeFormulario, prefijoOriginal } from "@/lib/contabilidad/formulario-egreso";
import { usuarioDePrueba } from "../helpers/usuarios";

// Decoración de egresos (Contabilidad → Egresos y captura inteligente):
// - contrato de actualización parcial (omitido conserva, null/"" limpia,
//   valor actualiza) y auditoría solo de cambios efectivos;
// - R1: un gasto pagado por una persona u orden de compra no recibe un pago
//   bancario nuevo;
// - vinculación atómica de un documento a un gasto existente.
// Base SIMULADA en memoria con estado y reversión de transacciones (sin BD
// real). Cifras ficticias.

type Fila = Record<string, unknown>;
type Gasto = { id: string; empresaId: string; pagadorBeneficiarioId: string | null; ordenCompraId: string | null };
type Egreso = {
  id: string;
  empresaId: string;
  gastoObraId: string;
  medioFinancieroId: string | null;
  facturaId: string | null;
  notasContables: string | null;
  fechaPago: Date | null;
  referenciaPago: string | null;
};
type Documento = { id: string; empresaId: string; estatus: string; egresoId: string | null; propuestaReconciliada: null };

const GASTOS: Gasto[] = [
  { id: "gasto-persona", empresaId: "empresa-prueba", pagadorBeneficiarioId: "benef-andres", ordenCompraId: null },
  { id: "gasto-oc", empresaId: "empresa-prueba", pagadorBeneficiarioId: null, ordenCompraId: "oc-1" },
  { id: "gasto-empresa", empresaId: "empresa-prueba", pagadorBeneficiarioId: null, ordenCompraId: null },
  { id: "gasto-empresa-2", empresaId: "empresa-prueba", pagadorBeneficiarioId: null, ordenCompraId: null },
  { id: "gasto-ajeno", empresaId: "empresa-ajena", pagadorBeneficiarioId: null, ordenCompraId: null },
];
const FECHA_HISTORICA = new Date(Date.UTC(2026, 9, 5, 15, 30)); // 5 oct 2026, 15:30 UTC

let estado: { egresos: Map<string, Egreso>; documentos: Map<string, Documento>; auditorias: Fila[] };
let escrituras: string[];
let fallarEn: string | null;
let siguiente: number;
let profundidad: number;
let transaccionesAnidadas: number;
let estadoTrasAnidada: ReturnType<typeof clonar> | null;
const originales: [Record<string, unknown>, string, unknown][] = [];

function sustituir(destino: Record<string, unknown>, metodo: string, impl: unknown) {
  originales.push([destino, metodo, destino[metodo]]);
  destino[metodo] = impl;
}
const modelo = (nombre: string) => (db as unknown as Record<string, Record<string, unknown>>)[nombre];
const deEmpresa = (where: Fila) => (where.empresaId as string) === "empresa-prueba";
function escribir(op: string) {
  if (fallarEn === op) throw new Error(`Falla simulada en ${op}`);
  escrituras.push(op);
}
const clonar = () => ({
  egresos: new Map([...estado.egresos].map(([k, v]) => [k, { ...v }])),
  documentos: new Map([...estado.documentos].map(([k, v]) => [k, { ...v }])),
  auditorias: [...estado.auditorias],
});

beforeEach(() => {
  estado = { egresos: new Map(), documentos: new Map(), auditorias: [] };
  escrituras = [];
  fallarEn = null;
  siguiente = 1;
  profundidad = 0;
  transaccionesAnidadas = 0;
  estadoTrasAnidada = null;
  estado.documentos.set("doc-1", { id: "doc-1", empresaId: "empresa-prueba", estatus: "PROCESADO", egresoId: null, propuestaReconciliada: null });
  estado.documentos.set("doc-ajeno", { id: "doc-ajeno", empresaId: "empresa-ajena", estatus: "PROCESADO", egresoId: null, propuestaReconciliada: null });

  const cliente = db as unknown as Record<string, unknown>;
  // Transacción simulada: si algo falla, se restaura el estado previo. Una
  // transacción abierta DENTRO de otra (db.$transaction anidado) se comporta
  // como en PostgreSQL: es independiente y confirma por su cuenta, así que
  // la reversión de la exterior NO deshace lo que la interior ya confirmó.
  sustituir(cliente, "$transaction", async (fn: (tx: unknown) => Promise<unknown>) => {
    const anidada = profundidad > 0;
    if (anidada) transaccionesAnidadas++;
    profundidad++;
    const respaldo = clonar();
    try {
      const resultado = await fn(db);
      if (anidada) estadoTrasAnidada = clonar();
      return resultado;
    } catch (error) {
      estado = !anidada && estadoTrasAnidada ? estadoTrasAnidada : respaldo;
      throw error;
    } finally {
      profundidad--;
      if (!anidada) estadoTrasAnidada = null;
    }
  });
  sustituir(cliente, "$queryRaw", async () => []);
  // La vinculación de documentos exige ARQENTO IA habilitada para la Empresa
  // (captura inteligente cerrada en el servidor si está apagada).
  sustituir(modelo("empresa"), "findUnique", async () => ({ inteligenciaHabilitada: true }));
  sustituir(modelo("gastoObra"), "findFirst", async ({ where }: { where: Fila }) => GASTOS.find((g) => g.id === where.id && g.empresaId === where.empresaId) ?? null);
  sustituir(modelo("egreso"), "findUnique", async ({ where }: { where: Fila }) => {
    const e = estado.egresos.get(where.gastoObraId as string);
    return e ? { ...e } : null;
  });
  sustituir(modelo("egreso"), "create", async ({ data }: { data: Fila }) => {
    escribir("egreso.create");
    const nuevo = { id: `egreso-${siguiente++}`, ...data } as Egreso;
    estado.egresos.set(nuevo.gastoObraId, nuevo);
    return { ...nuevo };
  });
  sustituir(modelo("egreso"), "update", async ({ where, data }: { where: Fila; data: Fila }) => {
    escribir("egreso.update");
    const e = estado.egresos.get(where.gastoObraId as string)!;
    Object.assign(e, data);
    return { ...e };
  });
  for (const m of ["medioFinanciero", "factura", "proyecto"]) {
    sustituir(modelo(m), "findFirst", async ({ where }: { where: Fila }) => (deEmpresa(where) ? { id: where.id } : null));
  }
  sustituir(modelo("registroAuditoria"), "create", async ({ data }: { data: Fila }) => {
    escribir("auditoria");
    estado.auditorias.push(data);
    return data;
  });
  sustituir(modelo("documentoEgreso"), "findFirst", async ({ where }: { where: Fila }) => {
    const d = estado.documentos.get(where.id as string);
    return d && d.empresaId === where.empresaId ? { ...d } : null;
  });
  sustituir(modelo("documentoEgreso"), "update", async ({ where, data }: { where: Fila; data: Fila }) => {
    escribir("documento.update");
    Object.assign(estado.documentos.get(where.id as string)!, data);
    return {};
  });
});
afterEach(() => {
  for (const [destino, metodo, original] of originales.splice(0).reverse()) destino[metodo] = original;
});

const administrador = usuarioDePrueba({ rol: "ADMINISTRADOR" });
const PAGO_POR_OTRA_VIA = /reposici|orden de compra/i;
function egresoExistente(gastoObraId: string, valores: Partial<Egreso>) {
  estado.egresos.set(gastoObraId, {
    id: `egreso-${gastoObraId}`,
    empresaId: "empresa-prueba",
    gastoObraId,
    medioFinancieroId: null,
    facturaId: null,
    notasContables: null,
    fechaPago: null,
    referenciaPago: null,
    ...valores,
  });
}
const COMPLETO = { medioFinancieroId: "banco-a", facturaId: "factura-1", notasContables: "Notas previas", fechaPago: FECHA_HISTORICA, referenciaPago: "REF-1" };
const egresoDe = (gastoObraId: string) => estado.egresos.get(gastoObraId)!;

// Simula el envío del formulario "Datos fiscales del gasto": originales
// ocultos + valores visibles (por defecto, los mismos precargados).
function formulario(e: Partial<Egreso>, cambios: Partial<Record<string, string>> = {}) {
  const originalesForm: Record<string, string> = {
    medioFinancieroId: e.medioFinancieroId ?? "",
    facturaId: e.facturaId ?? "",
    notasContables: e.notasContables ?? "",
    fechaPago: e.fechaPago ? e.fechaPago.toISOString().slice(0, 10) : "",
    referenciaPago: e.referenciaPago ?? "",
  };
  const fd = new FormData();
  for (const [campo, original] of Object.entries(originalesForm)) {
    fd.set(prefijoOriginal(campo), original);
    fd.set(campo, cambios[campo] ?? original);
  }
  return decoracionEgresoDesdeFormulario(fd);
}

describe("Contrato parcial de guardarDecoracionEgreso", () => {
  test("Campo omitido: se conserva; solo cambia lo enviado y solo eso se audita", async () => {
    egresoExistente("gasto-empresa", COMPLETO);
    await guardarDecoracionEgreso(administrador, "gasto-empresa", { notasContables: "Notas nuevas" });
    assert.deepEqual({ ...egresoDe("gasto-empresa"), id: undefined }, { ...COMPLETO, notasContables: "Notas nuevas", id: undefined, empresaId: "empresa-prueba", gastoObraId: "gasto-empresa" });
    const auditoria = estado.auditorias.at(-1)!;
    assert.deepEqual(auditoria.valorNuevo, { gastoObraId: "gasto-empresa", notasContables: "Notas nuevas" });
    assert.deepEqual(auditoria.valorAnterior, { notasContables: "Notas previas" });
  });

  for (const vacio of [null, ""]) {
    test(`Vacío explícito (${JSON.stringify(vacio)}): limpia solo ese campo`, async () => {
      egresoExistente("gasto-empresa", COMPLETO);
      await guardarDecoracionEgreso(administrador, "gasto-empresa", { facturaId: vacio });
      assert.equal(egresoDe("gasto-empresa").facturaId, null);
      assert.equal(egresoDe("gasto-empresa").notasContables, "Notas previas");
      assert.equal(egresoDe("gasto-empresa").medioFinancieroId, "banco-a");
    });
  }

  test("Valor nuevo: actualiza ese campo", async () => {
    egresoExistente("gasto-empresa", COMPLETO);
    await guardarDecoracionEgreso(administrador, "gasto-empresa", { referenciaPago: "REF-2" });
    assert.equal(egresoDe("gasto-empresa").referenciaPago, "REF-2");
    assert.equal(egresoDe("gasto-empresa").facturaId, "factura-1");
  });

  test("Sin cambios efectivos: no escribe ni audita", async () => {
    egresoExistente("gasto-empresa", COMPLETO);
    await guardarDecoracionEgreso(administrador, "gasto-empresa", { notasContables: "Notas previas" });
    assert.deepEqual(escrituras, []);
  });

  test("Crear: los campos omitidos quedan vacíos", async () => {
    await guardarDecoracionEgreso(administrador, "gasto-empresa", { facturaId: "factura-1" });
    const e = egresoDe("gasto-empresa");
    assert.deepEqual([e.facturaId, e.medioFinancieroId, e.notasContables, e.fechaPago, e.referenciaPago], ["factura-1", null, null, null, null]);
  });
});

describe("Formulario de Egresos: precarga + originales ocultos", () => {
  test("Solo cambia lo que el usuario modificó; lo demás se omite", () => {
    assert.deepEqual(formulario(COMPLETO, { notasContables: "Otra nota" }), { notasContables: "Otra nota" });
    assert.deepEqual(formulario(COMPLETO, { facturaId: "factura-2" }), { facturaId: "factura-2" });
    assert.deepEqual(formulario(COMPLETO), {});
  });

  test("Vaciar un campo es un borrado explícito (null)", () => {
    assert.deepEqual(formulario(COMPLETO, { medioFinancieroId: "" }), { medioFinancieroId: null });
  });

  test("Sin originales (registro nuevo) se envía todo", () => {
    const fd = new FormData();
    fd.set("facturaId", "factura-1");
    fd.set("notasContables", "");
    assert.deepEqual(decoracionEgresoDesdeFormulario(fd), { facturaId: "factura-1", notasContables: null });
  });

  test("Editar solo notas conserva factura, cuenta, fecha y referencia", async () => {
    egresoExistente("gasto-empresa", COMPLETO);
    await guardarDecoracionEgreso(administrador, "gasto-empresa", formulario(COMPLETO, { notasContables: "Nota corregida" }));
    assert.deepEqual({ ...egresoDe("gasto-empresa") }, { ...COMPLETO, notasContables: "Nota corregida", id: "egreso-gasto-empresa", empresaId: "empresa-prueba", gastoObraId: "gasto-empresa" });
  });

  test("Editar solo factura conserva notas y datos de pago", async () => {
    egresoExistente("gasto-empresa", COMPLETO);
    await guardarDecoracionEgreso(administrador, "gasto-empresa", formulario(COMPLETO, { facturaId: "factura-2" }));
    const e = egresoDe("gasto-empresa");
    assert.equal(e.facturaId, "factura-2");
    assert.equal(e.notasContables, "Notas previas");
    assert.equal(e.fechaPago?.getTime(), FECHA_HISTORICA.getTime());
    assert.equal(e.medioFinancieroId, "banco-a");
    assert.equal(e.referenciaPago, "REF-1");
  });

  test("Cambio concurrente de otra persona no se pisa: el campo no modificado se omite", async () => {
    egresoExistente("gasto-empresa", COMPLETO);
    const envio = formulario(COMPLETO, { notasContables: "Mía" }); // el formulario se abrió con factura-1
    egresoDe("gasto-empresa").facturaId = "factura-9"; // otra persona la cambió mientras tanto
    await guardarDecoracionEgreso(administrador, "gasto-empresa", envio);
    assert.equal(egresoDe("gasto-empresa").facturaId, "factura-9");
    assert.equal(egresoDe("gasto-empresa").notasContables, "Mía");
  });
});

describe("R1 — regresión con el contrato parcial", () => {
  for (const gastoId of ["gasto-persona", "gasto-oc"]) {
    for (const [campo, valor] of [
      ["fechaPago", "2026-10-06"],
      ["medioFinancieroId", "banco-a"],
      ["referenciaPago", "SPEI-123"],
    ] as const) {
      test(`${gastoId}: rechaza ${campo} nuevo y no escribe nada`, async () => {
        await assert.rejects(guardarDecoracionEgreso(administrador, gastoId, { [campo]: valor }), PAGO_POR_OTRA_VIA);
        assert.deepEqual(escrituras, []);
      });
    }
    test(`${gastoId}: factura y notas siempre se permiten`, async () => {
      await guardarDecoracionEgreso(administrador, gastoId, { facturaId: "factura-1", notasContables: "CFDI recibido" });
      const e = egresoDe(gastoId);
      assert.deepEqual([e.facturaId, e.notasContables, e.fechaPago, e.medioFinancieroId], ["factura-1", "CFDI recibido", null, null]);
    });
  }

  test("Gasto pagado por la Empresa: pago bancario permitido (sin cambios)", async () => {
    await guardarDecoracionEgreso(administrador, "gasto-empresa", { fechaPago: "2026-10-06", medioFinancieroId: "banco-a", referenciaPago: "SPEI-123" });
    assert.equal(egresoDe("gasto-empresa").medioFinancieroId, "banco-a");
  });

  test("El mensaje no revela quién pagó ni montos", async () => {
    await assert.rejects(guardarDecoracionEgreso(administrador, "gasto-persona", { fechaPago: "2026-10-06" }), (e: Error) => {
      assert.ok(!/andres|\$\d/i.test(e.message));
      return true;
    });
  });

  describe("Registro histórico con datos de pago (gasto pagado por persona)", () => {
    beforeEach(() => egresoExistente("gasto-persona", COMPLETO));

    test("Agregar factura desde el formulario conserva el pago original exacto", async () => {
      await guardarDecoracionEgreso(administrador, "gasto-persona", formulario(COMPLETO, { facturaId: "factura-2" }));
      const e = egresoDe("gasto-persona");
      assert.equal(e.facturaId, "factura-2");
      assert.equal(e.fechaPago?.getTime(), FECHA_HISTORICA.getTime());
      assert.equal(e.medioFinancieroId, "banco-a");
    });

    test("Reenviar la misma fecha (por día) no la altera", async () => {
      await guardarDecoracionEgreso(administrador, "gasto-persona", { fechaPago: "2026-10-05", notasContables: "x" });
      assert.equal(egresoDe("gasto-persona").fechaPago?.getTime(), FECHA_HISTORICA.getTime());
    });

    test("Eliminar explícitamente los datos de pago está permitido", async () => {
      await guardarDecoracionEgreso(administrador, "gasto-persona", formulario(COMPLETO, { fechaPago: "", medioFinancieroId: "", referenciaPago: "" }));
      const e = egresoDe("gasto-persona");
      assert.deepEqual([e.fechaPago, e.medioFinancieroId, e.referenciaPago], [null, null, null]);
      assert.equal(e.facturaId, "factura-1");
    });

    for (const [campo, valor] of [
      ["fechaPago", "2026-10-06"],
      ["medioFinancieroId", "banco-b"],
      ["referenciaPago", "REF-NUEVA"],
    ] as const) {
      test(`Modificar ${campo} se rechaza`, async () => {
        await assert.rejects(guardarDecoracionEgreso(administrador, "gasto-persona", formulario(COMPLETO, { [campo]: valor })), PAGO_POR_OTRA_VIA);
        assert.deepEqual(escrituras, []);
      });
    }
  });
});

describe("Captura inteligente — vinculación atómica a un gasto existente", () => {
  test("Conserva factura y notas existentes y registra solo el pago enviado", async () => {
    egresoExistente("gasto-empresa", { facturaId: "factura-1", notasContables: "Notas previas" });
    const r = await confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa", fechaPago: "2026-10-06", medioFinancieroId: "banco-a" });
    const e = egresoDe("gasto-empresa");
    assert.equal(e.facturaId, "factura-1");
    assert.equal(e.notasContables, "Notas previas");
    assert.equal(e.medioFinancieroId, "banco-a");
    assert.equal(e.referenciaPago, null, "no enviado y vacío antes: sigue vacío");
    const doc = estado.documentos.get("doc-1")!;
    assert.deepEqual([doc.estatus, doc.egresoId], ["VINCULADO", r.egresoId]);
  });

  test("Datos de pago no enviados se conservan", async () => {
    egresoExistente("gasto-empresa", COMPLETO);
    await confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa" });
    assert.equal(egresoDe("gasto-empresa").fechaPago?.getTime(), FECHA_HISTORICA.getTime());
    assert.equal(egresoDe("gasto-empresa").referenciaPago, "REF-1");
  });

  test("R1: gasto pagado por persona — se rechaza, nada se escribe y el documento no se vincula", async () => {
    await assert.rejects(
      confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-persona", fechaPago: "2026-10-06" }),
      PAGO_POR_OTRA_VIA
    );
    assert.equal(estado.egresos.has("gasto-persona"), false);
    assert.equal(estado.documentos.get("doc-1")!.estatus, "PROCESADO");
  });

  test("Falla en la decoración: rollback completo", async () => {
    egresoExistente("gasto-empresa", { facturaId: "factura-1" });
    fallarEn = "egreso.update";
    await assert.rejects(confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa", fechaPago: "2026-10-06" }));
    assert.equal(egresoDe("gasto-empresa").fechaPago, null);
    assert.equal(estado.documentos.get("doc-1")!.estatus, "PROCESADO");
    assert.equal(estado.auditorias.length, 0);
  });

  test("Falla al marcar el documento: la decoración se revierte", async () => {
    egresoExistente("gasto-empresa", { facturaId: "factura-1" });
    fallarEn = "documento.update";
    await assert.rejects(confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa", fechaPago: "2026-10-06", medioFinancieroId: "banco-a" }));
    const e = egresoDe("gasto-empresa");
    assert.deepEqual([e.fechaPago, e.medioFinancieroId, e.facturaId], [null, null, "factura-1"]);
    assert.equal(estado.auditorias.length, 0);
    assert.equal(estado.documentos.get("doc-1")!.estatus, "PROCESADO");
  });

  test("Falla al crear el egreso (gasto sin egreso previo): no queda egreso ni vínculo", async () => {
    fallarEn = "documento.update";
    await assert.rejects(confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa", fechaPago: "2026-10-06" }));
    assert.equal(estado.egresos.has("gasto-empresa"), false);
  });

  test("Usa una sola transacción (sin transacciones anidadas independientes)", async () => {
    await confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa", fechaPago: "2026-10-06" });
    assert.equal(transaccionesAnidadas, 0);
  });

  test("Vinculación repetida al mismo gasto: no duplica ni reescribe", async () => {
    const primero = await confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa", fechaPago: "2026-10-06" });
    const escriturasPrevias = escrituras.length;
    const segundo = await confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa", fechaPago: "2026-10-07" });
    assert.equal(segundo.egresoId, primero.egresoId);
    assert.equal(escrituras.length, escriturasPrevias, "sin escrituras nuevas");
    assert.equal(estado.egresos.size, 1);
    assert.equal(egresoDe("gasto-empresa").fechaPago?.toISOString().slice(0, 10), "2026-10-06");
  });

  test("Documento ya vinculado a otra operación: se rechaza", async () => {
    await confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa" });
    await assert.rejects(confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-empresa-2" }), /ya fue confirmado/);
    assert.equal(estado.egresos.has("gasto-empresa-2"), false);
  });
});

describe("Multiempresa y permisos", () => {
  test("Gasto de otra Empresa: no se decora ni se vincula", async () => {
    await assert.rejects(guardarDecoracionEgreso(administrador, "gasto-ajeno", { facturaId: "factura-1" }), /no existe|no pertenece/i);
    await assert.rejects(confirmarVinculadoAExistente(administrador, "doc-1", { gastoObraId: "gasto-ajeno" }), /no existe|no pertenece/i);
    assert.equal(estado.documentos.get("doc-1")!.estatus, "PROCESADO");
  });

  test("Documento de otra Empresa: no se vincula", async () => {
    await assert.rejects(confirmarVinculadoAExistente(administrador, "doc-ajeno", { gastoObraId: "gasto-empresa" }), /no existe|no pertenece/i);
    assert.equal(estado.egresos.size, 0);
  });

  test("Cuenta o factura de otra Empresa: se rechaza", async () => {
    const otro = usuarioDePrueba({ rol: "ADMINISTRADOR", empresaId: "empresa-ajena" });
    await assert.rejects(guardarDecoracionEgreso(otro, "gasto-ajeno", { medioFinancieroId: "banco-a" }), /no existe|no pertenece/i);
  });

  test("Supervisor no puede decorar egresos ni vincular documentos", async () => {
    const supervisor = usuarioDePrueba({ rol: "SUPERVISOR" });
    await assert.rejects(guardarDecoracionEgreso(supervisor, "gasto-empresa", { facturaId: "f" }));
    await assert.rejects(confirmarVinculadoAExistente(supervisor, "doc-1", { gastoObraId: "gasto-empresa" }));
  });
});

describe("Contabilidad → Egresos: lista", () => {
  beforeEach(() => {
    const egresoConPago = { id: "e", fechaPago: FECHA_HISTORICA, medioFinancieroId: "banco-a", referenciaPago: "REF-1", medioFinanciero: { nombre: "Banco A" }, factura: { id: "factura-1", uuid: "ABCDEF12-0000" }, facturaId: "factura-1", notasContables: "n", estatus: "VIGENTE" };
    const egresoSinPago = { ...egresoConPago, fechaPago: null, medioFinancieroId: null, referenciaPago: null, medioFinanciero: null };
    const fila = (id: string, extra: Fila, egreso: Fila) => ({
      id,
      fecha: new Date(2026, 9, 5),
      descripcion: id,
      monto: 1000,
      requiereFactura: false,
      facturaRef: null,
      proyecto: { nombre: "Obra", tipo: "FORMAL" },
      pagadorBeneficiarioId: null,
      ordenCompraId: null,
      ...extra,
      egreso,
    });
    sustituir(modelo("gastoObra"), "findMany", async () => [
      fila("persona-con-pago", { pagadorBeneficiarioId: "benef-andres" }, egresoConPago),
      fila("persona-sin-pago", { pagadorBeneficiarioId: "benef-andres" }, egresoSinPago),
      fila("oc-con-pago", { ordenCompraId: "oc-1" }, egresoConPago),
      fila("empresa-con-pago", {}, egresoConPago),
    ]);
    sustituir(modelo("egreso"), "findMany", async () => []);
  });

  test("Advertencia R1 solo en gastos pagados por otra vía con pago bancario", async () => {
    const filas = await obtenerEgresos(administrador, 2026, 10);
    assert.deepEqual(Object.fromEntries(filas.map((f) => [f.concepto, [f.pagoPorOtraVia, f.pagoRegistradoIndebido]])), {
      "persona-con-pago": ["PERSONA", true],
      "persona-sin-pago": ["PERSONA", false],
      "oc-con-pago": ["ORDEN_COMPRA", true],
      "empresa-con-pago": [null, false],
    });
  });

  test("Expone los identificadores actuales para precargar el formulario", async () => {
    const f = (await obtenerEgresos(administrador, 2026, 10)).find((x) => x.concepto === "empresa-con-pago")!;
    assert.deepEqual([f.medioFinancieroId, f.facturaId, f.referenciaPago, f.notasContables], ["banco-a", "factura-1", "REF-1", "n"]);
    assert.equal(f.cobroPago, "PAGADO", "estado de pago sin cambios");
  });
});
