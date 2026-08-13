import { requireSession } from "@/lib/server/auth/dal";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import { Card } from "@/components/ui/card";
import { ProyectoForm } from "@/components/control-de-obra/proyecto-form";
import { crearProyectoAction } from "../actions";

export default async function NuevoProyectoPage() {
  const usuario = await requireSession();

  if (!puedeAdministrarProyectos(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para crear proyectos.
      </Card>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Nuevo proyecto
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Control de Obra</p>
      </div>

      <Card className="enter p-6">
        <ProyectoForm action={crearProyectoAction} textoBoton="Crear proyecto" />
      </Card>
    </div>
  );
}
