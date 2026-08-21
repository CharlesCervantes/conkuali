import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeAdministrarCatalogos } from "@/lib/server/permisos";
import { listarProveedores } from "@/lib/server/catalogos";
import { ProveedoresView } from "@/components/catalogos/proveedores-view";
import { Card } from "@/components/ui/card";

export default async function ProveedoresPage() {
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

  const proveedores = await listarProveedores(usuario);

  return <ProveedoresView proveedores={proveedores} />;
}
