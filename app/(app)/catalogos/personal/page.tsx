import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeAdministrarCatalogos, puedeEliminarCatalogo } from "@/lib/server/permisos";
import {
  listarPersonalAdministrativo,
  listarUsuariosActivos,
  listarBeneficiariosParaVincular,
} from "@/lib/server/catalogos";
import { PersonalView } from "@/components/catalogos/personal-view";
import { Card } from "@/components/ui/card";

export default async function PersonalPage() {
  const usuario = await requireSession();

  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada.
      </Card>
    );
  }

  if (!empresaTieneModulo(usuario, "catalogos")) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu plan no incluye el módulo de Catálogos.
      </Card>
    );
  }

  if (!puedeAdministrarCatalogos(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para ver Catálogos.
      </Card>
    );
  }

  const [personal, usuariosActivos, beneficiariosParaVincular] = await Promise.all([
    listarPersonalAdministrativo(usuario),
    listarUsuariosActivos(usuario),
    listarBeneficiariosParaVincular(usuario),
  ]);

  return (
    <PersonalView
      personal={personal}
      usuariosActivos={usuariosActivos}
      beneficiariosParaVincular={beneficiariosParaVincular}
      puedeEliminar={puedeEliminarCatalogo(usuario)}
    />
  );
}
