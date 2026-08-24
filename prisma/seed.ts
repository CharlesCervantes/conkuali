// Script de siembra inicial: crea la Empresa Conkuali, su Plan "Completo"
// (con todos los módulos documentados hasta ahora) y los usuarios base
// (Sergio/Director, Charles/Administrador, Andrés/Supervisor).
//
// Cada persona se crea solo si su variable de entorno SEED_EMAIL_* está
// definida (correo real, nunca inventado aquí) — se puede correr de forma
// incremental conforme se van teniendo los correos de cada quien.
// Ejecutar con: npm run db:seed

import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/crypto/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const MODULOS = [
  { clave: "reporte_general", nombre: "Reporte General" },
  { clave: "control_de_obra", nombre: "Control de Obra" },
  { clave: "control_prestamos", nombre: "Control de Préstamos" },
  { clave: "catalogos", nombre: "Catálogos" },
];

// Obras reales de Conkuali (mencionadas por Charles al describir el Reporte
// General) — no son datos de prueba inventados, son el punto de partida real
// del catálogo de obras hasta que exista la pantalla de Etapa 5 para
// administrarlas desde la interfaz.
const OBRAS = [
  "Mississippi",
  "Villas La Herradura",
  "Loma del Sur",
  "Jardines",
  "Vistancia Fraile",
  "Pollo Loco Vasconcelos",
];

function leerEmail(varEnv: string): string | undefined {
  const valor = process.env[varEnv];
  return valor ? valor.trim().toLowerCase() : undefined;
}

function generarPasswordTemporal(): string {
  return randomBytes(9).toString("base64url");
}

async function main() {
  const personas = [
    {
      nombre: "Sergio",
      email: leerEmail("SEED_EMAIL_SERGIO"),
      rol: "DIRECTOR" as const,
    },
    {
      nombre: "Charles",
      email: leerEmail("SEED_EMAIL_CHARLES"),
      rol: "ADMINISTRADOR" as const,
    },
    {
      nombre: "Andrés",
      email: leerEmail("SEED_EMAIL_ANDRES"),
      rol: "SUPERVISOR" as const,
    },
  ];

  const pendientes = personas.filter((p) => !p.email).map((p) => p.nombre);

  const plan = await db.plan.upsert({
    where: { nombre: "Completo" },
    update: {},
    create: { nombre: "Completo" },
  });

  // Reconcilia los módulos del plan también cuando el Plan ya existía —
  // el upsert de arriba, con `update: {}`, no agregaría un módulo nuevo
  // (como "catalogos") a un Plan "Completo" que ya está en base de datos.
  for (const m of MODULOS) {
    const modulo = await db.modulo.upsert({
      where: { clave: m.clave },
      update: {},
      create: m,
    });
    await db.planModulo.upsert({
      where: { planId_moduloId: { planId: plan.id, moduloId: modulo.id } },
      update: {},
      create: { planId: plan.id, moduloId: modulo.id },
    });
  }

  const empresa = await db.empresa.upsert({
    where: { id: "conkuali" },
    update: {},
    create: {
      id: "conkuali",
      nombre: "Grupo Conkuali",
      planId: plan.id,
    },
  });

  const obrasCreadas: string[] = [];
  for (const nombre of OBRAS) {
    const existente = await db.proyecto.findFirst({
      where: { empresaId: empresa.id, nombre },
    });
    if (existente) continue;

    await db.proyecto.create({
      data: { empresaId: empresa.id, nombre, tipo: "FORMAL" },
    });
    obrasCreadas.push(nombre);
  }

  const credencialesNuevas: { rol: string; email: string; password: string }[] =
    [];
  const yaExistian: string[] = [];

  for (const persona of personas) {
    if (!persona.email) continue;

    const existente = await db.usuario.findUnique({
      where: { email: persona.email },
    });

    if (existente) {
      yaExistian.push(persona.email);
      continue;
    }

    const passwordTemporal = generarPasswordTemporal();
    const passwordHash = await hashPassword(passwordTemporal);

    await db.usuario.create({
      data: {
        nombre: persona.nombre,
        email: persona.email,
        passwordHash,
        rol: persona.rol,
        empresaId: empresa.id,
      },
    });

    credencialesNuevas.push({
      rol: persona.rol,
      email: persona.email,
      password: passwordTemporal,
    });
  }

  if (credencialesNuevas.length > 0) {
    console.log(
      "\nUsuarios creados. Contraseñas temporales (cámbialas al primer login):\n"
    );
    for (const c of credencialesNuevas) {
      console.log(`  ${c.rol.padEnd(14)} ${c.email.padEnd(30)} ${c.password}`);
    }
  }
  if (yaExistian.length > 0) {
    console.log(`\nYa existían (sin cambios): ${yaExistian.join(", ")}`);
  }
  if (obrasCreadas.length > 0) {
    console.log(`\nObras creadas: ${obrasCreadas.join(", ")}`);
  }
  if (pendientes.length > 0) {
    console.log(
      `\nPendientes (sin correo aún, no se crearon): ${pendientes.join(", ")}`
    );
    console.log(
      "Cuando tengas su correo, define la variable SEED_EMAIL_<NOMBRE> en .env y vuelve a correr `npm run db:seed`."
    );
  }
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
