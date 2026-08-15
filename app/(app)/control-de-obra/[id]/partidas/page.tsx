import { requireSession } from "@/lib/server/auth/dal";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import {
  obtenerPartidasProyecto,
} from "@/lib/server/control-de-obra/estructura-contractual";
import { obtenerProyecto } from "@/lib/server/control-de-obra/proyectos";
import { ContratoGeneralView } from "@/components/control-de-obra/contrato-general-view";

export default async function ContratoGeneralPage({
  params,
}: PageProps<"/control-de-obra/[id]/partidas">) {
  const usuario = await requireSession();
  const { id } = await params;

  const [proyecto, partidas] = await Promise.all([
    obtenerProyecto(usuario, id),
    obtenerPartidasProyecto(usuario, id),
  ]);

  return (
    <ContratoGeneralView
      proyectoId={id}
      partidas={partidas}
      esquemaContractual={proyecto.esquemaContractual}
      puedeAdministrar={puedeAdministrarProyectos(usuario)}
    />
  );
}
