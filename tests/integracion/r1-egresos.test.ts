import { after, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { guardarDecoracionEgreso } from "@/lib/server/contabilidad/egresos";
import { confirmarVinculadoAExistente } from "@/lib/server/contabilidad/documentos/confirmar-propuesta";
import {
  EMPRESA,
  MEDIO_AJENO,
  MEDIO_BANCO,
  admin,
  adminAjeno,
  baseLimpiaConDatos,
  conFallaSimulada,
  crearGasto,
  repetir,
  sinInterbloqueos,
  supervisor,
} from "./apoyo/base";

// R1 y el contrato parcial de Egresos contra PostgreSQL REAL (base local
// dedicada, verificada por tests/setup/integracion.mjs). La captura
// inteligente se prueba solo en su persistencia: OpenAI y el almacenamiento
// están simulados y estos flujos no los invocan. Datos ficticios.

after(() => db.$disconnect());
beforeEach(async () => {
  await baseLimpiaConDatos();
  // La vinculación de documentos (captura inteligente) exige ARQENTO IA
  // habilitada para la Empresa.
  await db.empresa.update({ where: { id: EMPRESA }, data: { inteligenciaHabilitada: true } });
  // Pagado directo por la Empresa (admite pago bancario) y pagado por una
  // persona (R1: su pago es la reposición, no un pago bancario).
  await crearGasto("gasto-empresa", "1500.00", { estatus: "APROBADO", pagador: null });
  await crearGasto("gasto-empresa-2", "700.00", { estatus: "APROBADO", pagador: null });
  await crearGasto("gasto-persona", "800.00", { estatus: "APROBADO" });
});

const egresoDe = (gastoObraId: string) => db.egreso.findUnique({ where: { gastoObraId } });
const auditoriasEgreso = () => db.registroAuditoria.findMany({ where: { entidad: "Egreso" }, orderBy: { createdAt: "asc" } });

async function documento(id: string) {
  return db.documentoEgreso.create({
    data: {
      id,
      empresaId: EMPRESA,
      archivoRef: `pruebas/${id}.pdf`,
      archivoNombre: `${id}.pdf`,
      tipoMime: "application/pdf",
      hashArchivo: `hash-${id}`,
      loteId: "lote-integracion",
      subidoPorId: admin.id,
      estatus: "PROCESADO",
    },
  });
}

const PAGO_COMPLETO = { notasContables: "Nota A", referenciaPago: "REF-1", medioFinancieroId: MEDIO_BANCO, fechaPago: "2026-10-07" };

describe("R1 en PostgreSQL — contrato parcial de guardarDecoracionEgreso", () => {
  test("Campo omitido se conserva; solo cambia y se audita lo enviado", async () => {
    await guardarDecoracionEgreso(admin, "gasto-empresa", PAGO_COMPLETO);
    const antes = (await egresoDe("gasto-empresa"))!;
    await guardarDecoracionEgreso(admin, "gasto-empresa", { notasContables: "Nota B" });
    const despues = (await egresoDe("gasto-empresa"))!;
    assert.equal(despues.notasContables, "Nota B");
    assert.equal(despues.referenciaPago, "REF-1");
    assert.equal(despues.medioFinancieroId, MEDIO_BANCO);
    assert.equal(despues.fechaPago?.getTime(), antes.fechaPago?.getTime());
    const auditorias = await auditoriasEgreso();
    assert.equal(auditorias.length, 2);
    assert.deepEqual(Object.keys(auditorias[1].valorNuevo as object).sort(), ["gastoObraId", "notasContables"]);
  });

  test("null explícito limpia solo ese campo", async () => {
    await guardarDecoracionEgreso(admin, "gasto-empresa", PAGO_COMPLETO);
    await guardarDecoracionEgreso(admin, "gasto-empresa", { referenciaPago: null });
    const e = (await egresoDe("gasto-empresa"))!;
    assert.equal(e.referenciaPago, null);
    assert.equal(e.notasContables, "Nota A");
    assert.equal(e.medioFinancieroId, MEDIO_BANCO);
  });

  test("Sin cambios efectivos: no escribe ni audita", async () => {
    await guardarDecoracionEgreso(admin, "gasto-empresa", PAGO_COMPLETO);
    await guardarDecoracionEgreso(admin, "gasto-empresa", PAGO_COMPLETO);
    assert.equal((await auditoriasEgreso()).length, 1);
  });

  test("Ediciones simultáneas de campos distintos no se pisan (FOR UPDATE real)", async () => {
    await guardarDecoracionEgreso(admin, "gasto-empresa", PAGO_COMPLETO);
    await repetir(5, async (vuelta) => {
      const r = await Promise.allSettled([
        guardarDecoracionEgreso(admin, "gasto-empresa", { notasContables: `Nota ${vuelta}` }),
        guardarDecoracionEgreso(admin, "gasto-empresa", { referenciaPago: `REF-${vuelta}` }),
      ]);
      sinInterbloqueos(r);
      assert.ok(r.every((x) => x.status === "fulfilled"), JSON.stringify(r));
      const e = (await egresoDe("gasto-empresa"))!;
      assert.equal(e.notasContables, `Nota ${vuelta}`);
      assert.equal(e.referenciaPago, `REF-${vuelta}`);
    });
    assert.equal(await db.egreso.count({ where: { gastoObraId: "gasto-empresa" } }), 1);
  });
});

describe("R1 en PostgreSQL — validaciones de pago", () => {
  test("Gasto pagado por una persona: un pago bancario nuevo se rechaza y no se crea egreso", async () => {
    await assert.rejects(guardarDecoracionEgreso(admin, "gasto-persona", { fechaPago: "2026-10-07", medioFinancieroId: MEDIO_BANCO }));
    assert.equal(await egresoDe("gasto-persona"), null);
    assert.equal((await auditoriasEgreso()).length, 0);
  });

  test("Gasto pagado por una persona: factura/notas sí se permiten, sin datos de pago", async () => {
    await guardarDecoracionEgreso(admin, "gasto-persona", { notasContables: "Solo nota" });
    const e = (await egresoDe("gasto-persona"))!;
    assert.equal(e.notasContables, "Solo nota");
    assert.equal(e.fechaPago, null);
    assert.equal(e.medioFinancieroId, null);
  });

  test("Histórico con pago previo: se conserva intacto (incluida la hora) y no admite un pago distinto", async () => {
    const fechaHistorica = new Date(Date.UTC(2026, 9, 5, 15, 30, 12, 345));
    await db.egreso.create({
      data: { empresaId: EMPRESA, gastoObraId: "gasto-persona", registradoPorId: admin.id, fechaPago: fechaHistorica, referenciaPago: "HIST" },
    });
    await guardarDecoracionEgreso(admin, "gasto-persona", { notasContables: "Nota nueva" });
    const e = (await egresoDe("gasto-persona"))!;
    assert.equal(e.fechaPago?.getTime(), fechaHistorica.getTime());
    assert.equal(e.referenciaPago, "HIST");
    await assert.rejects(guardarDecoracionEgreso(admin, "gasto-persona", { referenciaPago: "NUEVA" }));
    assert.equal((await egresoDe("gasto-persona"))!.referenciaPago, "HIST");
  });

  test("Gasto pagado por la Empresa: pago bancario permitido", async () => {
    await guardarDecoracionEgreso(admin, "gasto-empresa", PAGO_COMPLETO);
    assert.equal((await egresoDe("gasto-empresa"))!.referenciaPago, "REF-1");
  });
});

describe("R1 en PostgreSQL — vinculación atómica de documentos", () => {
  const vincular = (doc: string, gastoObraId: string, extra: Record<string, unknown> = {}) =>
    confirmarVinculadoAExistente(admin, doc, { gastoObraId, referenciaPago: "SPEI-DOC", medioFinancieroId: MEDIO_BANCO, fechaPago: "2026-10-08", ...extra });

  test("Vincula: crea el egreso con el pago y marca el documento", async () => {
    await documento("doc-1");
    const { egresoId } = await vincular("doc-1", "gasto-empresa");
    const doc = await db.documentoEgreso.findUniqueOrThrow({ where: { id: "doc-1" } });
    assert.equal(doc.estatus, "VINCULADO");
    assert.equal(doc.egresoId, egresoId);
    assert.equal((await egresoDe("gasto-empresa"))!.referenciaPago, "SPEI-DOC");
  });

  test("Conserva factura/notas existentes y solo registra el pago enviado", async () => {
    await guardarDecoracionEgreso(admin, "gasto-empresa", { notasContables: "Nota previa" });
    await documento("doc-1");
    await confirmarVinculadoAExistente(admin, "doc-1", { gastoObraId: "gasto-empresa", referenciaPago: "SOLO-REF" });
    const e = (await egresoDe("gasto-empresa"))!;
    assert.equal(e.notasContables, "Nota previa");
    assert.equal(e.referenciaPago, "SOLO-REF");
    assert.equal(e.medioFinancieroId, null);
  });

  test("Vinculación repetida (secuencial y simultánea): un solo egreso, sin interbloqueos", async () => {
    await documento("doc-1");
    const primero = await vincular("doc-1", "gasto-empresa");
    assert.deepEqual(await vincular("doc-1", "gasto-empresa"), primero);
    await documento("doc-2");
    const r = await Promise.allSettled([vincular("doc-2", "gasto-empresa-2"), vincular("doc-2", "gasto-empresa-2")]);
    sinInterbloqueos(r);
    assert.ok(r.every((x) => x.status === "fulfilled"), JSON.stringify(r));
    assert.equal(await db.egreso.count(), 2);
  });

  test("Documento ya vinculado a otra operación: se rechaza", async () => {
    await documento("doc-1");
    await vincular("doc-1", "gasto-empresa");
    await assert.rejects(vincular("doc-1", "gasto-empresa-2"), /otra operación/);
    assert.equal(await egresoDe("gasto-empresa-2"), null);
  });

  test("Rollback real: si falla marcar el documento, no queda egreso ni auditoría", async () => {
    await documento("doc-1");
    await conFallaSimulada("documentos_egreso", `TG_OP = 'UPDATE'`, () => assert.rejects(vincular("doc-1", "gasto-empresa"), /Falla simulada/));
    assert.equal(await egresoDe("gasto-empresa"), null);
    assert.equal(await db.registroAuditoria.count(), 0);
    assert.equal((await db.documentoEgreso.findUniqueOrThrow({ where: { id: "doc-1" } })).estatus, "PROCESADO");
  });

  test("R1: vincular un pago bancario a un gasto pagado por persona se rechaza sin escribir nada", async () => {
    await documento("doc-1");
    await assert.rejects(vincular("doc-1", "gasto-persona"));
    assert.equal(await egresoDe("gasto-persona"), null);
    const doc = await db.documentoEgreso.findUniqueOrThrow({ where: { id: "doc-1" } });
    assert.equal(doc.estatus, "PROCESADO");
    assert.equal(doc.egresoId, null);
  });
});

describe("R1 en PostgreSQL — multiempresa y permisos", () => {
  test("Otra Empresa no decora gastos ni vincula documentos de esta Empresa", async () => {
    await documento("doc-1");
    await assert.rejects(guardarDecoracionEgreso(adminAjeno, "gasto-empresa", { notasContables: "intrusa" }));
    await assert.rejects(confirmarVinculadoAExistente(adminAjeno, "doc-1", { gastoObraId: "gasto-empresa" }));
    assert.equal(await egresoDe("gasto-empresa"), null);
    assert.equal((await db.documentoEgreso.findUniqueOrThrow({ where: { id: "doc-1" } })).estatus, "PROCESADO");
  });

  test("Una cuenta de otra Empresa se rechaza", async () => {
    await assert.rejects(guardarDecoracionEgreso(admin, "gasto-empresa", { medioFinancieroId: MEDIO_AJENO }));
    assert.equal(await egresoDe("gasto-empresa"), null);
  });

  test("Supervisor no puede decorar egresos ni vincular documentos", async () => {
    await documento("doc-1");
    await assert.rejects(guardarDecoracionEgreso(supervisor, "gasto-empresa", { notasContables: "x" }));
    await assert.rejects(confirmarVinculadoAExistente(supervisor, "doc-1", { gastoObraId: "gasto-empresa" }));
    assert.equal(await egresoDe("gasto-empresa"), null);
  });
});
