import { requireSession } from "@/lib/server/auth/dal";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import {
  obtenerEstructuraContractual,
  listarContratistasDisponibles,
} from "@/lib/server/control-de-obra/estructura-contractual";
import { EstructuraContractualView } from "@/components/control-de-obra/estructura-contractual-view";

export default async function EstructuraContractualPage({
  params,
}: PageProps<"/control-de-obra/[id]/estructura">) {
  const usuario = await requireSession();
  const { id } = await params;
  const puedeAdministrar = puedeAdministrarProyectos(usuario);

  const [estructura, contratistas] = await Promise.all([
    obtenerEstructuraContractual(usuario, id),
    puedeAdministrar ? listarContratistasDisponibles(usuario) : Promise.resolve([]),
  ]);

  return (
    <EstructuraContractualView
      proyectoId={id}
      partidas={estructura.partidas}
      contratos={estructura.contratos}
      contratistas={contratistas}
      puedeAdministrar={puedeAdministrar}
    />
  );
}
