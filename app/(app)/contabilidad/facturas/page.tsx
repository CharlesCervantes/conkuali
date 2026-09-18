import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeVerContabilidad } from "@/lib/server/permisos";
import { obtenerFacturasPendientes } from "@/lib/server/contabilidad/facturas-pendientes";
import { listarFacturas } from "@/lib/server/contabilidad/facturas";
import { NavContabilidad } from "@/components/contabilidad/nav-contabilidad";
import { FacturasPendientesView } from "@/components/contabilidad/facturas-pendientes-view";
import { Card } from "@/components/ui/card";

export default async function FacturasContabilidadPage() {
  const usuario = await requireSession();

  if (!usuario.empresa) {
    return <Card className="p-6 text-sm text-[var(--muted)]">Tu cuenta no tiene una empresa asignada.</Card>;
  }
  if (!empresaTieneModulo(usuario, "contabilidad")) {
    return <Card className="p-6 text-sm text-[var(--muted)]">Tu plan no incluye el módulo de Contabilidad.</Card>;
  }
  if (!puedeVerContabilidad(usuario)) {
    return <Card className="p-6 text-sm text-[var(--muted)]">No tienes permiso para ver Contabilidad.</Card>;
  }

  const [pendientes, facturas] = await Promise.all([
    obtenerFacturasPendientes(usuario),
    listarFacturas(usuario),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Contabilidad</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Facturas pendientes y CFDI cargados</p>
      </div>

      <NavContabilidad />

      <FacturasPendientesView pendientes={pendientes} facturas={facturas} />
    </div>
  );
}
