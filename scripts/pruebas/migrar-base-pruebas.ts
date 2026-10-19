// Aplica las migraciones a la base de pruebas de integración — EXCLUSIVAMENTE
// con `prisma migrate deploy`, sin argumentos adicionales (nunca migrate dev,
// migrate reset ni db push). Antes verifica la URL y la identidad de la base
// (marcador exclusivo); después vuelve a verificarla.
//
// El CLI de Prisma recibe DATABASE_URL y DIRECT_URL = base de pruebas y
// DOTENV_CONFIG_PATH a un archivo inexistente: prisma.config.ts
// (`import "dotenv/config"`) no puede cargar el .env de Neon.
// Uso: npm run test:integracion:migrar
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { abortar, conectar, consultarCon, validarOAbortar } from "./comun";
import { baseDeUrl, verificarIdentidadOAbortar } from "../../tests/helpers/identidad-base-pruebas";

const SCRIPT = "migrar-base-pruebas";

async function verificar(url: string) {
  const cliente = await conectar(url);
  try {
    return await verificarIdentidadOAbortar(consultarCon(cliente), baseDeUrl(url));
  } finally {
    await cliente.end();
  }
}

async function main() {
  const { url } = validarOAbortar(SCRIPT);
  await verificar(url);
  console.log(`[${SCRIPT}] Identidad de la base verificada (marcador válido).`);

  if (process.env.DIRECT_URL !== url || process.env.DATABASE_URL !== url) {
    throw new Error("El entorno del CLI de Prisma no apunta a la base de pruebas.");
  }
  const cli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  if (!existsSync(cli)) throw new Error("No se encontró el CLI de Prisma en node_modules.");

  const resultado = spawnSync(process.execPath, [cli, "migrate", "deploy"], { env: process.env, stdio: "inherit" });
  if (resultado.status !== 0) throw new Error(`prisma migrate deploy terminó con código ${resultado.status}.`);

  await verificar(url);
  const cliente = await conectar(url);
  try {
    const { rows } = await cliente.query(`SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`);
    console.log(`[${SCRIPT}] Migraciones aplicadas en la base de pruebas: ${rows[0].n}. Siguiente paso: npm run test:integracion`);
  } finally {
    await cliente.end();
  }
}

main().catch((error) => abortar(SCRIPT, error, process.env.TEST_DATABASE_URL));
