import "server-only";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function crearCliente() {
  // min:1 + idleTimeoutMillis alto evitan que `pg` cierre la conexión a los
  // 10s (su default) — reconectar a Neon cuesta 1-2.5s cada vez, lo que
  // hacía que cualquier clic con más de 10s de por medio se sintiera lento.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    min: 1,
    idleTimeoutMillis: 5 * 60 * 1000,
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
