import { TabNav } from "@/components/control-de-obra/tab-nav";

export default function CatalogosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Catálogos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Identidad de personas y empresas con las que trabajamos — proveedores, contratistas y
          personal administrativo, independientemente de en qué obras participen.
        </p>
      </div>

      <TabNav
        tabs={[
          { href: "/catalogos/proveedores", label: "Proveedores" },
          { href: "/catalogos/contratistas", label: "Contratistas" },
          { href: "/catalogos/personal", label: "Personal / Administración" },
        ]}
      />

      {children}
    </div>
  );
}
