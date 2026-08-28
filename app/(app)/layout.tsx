import type { ReactNode } from "react";
import { requireSession } from "@/lib/server/auth/dal";
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

  const modulos = (usuario.empresa?.plan?.modulos ?? []).map((pm) => ({
    clave: pm.modulo.clave,
    nombre: RUTA_MODULO[pm.modulo.clave]?.label ?? pm.modulo.nombre,
    href: RUTA_MODULO[pm.modulo.clave]?.href ?? null,
  }));

  return (
    <AppShell
      usuario={usuario}
      sidebar={
        <Sidebar
          variant="global"
          empresaNombre={usuario.empresa?.nombre ?? "Conkuali"}
          logoUrl={usuario.empresa?.logoUrl ?? null}
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
