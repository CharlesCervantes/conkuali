// Prepara la base de pruebas de integración: crea el marcador exclusivo de
// ARQENTO, SOLO si la base es local, se llama como indica TEST_DATABASE_URL
// (sufijo "_test") y está completamente vacía. Si el marcador ya existe y es
// válido, no hace nada. Uso: npm run test:integracion:preparar
import { abortar, conectar, consultarCon, validarOAbortar } from "./comun";
import {
  ESQUEMA_MARCADOR,
  TABLA_MARCADOR,
  VALOR_MARCADOR,
  baseDeUrl,
  evaluarBaseVaciaParaMarcar,
  evaluarIdentidad,
  leerIdentidad,
} from "../../tests/helpers/identidad-base-pruebas";

const SCRIPT = "preparar-base-pruebas";

async function main() {
  const { url } = validarOAbortar(SCRIPT);
  const base = baseDeUrl(url);
  const cliente = await conectar(url);
  try {
    const consultar = consultarCon(cliente);
    const obs = await leerIdentidad(consultar);

    if (evaluarIdentidad(obs, base).length === 0) {
      console.log(`[${SCRIPT}] La base ya está preparada (marcador válido). No se hizo ningún cambio.`);
      return;
    }
    const errores = evaluarBaseVaciaParaMarcar(obs, base);
    if (errores.length > 0) throw new Error(errores.join(" "));

    await cliente.query("BEGIN");
    try {
      await cliente.query(`CREATE SCHEMA ${ESQUEMA_MARCADOR}`);
      await cliente.query(
        `CREATE TABLE ${TABLA_MARCADOR} (
          valor      text PRIMARY KEY,
          base       text NOT NULL,
          sistema_id text NOT NULL,
          creado_en  timestamptz NOT NULL DEFAULT now()
        )`
      );
      await cliente.query(`INSERT INTO ${TABLA_MARCADOR} (valor, base, sistema_id) VALUES ($1, $2, $3)`, [
        VALOR_MARCADOR,
        obs.baseActual,
        obs.sistemaIdActual,
      ]);
      await cliente.query("COMMIT");
    } catch (error) {
      await cliente.query("ROLLBACK");
      throw error;
    }

    const final = evaluarIdentidad(await leerIdentidad(consultar), base);
    if (final.length > 0) throw new Error(`El marcador no quedó válido: ${final.join(" ")}`);
    console.log(`[${SCRIPT}] Marcador creado. Siguiente paso: npm run test:integracion:migrar`);
  } finally {
    await cliente.end();
  }
}

main().catch((error) => abortar(SCRIPT, error, process.env.TEST_DATABASE_URL));
