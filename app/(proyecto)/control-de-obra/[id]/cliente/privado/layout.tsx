import { TabNav } from "@/components/control-de-obra/tab-nav";

// Tercer nivel de navegación anidado dentro de Cliente Priv. — Control
// Contractual es un rollup de todo el proyecto (no navega por semana como
// Estimación semanal), por eso vive aquí como subpestaña propia y no como
// hermano de Cliente/Cliente Priv. al mismo nivel (sección 7 del diseño de
// Control Contractual, agosto 2026). El gate de permiso vive en cada página,
// no aquí — mismo patrón ya usado en el resto de Control de Obra.
export default async function ClientePrivadoLayout({
  children,
  params,
}: LayoutProps<"/control-de-obra/[id]/cliente/privado">) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <TabNav
        variante="secundaria"
        tabs={[
          {
            href: `/control-de-obra/${id}/cliente/privado/estimacion`,
            label: "Estimación semanal",
          },
          {
            href: `/control-de-obra/${id}/cliente/privado/control-contractual`,
            label: "Control contractual",
          },
        ]}
      />
      {children}
    </div>
  );
}
