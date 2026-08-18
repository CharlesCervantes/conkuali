import { TabNav } from "@/components/control-de-obra/tab-nav";

export default async function GastosLayout({
  children,
  params,
}: LayoutProps<"/control-de-obra/[id]/ejecucion/gastos">) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <TabNav
        variante="secundaria"
        tabs={[
          {
            href: `/control-de-obra/${id}/ejecucion/gastos/reposiciones`,
            label: "Reposiciones",
          },
          {
            href: `/control-de-obra/${id}/ejecucion/gastos/ordenes-compra`,
            label: "Órdenes de compra",
          },
        ]}
      />
      {children}
    </div>
  );
}
