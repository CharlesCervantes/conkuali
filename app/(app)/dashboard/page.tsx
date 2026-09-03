import { requireSession } from "@/lib/server/auth/dal";
import { Card } from "@/components/ui/card";
import {
  obtenerResumenEjecutivo,
  type VistaDashboard,
  type PeriodoDashboard,
} from "@/lib/server/dashboard";
import { InicioView } from "@/components/dashboard/inicio-view";

function aVista(valor: string | string[] | undefined): VistaDashboard {
  return valor === "privado" ? "privado" : "general";
}
function aPeriodo(valor: string | string[] | undefined): PeriodoDashboard {
  return valor === "mes" ? "mes" : valor === "acumulado" ? "acumulado" : "semana";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; periodo?: string }>;
}) {
  const usuario = await requireSession();

  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada. Contacta a un administrador.
      </Card>
    );
  }

  const { vista: vistaParam, periodo: periodoParam } = await searchParams;
  const vista = aVista(vistaParam);
  const periodo = aPeriodo(periodoParam);

  const resumen = await obtenerResumenEjecutivo(usuario, vista, periodo);

  return <InicioView resumen={resumen} />;
}
