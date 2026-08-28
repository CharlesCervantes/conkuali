import { TabNav } from "@/components/control-de-obra/tab-nav";

// Selector local — igual que cliente/privado/layout.tsx. Control contractual
// ya no es exclusivo de la capa privada: toda obra se cobra por Estimación,
// con o sin capa privada (rediseño Cliente/Cliente Priv., agosto 2026).
export default async function ClienteGeneralLayout({
  children,
  params,
}: LayoutProps<"/control-de-obra/[id]/cliente/general">) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <TabNav
        variante="secundaria"
        tabs={[
          { href: `/control-de-obra/${id}/cliente/general/estimacion`, label: "Estimación semanal" },
          {
            href: `/control-de-obra/${id}/cliente/general/control-contractual`,
            label: "Control contractual",
          },
        ]}
      />
      {children}
    </div>
  );
}
