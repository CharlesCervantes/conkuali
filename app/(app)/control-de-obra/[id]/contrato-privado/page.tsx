import { requireSession } from "@/lib/server/auth/dal";
import { puedeVerContratoGeneralPrivado } from "@/lib/server/permisos";
import { obtenerPartidasProyectoPrivado } from "@/lib/server/control-de-obra/estructura-contractual";
import { obtenerProyecto } from "@/lib/server/control-de-obra/proyectos";
import { Card } from "@/components/ui/card";
import { ContratoGeneralPrivadoView } from "@/components/control-de-obra/contrato-general-privado-view";

export default async function ContratoGeneralPrivadoPage({
  params,
}: PageProps<"/control-de-obra/[id]/contrato-privado">) {
  const usuario = await requireSession();

  // Igual que editar/page.tsx: el permiso se valida aquí, del lado servidor,
  // antes de siquiera consultar los datos privados — no basta con ocultar la
  // pestaña. Un Supervisor que conozca la URL no debe poder entrar (sección 5
  // del rediseño, agosto 2026).
  if (!puedeVerContratoGeneralPrivado(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para ver el Contrato General Privado.
      </Card>
    );
  }

  const { id } = await params;

  const [proyecto, partidas] = await Promise.all([
    obtenerProyecto(usuario, id),
    obtenerPartidasProyectoPrivado(usuario, id),
  ]);

  return (
    <ContratoGeneralPrivadoView
      proyectoId={id}
      partidas={partidas}
      esquemaContractual={proyecto.esquemaContractual}
      porcentajesDefault={{
        utilidad: proyecto.porcentajeUtilidadDefault
          ? Number(proyecto.porcentajeUtilidadDefault)
          : null,
        administracion: proyecto.porcentajeAdministracionDefault
          ? Number(proyecto.porcentajeAdministracionDefault)
          : null,
      }}
    />
  );
}
