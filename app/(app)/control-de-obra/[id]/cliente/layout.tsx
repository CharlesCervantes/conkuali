import { requireSession } from "@/lib/server/auth/dal";
import { puedeVerContratoGeneralPrivado } from "@/lib/server/permisos";
import { TabNav } from "@/components/control-de-obra/tab-nav";

export default async function ClienteLayout({
  children,
  params,
}: LayoutProps<"/control-de-obra/[id]/cliente">) {
  const usuario = await requireSession();
  const { id } = await params;

  return (
    <div className="space-y-4">
      <TabNav
        variante="secundaria"
        tabs={[
          { href: `/control-de-obra/${id}/cliente/general`, label: "Cliente" },
          ...(puedeVerContratoGeneralPrivado(usuario)
            ? [
                {
                  href: `/control-de-obra/${id}/cliente/privado`,
                  label: "Cliente Priv.",
                  coincideSubrutas: true,
                },
              ]
            : []),
        ]}
      />
      {children}
    </div>
  );
}
