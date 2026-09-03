import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/dal";
import { esMaster } from "@/lib/server/permisos";
import { NOMBRE_ROL } from "@/lib/roles";
import { AppShell } from "@/app/(app)/_components/app-shell";
import { Sidebar } from "@/app/(app)/_components/sidebar";

// Portal Master — área de administración de plataforma, separada del portal
// operativo de una Empresa (no reutiliza la navegación de Reporte
// General/Proyectos/Cliente, Master administra tenants, no opera una obra).
export default async function MasterLayout({ children }: { children: ReactNode }) {
  const usuario = await requireSession();

  if (usuario.debeCambiarPassword) redirect("/nueva-password");
  if (!esMaster(usuario)) redirect("/dashboard");

  return (
    <AppShell
      usuario={usuario}
      sidebar={
        <Sidebar
          variant="master"
          usuarioNombre={usuario.nombre}
          rolLabel={NOMBRE_ROL[usuario.rol] ?? usuario.rol}
        />
      }
    >
      {children}
    </AppShell>
  );
}
