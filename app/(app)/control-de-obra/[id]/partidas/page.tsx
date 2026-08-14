import { requireSession } from "@/lib/server/auth/dal";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import { obtenerPartidasProyecto } from "@/lib/server/control-de-obra/estructura-contractual";
import { PartidasObraView } from "@/components/control-de-obra/partidas-obra-view";

export default async function PartidasObraPage({
  params,
}: PageProps<"/control-de-obra/[id]/partidas">) {
  const usuario = await requireSession();
  const { id } = await params;

  const partidas = await obtenerPartidasProyecto(usuario, id);

  return (
    <PartidasObraView
      proyectoId={id}
      partidas={partidas}
      puedeAdministrar={puedeAdministrarProyectos(usuario)}
    />
  );
}
