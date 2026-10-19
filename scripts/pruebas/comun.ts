import pg from "pg";
import { mensajeSeguro, prepararEntornoDePruebas } from "../../tests/helpers/base-de-pruebas";
import type { Consultar } from "../../tests/helpers/identidad-base-pruebas";

// Base común de los scripts de la base de pruebas de integración. Cada
// script valida TODO antes de conectarse y aborta (código 1) ante cualquier
// falla. Nunca imprime URLs, usuarios ni contraseñas.

export function validarOAbortar(script: string): { url: string } {
  try {
    const { url, destino, eliminadas } = prepararEntornoDePruebas(process.env, process.cwd());
    console.log(`[${script}] Destino validado (sin conexión): ${destino}`);
    if (eliminadas.length > 0) console.log(`[${script}] Variables retiradas del proceso: ${eliminadas.join(", ")}`);
    return { url };
  } catch (error) {
    abortar(script, error, process.env.TEST_DATABASE_URL);
  }
}

export function abortar(script: string, error: unknown, url: string | undefined): never {
  console.error(`[${script}] CANCELADO: ${mensajeSeguro(error, url)}`);
  process.exit(1);
}

export async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await cliente.connect();
  return cliente;
}

export const consultarCon =
  (cliente: pg.Client): Consultar =>
  async (sql, parametros) =>
    (await cliente.query(sql, parametros as unknown[] | undefined)).rows;
