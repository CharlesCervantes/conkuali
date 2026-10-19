// ---------------------------------------------------------------------------
// Verificación de IDENTIDAD de la base de pruebas, ya conectada y ANTES de
// cualquier escritura (octubre 2026). Complementa base-de-pruebas.ts (que
// valida la URL sin conectarse).
//
// La base de pruebas se reconoce por un marcador exclusivo de ARQENTO:
// la tabla arqento_pruebas.marcador, con un valor fijo, el nombre de la base
// y el identificador único del servidor PostgreSQL (system_identifier). Así,
// un marcador copiado a otra base u otro servidor no sirve.
//
// - leerIdentidad(): solo consultas de lectura.
// - evaluarIdentidad() / evaluarBaseVaciaParaMarcar(): reglas puras (se
//   prueban sin base de datos).
// - El marcador solo se crea sobre una base completamente vacía (ver
//   scripts/pruebas/preparar-base-pruebas.ts).
// ---------------------------------------------------------------------------

export const ESQUEMA_MARCADOR = "arqento_pruebas";
export const TABLA_MARCADOR = `${ESQUEMA_MARCADOR}.marcador`;
export const VALOR_MARCADOR = "ARQENTO-BASE-EXCLUSIVA-PRUEBAS-INTEGRACION";

export class IdentidadBaseNoValida extends Error {}

// Ejecuta una consulta y devuelve sus filas — se adapta tanto a un cliente
// `pg` como a Prisma ($queryRawUnsafe).
export type Consultar = (sql: string, parametros?: unknown[]) => Promise<Record<string, unknown>[]>;

export type IdentidadObservada = {
  baseActual: string;
  // inet_server_addr(): dirección por la que el servidor recibió la conexión
  // (null = socket local). Con Docker es la IP interna del contenedor.
  direccionServidor: string | null;
  version: string;
  esNeon: boolean;
  sistemaIdActual: string | null;
  marcador: { valor: string; base: string; sistemaId: string } | null;
  objetosDeUsuario: number;
  esquemasDeUsuario: number;
};

const SQL_IDENTIDAD = `SELECT current_database() AS base, inet_server_addr()::text AS direccion, version() AS version`;
const SQL_NEON = `SELECT
  (SELECT count(*) FROM pg_settings WHERE name LIKE 'neon.%')::int
  + (SELECT count(*) FROM pg_extension WHERE extname = 'neon')::int AS n`;
const SQL_SISTEMA = `SELECT system_identifier::text AS id FROM pg_control_system()`;
const SQL_EXISTE_MARCADOR = `SELECT to_regclass('${TABLA_MARCADOR}') IS NOT NULL AS existe`;
const SQL_MARCADOR = `SELECT valor, base, sistema_id FROM ${TABLA_MARCADOR}`;
const SQL_OBJETOS = `SELECT count(*)::int AS n
  FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    AND s.nspname NOT IN ('pg_catalog', 'information_schema')
    AND s.nspname NOT LIKE 'pg_toast%' AND s.nspname NOT LIKE 'pg_temp%'`;
const SQL_ESQUEMAS = `SELECT count(*)::int AS n FROM pg_namespace
  WHERE nspname NOT IN ('public', 'pg_catalog', 'information_schema') AND nspname NOT LIKE 'pg\\_%'`;

export async function leerIdentidad(consultar: Consultar): Promise<IdentidadObservada> {
  const [identidad] = await consultar(SQL_IDENTIDAD);
  const [neon] = await consultar(SQL_NEON);
  let sistemaIdActual: string | null = null;
  try {
    const [sistema] = await consultar(SQL_SISTEMA);
    sistemaIdActual = sistema?.id ? String(sistema.id) : null;
  } catch {
    sistemaIdActual = null;
  }
  const [existe] = await consultar(SQL_EXISTE_MARCADOR);
  let marcador: IdentidadObservada["marcador"] = null;
  if (existe?.existe === true) {
    const filas = await consultar(SQL_MARCADOR);
    // Más de una fila también es un marcador inválido.
    marcador =
      filas.length === 1
        ? { valor: String(filas[0].valor), base: String(filas[0].base), sistemaId: String(filas[0].sistema_id) }
        : { valor: "(marcador con varias filas)", base: "", sistemaId: "" };
  }
  const [objetos] = await consultar(SQL_OBJETOS);
  const [esquemas] = await consultar(SQL_ESQUEMAS);
  return {
    baseActual: String(identidad.base),
    direccionServidor: identidad.direccion ? String(identidad.direccion) : null,
    version: String(identidad.version),
    esNeon: Number(neon?.n ?? 0) > 0 || /neon/i.test(String(identidad.version)),
    sistemaIdActual,
    marcador,
    objetosDeUsuario: Number(objetos?.n ?? 0),
    esquemasDeUsuario: Number(esquemas?.n ?? 0),
  };
}

// Dirección local o de red privada (Docker publica el puerto en 127.0.0.1 y
// el servidor ve la IP interna del contenedor). null = socket local.
export function esDireccionLocalOPrivada(direccion: string | null): boolean {
  if (direccion === null) return true;
  const ip = direccion.replace(/\/\d+$/, "");
  if (ip === "::1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true; // IPv6 privada (ULA)
  return false;
}

function erroresDeServidor(obs: IdentidadObservada, baseEsperada: string): string[] {
  const errores: string[] = [];
  if (obs.baseActual !== baseEsperada) errores.push("La base conectada no es la indicada en TEST_DATABASE_URL.");
  if (!obs.baseActual.endsWith("_test")) errores.push('La base conectada no termina en "_test".');
  if (obs.esNeon) errores.push("El servidor conectado es Neon: solo se permite PostgreSQL local.");
  if (!esDireccionLocalOPrivada(obs.direccionServidor)) errores.push("El servidor conectado no es local.");
  if (!obs.sistemaIdActual) errores.push("No se pudo leer el identificador del servidor PostgreSQL (pg_control_system).");
  return errores;
}

// Reglas para usar la base (pruebas, migraciones, limpieza): servidor local
// verificado + marcador exclusivo válido para ESTA base y ESTE servidor.
export function evaluarIdentidad(obs: IdentidadObservada, baseEsperada: string): string[] {
  const errores = erroresDeServidor(obs, baseEsperada);
  if (!obs.marcador) {
    errores.push("La base no tiene el marcador exclusivo de pruebas de ARQENTO (ejecuta primero la preparación).");
  } else {
    if (obs.marcador.valor !== VALOR_MARCADOR) errores.push("El marcador de pruebas no es válido.");
    if (obs.marcador.base !== obs.baseActual) errores.push("El marcador de pruebas pertenece a otra base.");
    if (obs.sistemaIdActual && obs.marcador.sistemaId !== obs.sistemaIdActual) {
      errores.push("El marcador de pruebas pertenece a otro servidor PostgreSQL.");
    }
  }
  return errores;
}

// Reglas para CREAR el marcador: servidor local verificado y base
// completamente vacía (sin tablas, vistas, secuencias ni esquemas propios).
export function evaluarBaseVaciaParaMarcar(obs: IdentidadObservada, baseEsperada: string): string[] {
  const errores = erroresDeServidor(obs, baseEsperada);
  if (obs.marcador) errores.push("La base ya tiene un marcador de pruebas.");
  if (obs.objetosDeUsuario > 0 || obs.esquemasDeUsuario > 0) {
    errores.push("La base no está vacía: el marcador solo se crea sobre una base nueva y vacía.");
  }
  return errores;
}

export async function verificarIdentidadOAbortar(consultar: Consultar, baseEsperada: string): Promise<IdentidadObservada> {
  const obs = await leerIdentidad(consultar);
  const errores = evaluarIdentidad(obs, baseEsperada);
  if (errores.length > 0) throw new IdentidadBaseNoValida(errores.join(" "));
  return obs;
}

export function baseDeUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

// Vacía TODAS las tablas de datos de la base de pruebas (esquema public),
// conservando el historial de migraciones y el marcador. Antes verifica la
// identidad: sobre cualquier otra base no se ejecuta nada.
export async function limpiarDatosDePrueba(consultar: Consultar, ejecutar: (sql: string) => Promise<unknown>, baseEsperada: string) {
  await verificarIdentidadOAbortar(consultar, baseEsperada);
  const filas = await consultar(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
  );
  const tablas = filas.map((f) => String(f.tablename));
  if (tablas.some((t) => !/^[A-Za-z0-9_]+$/.test(t))) throw new IdentidadBaseNoValida("Nombre de tabla inesperado; limpieza cancelada.");
  if (tablas.length === 0) return 0;
  await ejecutar(`TRUNCATE TABLE ${tablas.map((t) => `"public"."${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
  return tablas.length;
}
