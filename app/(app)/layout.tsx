import type { ReactNode } from "react";
import { requireSession } from "@/lib/server/auth/dal";
import { RUTA_MODULO } from "@/lib/modulos";
import { NOMBRE_ROL } from "@/lib/roles";
import { Sidebar } from "./_components/sidebar";

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const usuario = await requireSession();

  const brand = usuario.empresa?.colorPrimario ?? "#4338ca";
  const brandForeground = "#ffffff";

  const modulos = (usuario.empresa?.plan?.modulos ?? []).map((pm) => ({
    clave: pm.modulo.clave,
    nombre: RUTA_MODULO[pm.modulo.clave]?.label ?? pm.modulo.nombre,
    href: RUTA_MODULO[pm.modulo.clave]?.href ?? null,
  }));

  return (
    <div
      className="flex min-h-screen"
      style={
        {
          "--brand": brand,
          "--brand-foreground": brandForeground,
        } as React.CSSProperties
      }
    >
      <Sidebar
        empresaNombre={usuario.empresa?.nombre ?? "Conkuali"}
        logoUrl={usuario.empresa?.logoUrl ?? null}
        usuarioNombre={usuario.nombre}
        rolLabel={NOMBRE_ROL[usuario.rol] ?? usuario.rol}
        modulos={modulos}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-10 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
