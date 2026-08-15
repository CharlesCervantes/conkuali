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

  const [{ partidas, contratos }, contratistasDisponibles, avancePorConcepto] =
    await Promise.all([
      obtenerContratistasProyecto(usuario, id),
      puedeAdministrar ? listarContratistasDisponibles(usuario) : Promise.resolve([]),
      obtenerAvanceAcumuladoPorConcepto(usuario, id),
    ]);

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
