import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeAdministrarGastosRecurrentes } from "@/lib/server/permisos";
import { listarGastosRecurrentes } from "@/lib/server/control-de-obra/gastos-recurrentes";
import { listarProyectos } from "@/lib/server/control-de-obra/proyectos";
import { listarBeneficiariosParaGasto } from "@/lib/server/control-de-obra/gastos";
import { GastosRecurrentesView } from "@/components/control-de-obra/gastos-recurrentes-view";
import { Card } from "@/components/ui/card";
import Link from "next/link";

export default async function GastosRecurrentesPage() {
  const usuario = await requireSession();

  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada.
      </Card>
    );
  }

  if (!empresaTieneModulo(usuario, "gastos")) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu plan no incluye el módulo de Gastos.
      </Card>
    );
  }

  if (!puedeAdministrarGastosRecurrentes(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para administrar gastos recurrentes.
      </Card>
    );
  }

  const [recurrentes, proyectos, beneficiarios] = await Promise.all([
    listarGastosRecurrentes(usuario),
    listarProyectos(usuario),
    listarBeneficiariosParaGasto(usuario),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/gastos" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Gastos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">Gastos recurrentes</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Nómina, renta y otras obligaciones que se repiten cada semana, quincena o mes — la
          generación de cada ocurrencia es automática, nunca retroactiva a periodos ya generados.
        </p>
      </div>

      <GastosRecurrentesView
        recurrentes={recurrentes}
        proyectosDisponibles={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        beneficiarios={beneficiarios}
      />
    </div>
  );
}
