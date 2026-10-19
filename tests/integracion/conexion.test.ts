import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/server/db";
import { verificarConexionDePruebas } from "./apoyo/base";

// Pruebas de integración — SOLO contra el PostgreSQL local dedicado que
// validó tests/setup/integracion.mjs (URL local "*_test", servidor no Neon,
// marcador exclusivo de ARQENTO). Requiere el esquema ya aplicado con
// `npm run test:integracion:migrar`; estas pruebas nunca ejecutan migraciones.

after(() => db.$disconnect());

describe("Integración — base aislada", () => {
  test("El cliente de la aplicación está conectado a la base de pruebas marcada", async () => {
    const identidad = await verificarConexionDePruebas();
    assert.match(identidad.baseActual, /_test$/);
    assert.equal(identidad.esNeon, false);
  });

  test("Los servicios externos están simulados y sin credenciales", async () => {
    assert.equal(process.env.OPENAI_API_KEY, undefined);
    assert.equal(Object.keys(process.env).some((k) => k.startsWith("R2_")), false);
    const { default: OpenAI } = await import("openai");
    assert.throws(() => new OpenAI({ apiKey: "x" }).responses.parse({} as never), /deshabilitado/);
  });
});
