import "server-only";
import { randomBytes } from "crypto";
import { db } from "@/lib/server/db";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { createSession, deleteSession } from "@/lib/server/session";

export class CredencialesInvalidasError extends Error {
  constructor() {
    super("Correo o contraseña incorrectos.");
    this.name = "CredencialesInvalidasError";
  }
}

export class UsuarioInactivoError extends Error {
  constructor() {
    super("Este usuario está desactivado.");
    this.name = "UsuarioInactivoError";
  }
}

export class EmpresaInactivaError extends Error {
  constructor() {
    super("El acceso de tu empresa se encuentra inactivo. Contacta al administrador de la plataforma.");
    this.name = "EmpresaInactivaError";
  }
}

export class PasswordActualIncorrectaError extends Error {
  constructor() {
    super("La contraseña actual no es correcta.");
    this.name = "PasswordActualIncorrectaError";
  }
}

// Hash válido (mismo formato que hashPassword) pero sin contraseña real detrás.
// Se usa para que verificar un correo inexistente tome el mismo tiempo que
// verificar uno que sí existe, y así no revelar por temporización qué correos
// están registrados.
const HASH_SENUELO = "a".repeat(32) + ":" + "b".repeat(128);

export async function autenticar(email: string, password: string) {
  const usuario = await db.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { empresa: { select: { activa: true } } },
  });

  const passwordValido = await verifyPassword(
    password,
    usuario?.passwordHash ?? HASH_SENUELO
  );

  if (!usuario || !passwordValido) {
    throw new CredencialesInvalidasError();
  }

  if (!usuario.activo) {
    throw new UsuarioInactivoError();
  }

  // MASTER no tiene empresa — no aplica este chequeo (mismo criterio que
  // cargarUsuarioPorToken en lib/server/session.ts).
  if (usuario.rol !== "MASTER" && !usuario.empresa?.activa) {
    throw new EmpresaInactivaError();
  }

  await createSession(usuario.id);

  return { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
}

export async function cerrarSesion() {
  await deleteSession();
}

// Cambio de contraseña de Mi perfil — reutiliza exactamente los mismos
// primitivos que autenticar()/crearUsuario (verifyPassword/hashPassword),
// nunca un sistema paralelo. Siempre exige la contraseña actual: es la
// misma verificación que ya hace el login, aplicada aquí como paso de
// confirmación antes de aceptar la nueva.
export async function cambiarPassword(
  usuarioId: string,
  passwordActual: string,
  passwordNueva: string
) {
  const usuario = await db.usuario.findUniqueOrThrow({ where: { id: usuarioId } });

  const passwordValida = await verifyPassword(passwordActual, usuario.passwordHash);
  if (!passwordValida) throw new PasswordActualIncorrectaError();

  const passwordHash = await hashPassword(passwordNueva);
  await db.usuario.update({ where: { id: usuarioId }, data: { passwordHash } });
}

export async function crearUsuario(datos: {
  nombre: string;
  email: string;
  password: string;
  rol: "MASTER" | "DIRECTOR" | "ADMINISTRADOR" | "SUPERVISOR";
  empresaId: string | null;
  // true cuando `password` es una contraseña temporal generada por el
  // sistema (alta desde Portal Master) — obliga al usuario a cambiarla antes
  // de poder navegar el resto de la app (ver app/nueva-password).
  debeCambiarPassword?: boolean;
}) {
  const passwordHash = await hashPassword(datos.password);

  return db.usuario.create({
    data: {
      nombre: datos.nombre,
      email: datos.email.trim().toLowerCase(),
      passwordHash,
      rol: datos.rol,
      empresaId: datos.empresaId,
      debeCambiarPassword: datos.debeCambiarPassword ?? false,
    },
  });
}

// Genera una contraseña temporal legible (evita caracteres ambiguos como
// 0/O/1/l) — se muestra UNA sola vez a quien la crea (Portal Master); solo
// su hash se persiste, nunca el texto plano (ver crearUsuario/regenerarPasswordTemporal).
const ALFABETO_PASSWORD_TEMPORAL = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generarPasswordTemporal(longitud = 12): string {
  const bytes = randomBytes(longitud);
  let resultado = "";
  for (let i = 0; i < longitud; i++) {
    resultado += ALFABETO_PASSWORD_TEMPORAL[bytes[i] % ALFABETO_PASSWORD_TEMPORAL.length];
  }
  return resultado;
}

// Usado cuando un usuario pierde su contraseña temporal — nunca se consulta
// la anterior (no existe forma de leerla, solo su hash), se genera y persiste
// una nueva que invalida a la anterior de inmediato.
export async function regenerarPasswordTemporal(usuarioId: string): Promise<string> {
  const passwordTemporal = generarPasswordTemporal();
  const passwordHash = await hashPassword(passwordTemporal);
  await db.usuario.update({
    where: { id: usuarioId },
    data: { passwordHash, debeCambiarPassword: true },
  });
  return passwordTemporal;
}
