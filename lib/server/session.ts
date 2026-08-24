import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/server/db";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiraEn = new Date(Date.now() + SESSION_DURATION_MS);

  await db.sesion.create({
    data: {
      usuarioId,
      tokenHash: hashToken(token),
      expiraEn,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiraEn,
    path: "/",
  });
}

async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}

export async function deleteSession() {
  const token = await getSessionToken();
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  if (token) {
    await db.sesion.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
}

// Selecciona explícitamente los campos necesarios (nunca passwordHash) — es la
// forma en la que esta capa actúa como DTO hacia el resto de la aplicación.
async function cargarUsuarioPorToken(token: string) {
  const sesion = await db.sesion.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiraEn: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          empresaId: true,
          vistaPrivadaActiva: true,
          empresa: {
            select: {
              id: true,
              nombre: true,
              colorPrimario: true,
              colorSecundario: true,
              logoUrl: true,
              activa: true,
              plan: {
                select: {
                  id: true,
                  nombre: true,
                  modulos: {
                    select: { modulo: { select: { clave: true, nombre: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!sesion) return null;

  if (sesion.expiraEn < new Date()) {
    await db.sesion.delete({ where: { id: sesion.id } }).catch(() => {});
    return null;
  }

  if (!sesion.usuario.activo) return null;

  return sesion.usuario;
}

export async function getUsuarioActual() {
  const token = await getSessionToken();
  if (!token) return null;
  return cargarUsuarioPorToken(token);
}

export type UsuarioSesion = NonNullable<
  Awaited<ReturnType<typeof getUsuarioActual>>
>;
