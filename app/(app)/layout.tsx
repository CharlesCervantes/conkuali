import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/dal";
import { esMaster } from "@/lib/server/permisos";
import { RUTA_MODULO } from "@/lib/modulos";
import { NOMBRE_ROL } from "@/lib/roles";
import { AppShell } from "./_components/app-shell";
import { Sidebar } from "./_components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const usuario = await requireSession();

  if (usuario.debeCambiarPassword) redirect("/nueva-password");
  // Master administra tenants desde el Portal Master, nunca opera dentro del
  // portal de una Empresa (decisión de sesión, Portal Master).
  if (esMaster(usuario)) redirect("/master");

  const modulos = (usuario.empresa?.plan?.modulos ?? []).map((pm) => ({
    clave: pm.modulo.clave,
    nombre: RUTA_MODULO[pm.modulo.clave]?.label ?? pm.modulo.nombre,
    href: RUTA_MODULO[pm.modulo.clave]?.href ?? null,
  }));

  // El bucket de almacenamiento es privado — nunca se usa logoRef
  // directamente como <img src>, siempre a través del endpoint autenticado
  // (ver app/api/empresas/[id]/logo).
  const logoUrl = usuario.empresa?.logoRef
    ? `/api/empresas/${usuario.empresa.id}/logo`
    : null;

  return (
    <AppShell
      usuario={usuario}
      sidebar={
        <Sidebar
          variant="global"
          empresaNombre={usuario.empresa?.nombre ?? "Conkuali"}
          logoUrl={logoUrl}
          usuarioNombre={usuario.nombre}
          rolLabel={NOMBRE_ROL[usuario.rol] ?? usuario.rol}
          modulos={modulos}
        />
      }
    >
      {children}
    </AppShell>
  );
}
