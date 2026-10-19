// Vacía los datos ficticios de la base de pruebas de integración (todas las
// tablas del esquema public excepto _prisma_migrations; el marcador vive en
// otro esquema y se conserva). Solo después de verificar la URL y la
// identidad de la base. Uso: npm run test:integracion:limpiar
import { abortar, conectar, consultarCon, validarOAbortar } from "./comun";
import { baseDeUrl, limpiarDatosDePrueba } from "../../tests/helpers/identidad-base-pruebas";

const SCRIPT = "limpiar-base-pruebas";

async function main() {
  const { url } = validarOAbortar(SCRIPT);
  const cliente = await conectar(url);
  try {
    const tablas = await limpiarDatosDePrueba(consultarCon(cliente), (sql) => cliente.query(sql), baseDeUrl(url));
    console.log(`[${SCRIPT}] Tablas vaciadas en la base de pruebas: ${tablas}.`);
  } finally {
    await cliente.end();
  }
}

main().catch((error) => abortar(SCRIPT, error, process.env.TEST_DATABASE_URL));
