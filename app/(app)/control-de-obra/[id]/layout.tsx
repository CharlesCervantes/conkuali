import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/server/auth/dal";
import {
  obtenerProyecto,
  ProyectoNoEncontradoError,
} from "@/lib/server/control-de-obra/proyectos";
import { EstatusProyectoBadge } from "@/components/control-de-obra/estatus-proyecto-badge";
import { TabNav } from "@/components/control-de-obra/tab-nav";

export default async function ProyectoLayout({
  children,
  params,
}: LayoutProps<"/control-de-obra/[id]">) {
  const usuario = await requireSession();
  const { id } = await params;

  let proyecto;
  try {
    proyecto = await obtenerProyecto(usuario, id);
  } catch (error) {
    if (error instanceof ProyectoNoEncontradoError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/control-de-obra"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Control de Obra
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">
            {proyecto.nombre}
          </h1>
          <EstatusProyectoBadge estatus={proyecto.estatus} />
        </div>
      </div>

      <TabNav
        tabs={[
          { href: `/control-de-obra/${id}`, label: "Resumen" },
          {
            href: `/control-de-obra/${id}/estructura`,
            label: "Estructura contractual",
          },
        ]}
      />

      {children}
    </div>
  );
}
