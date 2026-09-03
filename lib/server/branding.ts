import "server-only";
import { db } from "@/lib/server/db";
import { esMaster } from "@/lib/server/permisos";
import type { UsuarioSesion } from "@/lib/server/session";
import { SinPermisoError } from "@/lib/server/control-de-obra/proyectos";

// Fuente central única de identidad de Empresa — sidebar, PDFs y cualquier
// otra superficie que necesite branding pasan siempre por este tipo, nunca
// resuelven logo/nombre por su cuenta (Portal Master / branding, plan de
// sesión). No es una fuente "en vivo obligatoria": quien necesita congelar
// esta identidad en un documento histórico guarda el resultado de
// obtenerBrandingEmpresa() como snapshot en su propia fila (ver
// ReciboPago.configuracionSnapshot / EstimacionClienteCapa.brandingSnapshot).
// `logoRef` es una referencia de almacenamiento (lib/server/archivos.ts),
// nunca una URL usable directamente — el bucket es privado. Para mostrarla
// (sidebar) o renderizarla (PDF) siempre pasa por obtenerUrlTemporal/
// obtenerArchivo, nunca se usa tal cual en un <img src>/<Image src>.
export type BrandingEmpresa = {
  nombre: string;
  razonSocial: string | null;
  logoRef: string | null;
  colorPrimario: string;
  colorSecundario: string;
};

// Shape puro, sin query — para cuando ya se tiene la Empresa en mano (ej. la
// sesión, que ya la carga completa) y no vale la pena una segunda consulta.
export function brandingDesdeEmpresa(empresa: {
  nombre: string;
  razonSocial: string | null;
  logoRef: string | null;
  colorPrimario: string;
  colorSecundario: string;
}): BrandingEmpresa {
  return {
    nombre: empresa.nombre,
    razonSocial: empresa.razonSocial,
    logoRef: empresa.logoRef,
    colorPrimario: empresa.colorPrimario,
    colorSecundario: empresa.colorSecundario,
  };
}

// Query directa — para el momento de EMITIR un documento (dentro de una
// transacción que no necesariamente tiene la sesión del usuario a la mano) o
// para previsualizar branding en el Portal Master.
export async function obtenerBrandingEmpresa(empresaId: string): Promise<BrandingEmpresa> {
  const empresa = await db.empresa.findUniqueOrThrow({
    where: { id: empresaId },
    select: {
      nombre: true,
      razonSocial: true,
      logoRef: true,
      colorPrimario: true,
      colorSecundario: true,
    },
  });
  return brandingDesdeEmpresa(empresa);
}

// Referencia del logo de UNA Empresa, para el endpoint de descarga
// autenticada del sidebar/Portal Master (nunca se expone la Empresa
// completa por esto). Acceso: cualquier usuario de esa misma Empresa (ve su
// propio logo en su sidebar), o Master (administra el branding de
// cualquier tenant desde el Portal Master).
export async function obtenerRefLogoEmpresa(
  usuario: UsuarioSesion,
  empresaId: string
): Promise<string | null> {
  if (!esMaster(usuario) && usuario.empresa?.id !== empresaId) {
    throw new SinPermisoError();
  }
  const empresa = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { logoRef: true },
  });
  return empresa?.logoRef ?? null;
}
