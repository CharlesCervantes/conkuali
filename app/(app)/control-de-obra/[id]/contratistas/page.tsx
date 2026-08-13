import { requireSession } from "@/lib/server/auth/dal";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import {
  obtenerContratistasProyecto,
  listarContratistasDisponibles,
} from "@/lib/server/control-de-obra/estructura-contractual";
import { obtenerAvanceAcumuladoPorConcepto } from "@/lib/server/control-de-obra/avance";
import { ContratistasView } from "@/components/control-de-obra/contratistas-view";

export default async function ContratistasPage({
  params,
}: PageProps<"/control-de-obra/[id]/contratistas">) {
  const usuario = await requireSession();
  const { id } = await params;
  const puedeAdministrar = puedeAdministrarProyectos(usuario);

  const [{ partidas, contratos }, contratistasDisponibles] = await Promise.all([
    obtenerContratistasProyecto(usuario, id),
    puedeAdministrar ? listarContratistasDisponibles(usuario) : Promise.resolve([]),
  ]);

  const todosLosConceptos = partidas.flatMap((p) => p.conceptos);
  const avancePorConcepto = await obtenerAvanceAcumuladoPorConcepto(
    usuario,
    id,
    todosLosConceptos
  );

  return (
    <ContratistasView
      proyectoId={id}
      partidas={partidas}
      contratos={contratos}
      contratistasDisponibles={contratistasDisponibles}
      avancePorConcepto={avancePorConcepto}
      puedeAdministrar={puedeAdministrar}
    />
  );
}
