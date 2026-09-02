import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeAdministrarCatalogos, puedeEliminarCatalogo } from "@/lib/server/permisos";
import { listarContratistasCatalogo, listarBeneficiariosParaVincular } from "@/lib/server/catalogos";
import { ContratistasCatalogoView } from "@/components/catalogos/contratistas-view";
import { Card } from "@/components/ui/card";

export default async function ContratistasCatalogoPage() {
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

  const [contratistas, beneficiariosParaVincular] = await Promise.all([
    listarContratistasCatalogo(usuario),
    listarBeneficiariosParaVincular(usuario),
  ]);

  return (
    <ContratistasCatalogoView
      contratistas={contratistas}
      beneficiariosParaVincular={beneficiariosParaVincular}
      puedeEliminar={puedeEliminarCatalogo(usuario)}
    />
  );
}
