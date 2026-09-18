import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeVerContabilidad } from "@/lib/server/permisos";
import { listarMediosFinancieros } from "@/lib/server/contabilidad/medios-financieros";
import { NavContabilidad } from "@/components/contabilidad/nav-contabilidad";
import { MediosFinancierosView } from "@/components/contabilidad/medios-financieros-view";
import { Card } from "@/components/ui/card";

export default async function CuentasContabilidadPage() {
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

  const medios = await listarMediosFinancieros(usuario);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Contabilidad</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Cuentas / medios financieros</p>
      </div>

      <NavContabilidad />

      <MediosFinancierosView medios={medios} />
    </div>
  );
}
