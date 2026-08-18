import { TabNav } from "@/components/control-de-obra/tab-nav";

export default async function EjecucionLayout({
  children,
  params,
}: LayoutProps<"/control-de-obra/[id]/ejecucion">) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <TabNav
        variante="secundaria"
        tabs={[
          { href: `/control-de-obra/${id}/ejecucion/avance`, label: "Avance de obra" },
          { href: `/control-de-obra/${id}/ejecucion/contratistas`, label: "Contratistas" },
        ]}
      />
      {children}
    </div>
  );
}
