import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo } from "@/lib/server/permisos";
import { obtenerOCrearSemanaActual, formatearRangoSemana } from "@/lib/server/reporte-general/semanas";
import { obtenerReporteSemana } from "@/lib/server/reporte-general/queries";
import { ResumenSemana } from "@/components/reporte-general/resumen-semana";
import { ObraCard } from "@/components/reporte-general/obra-card";
import { Card } from "@/components/ui/card";

export default async function ReporteGeneralPage() {
  const usuario = await requireSession();

  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada.
      </Card>
    );
  }

  if (!empresaTieneModulo(usuario, "reporte_general")) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu plan no incluye el módulo de Reporte General.
      </Card>
    );
  }

  const semana = await obtenerOCrearSemanaActual(usuario.empresa.id);
  const obras = await obtenerReporteSemana(usuario.empresa.id, semana.id);

  const totalEntreSemana = obras.reduce((t, o) => t + o.totalEntreSemana, 0);
  const totalFinSemana = obras.reduce((t, o) => t + o.totalFinSemana, 0);
  const obrasConMovimientos = obras.filter((o) => o.totalSemana > 0).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Reporte General
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Control y planeación semanal de pagos · {formatearRangoSemana(semana)}
        </p>
      </div>

      <ResumenSemana
        totalEntreSemana={totalEntreSemana}
        totalFinSemana={totalFinSemana}
        obrasConMovimientos={obrasConMovimientos}
      />

      {obras.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay obras registradas para {usuario.empresa.nombre}.
        </Card>
      ) : (
        <div className="space-y-3">
          {obras.map((obra, i) => (
            <ObraCard key={obra.proyecto.id} obra={obra} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
