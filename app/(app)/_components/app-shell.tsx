import type { ReactNode, CSSProperties } from "react";

// Shell compartido por el layout global y el layout de proyecto — ambos son
// raíces de layout hermanas (route groups distintos) y por eso cada una debe
// armar su propio flex/marca en vez de heredarlo de un layout común; este
// componente evita duplicar ese markup dos veces (rediseño de navegación,
// agosto 2026).
export function AppShell({
  usuario,
  sidebar,
  children,
}: {
  usuario: { empresa: { colorPrimario: string | null } | null };
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const brand = usuario.empresa?.colorPrimario ?? "#4338ca";
  const brandForeground = "#ffffff";

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={
        {
          "--brand": brand,
          "--brand-foreground": brandForeground,
        } as CSSProperties
      }
    >
      {sidebar}
      <main className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1680px] px-6 py-8 lg:px-10 xl:px-12">
          {children}
        </div>
      </main>
    </div>
  );
}
