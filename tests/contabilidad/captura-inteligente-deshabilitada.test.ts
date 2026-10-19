import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import {
  obtenerDocumentoEgreso,
  obtenerDocumentosDelLote,
  subirDocumentosEgreso,
} from "@/lib/server/contabilidad/documentos/documento-egreso";
import {
  confirmarComoEgresoManual,
  confirmarComoGastoNuevo,
  confirmarVinculadoAExistente,
  crearProveedorDesdeDocumento,
  descartarDocumentoEgreso,
} from "@/lib/server/contabilidad/documentos/confirmar-propuesta";
import { MENSAJE_CAPTURA_DESHABILITADA } from "@/lib/server/contabilidad/documentos/habilitacion";
import { autorizarConsumo, inteligenciaHabilitadaParaEmpresa } from "@/lib/server/inteligencia/capacidades";
import { usuarioDePrueba } from "../helpers/usuarios";

// Preparación para PRD (octubre 2026): con ARQENTO IA apagada para la
// Empresa (inteligenciaHabilitada = false, el valor por omisión), la captura
// inteligente queda cerrada en el SERVIDOR — ninguna operación del módulo lee
// ni escribe nada, ni sube a R2, ni encola, ni llama a la IA. Base SIMULADA:
// cualquier acceso a documentos, transacciones o consultas crudas queda
// registrado, y no debe ocurrir ninguno.

type Fila = Record<string, unknown>;
let empresa: { inteligenciaHabilitada: boolean } | null;
let accesos: string[];
const originales: [Record<string, unknown>, string, unknown][] = [];

function sustituir(destino: Record<string, unknown>, metodo: string, impl: unknown) {
  originales.push([destino, metodo, destino[metodo]]);
  destino[metodo] = impl;
}
const modelo = (nombre: string) => (db as unknown as Record<string, Record<string, unknown>>)[nombre];

beforeEach(() => {
  empresa = { inteligenciaHabilitada: false };
  accesos = [];
  sustituir(modelo("empresa"), "findUnique", async ({ where }: { where: Fila }) =>
    where.id === "empresa-prueba" && empresa ? { inteligenciaHabilitada: empresa.inteligenciaHabilitada } : null
  );
  const cliente = db as unknown as Record<string, unknown>;
  sustituir(cliente, "$transaction", async () => {
    accesos.push("$transaction");
    throw new Error("No debió abrir una transacción");
  });
  sustituir(cliente, "$queryRaw", async () => {
    accesos.push("$queryRaw");
    return [];
  });
  for (const metodo of ["findFirst", "findMany", "create", "update"]) {
    sustituir(modelo("documentoEgreso"), metodo, async () => {
      accesos.push(`documentoEgreso.${metodo}`);
      return metodo === "findMany" ? [] : null;
    });
  }
  for (const [m, metodo] of [["gastoObra", "create"], ["egreso", "create"], ["trabajoProcesamientoDocumento", "create"], ["beneficiario", "create"]] as const) {
    sustituir(modelo(m), metodo, async () => {
      accesos.push(`${m}.${metodo}`);
      return null;
    });
  }
});
afterEach(() => {
  for (const [destino, metodo, original] of originales.splice(0).reverse()) destino[metodo] = original;
});

const admin = usuarioDePrueba({ rol: "ADMINISTRADOR" });
const supervisor = usuarioDePrueba({ rol: "SUPERVISOR" });
const PDF = { nombre: "comprobante.pdf", tipoMime: "application/pdf", bytes: Buffer.from("%PDF-1.4 ficticio") };

const OPERACIONES: [string, () => Promise<unknown>][] = [
  ["subir documentos", () => subirDocumentosEgreso(admin, [PDF], "contexto")],
  ["consultar un documento", () => obtenerDocumentoEgreso(admin, "doc-1")],
  ["consultar un lote", () => obtenerDocumentosDelLote(admin, "lote-1")],
  ["confirmar como gasto nuevo", () => confirmarComoGastoNuevo(admin, "doc-1", { proyectoId: "p", semanaId: "s", fecha: "2026-10-01", categoria: "MATERIALES", monto: "10", metodoPago: "EFECTIVO" })],
  ["vincular a un gasto existente", () => confirmarVinculadoAExistente(admin, "doc-1", { gastoObraId: "gasto-1" })],
  ["confirmar como egreso manual", () => confirmarComoEgresoManual(admin, "doc-1", { fecha: "2026-10-01", concepto: "x", monto: "10", clasificacionManual: "GASTO_ADMINISTRATIVO" })],
  ["crear proveedor desde documento", () => crearProveedorDesdeDocumento(admin, { nombre: "Proveedor Ficticio" })],
  ["descartar documento", () => descartarDocumentoEgreso(admin, "doc-1")],
];

describe("Captura inteligente con ARQENTO IA apagada", () => {
  for (const [nombre, operacion] of OPERACIONES) {
    test(`${nombre}: se rechaza en el servidor sin leer ni escribir nada`, async () => {
      await assert.rejects(operacion(), (e: Error) => e.message === MENSAJE_CAPTURA_DESHABILITADA);
      assert.deepEqual(accesos, [], "ningún acceso a documentos, gastos, egresos, cola ni transacciones");
    });
  }

  test("Empresa inexistente o sin configuración: se trata como apagada", async () => {
    empresa = null;
    assert.equal(await inteligenciaHabilitadaParaEmpresa("empresa-prueba"), false);
    await assert.rejects(obtenerDocumentosDelLote(admin, "lote-1"), (e: Error) => e.message === MENSAJE_CAPTURA_DESHABILITADA);
  });

  test("El procesamiento tampoco se autoriza (autorizarConsumo → IA_DESHABILITADA)", async () => {
    assert.deepEqual(await autorizarConsumo("empresa-prueba", "ANALISIS_DOCUMENTAL_TEXTO"), { autorizado: false, motivo: "IA_DESHABILITADA" });
    assert.deepEqual(await autorizarConsumo("empresa-prueba", "ANALISIS_VISUAL"), { autorizado: false, motivo: "IA_DESHABILITADA" });
  });

  test("Los permisos se siguen verificando primero (Supervisor: sin permiso, no \"deshabilitado\")", async () => {
    await assert.rejects(subirDocumentosEgreso(supervisor, [PDF]), (e: Error) => e.message !== MENSAJE_CAPTURA_DESHABILITADA);
    assert.deepEqual(accesos, []);
  });
});

describe("Captura inteligente con ARQENTO IA habilitada", () => {
  test("El módulo queda disponible (consultar un lote llega a la base)", async () => {
    empresa = { inteligenciaHabilitada: true };
    assert.equal(await inteligenciaHabilitadaParaEmpresa("empresa-prueba"), true);
    assert.deepEqual(await obtenerDocumentosDelLote(admin, "lote-1"), []);
    assert.deepEqual(accesos, ["documentoEgreso.findMany"]);
  });
});
