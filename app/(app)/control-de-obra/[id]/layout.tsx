import { notFound } from "next/navigation";
import { requireSession } from "@/lib/server/auth/dal";
import { puedeVerContratoGeneralPrivado } from "@/lib/server/permisos";
import {
  obtenerProyecto,
  ProyectoNoEncontradoError,
} from "@/lib/server/control-de-obra/proyectos";
import { EstatusProyectoBadge } from "@/components/control-de-obra/estatus-proyecto-badge";
import { TabNav } from "@/components/control-de-obra/tab-nav";
import { EnlaceProtegido } from "@/components/control-de-obra/enlace-protegido";
import { DirtyAvanceProvider } from "@/components/control-de-obra/dirty-avance-context";

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
    <DirtyAvanceProvider>
      <div className="space-y-6">
        <div>
          <EnlaceProtegido
            href="/control-de-obra"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← Control de Obra
          </EnlaceProtegido>
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
            { href: `/control-de-obra/${id}/partidas`, label: "Contrato General" },
            ...(puedeVerContratoGeneralPrivado(usuario)
              ? [{ href: `/control-de-obra/${id}/contrato-privado`, label: "Contrato General Priv." }]
              : []),
            { href: `/control-de-obra/${id}/contratistas`, label: "Contratistas" },
            { href: `/control-de-obra/${id}/avance`, label: "Avance de obra" },
          ]}
        />

        {children}
      </div>
    </DirtyAvanceProvider>
  );
}
