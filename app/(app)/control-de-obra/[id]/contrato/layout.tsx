import { requireSession } from "@/lib/server/auth/dal";
import { puedeVerContratoGeneralPrivado } from "@/lib/server/permisos";
import { TabNav } from "@/components/control-de-obra/tab-nav";

export default async function ContratoLayout({
  children,
  params,
}: LayoutProps<"/control-de-obra/[id]/contrato">) {
  const usuario = await requireSession();
  const { id } = await params;

  return (
    <div className="space-y-4">
      <TabNav
        variante="secundaria"
        tabs={[
          { href: `/control-de-obra/${id}/contrato/general`, label: "Contrato General" },
          ...(puedeVerContratoGeneralPrivado(usuario)
            ? [
                {
                  href: `/control-de-obra/${id}/contrato/privado`,
                  label: "Contrato General Priv.",
                },
              ]
            : []),
        ]}
      />
      {children}
    </div>
  );
}
