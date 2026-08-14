import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo } from "@/lib/server/permisos";
import {
  obtenerOCrearSemana,
  formatearRangoSemana,
  fechaAParametro,
  parametroAFecha,
} from "@/lib/server/semanas";
import { obtenerReporteSemana } from "@/lib/server/reporte-general/queries";
import {
  obraTieneEstado,
  obraCoincideBusqueda,
} from "@/lib/reporte-general/estado";
import { ResumenSemana } from "@/components/reporte-general/resumen-semana";
import { NavegacionSemana } from "@/components/reporte-general/navegacion-semana";
import { FiltrosProyectos } from "@/components/reporte-general/filtros-proyectos";
import { TablaProyectosHeader } from "@/components/reporte-general/tabla-proyectos-header";
import { ObraCard } from "@/components/reporte-general/obra-card";
import { Card } from "@/components/ui/card";
import type { EstatusPago } from "@/lib/generated/prisma/enums";

const ESTADO_A_ESTATUS: Record<string, EstatusPago> = {
  pendientes: "PENDIENTE_PAGO",
  puente: "PAGADO_PUENTE",
  liquidados: "LIQUIDADO",
};

export default async function ReporteGeneralPage(
  props: PageProps<"/reporte-general">
) {
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

  const searchParams = await props.searchParams;
  const fechaParam =
    typeof searchParams.fecha === "string" ? searchParams.fecha : undefined;
  const estadoParam =
    typeof searchParams.estado === "string" ? searchParams.estado : "todos";
  const qParam = typeof searchParams.q === "string" ? searchParams.q : "";

  const semana = await obtenerOCrearSemana(
    usuario.empresa.id,
    parametroAFecha(fechaParam)
  );
  const todasLasObras = await obtenerReporteSemana(usuario.empresa.id, semana.id);

  const totalEntreSemana = todasLasObras.reduce((t, o) => t + o.totalEntreSemana, 0);
  const totalFinSemana = todasLasObras.reduce((t, o) => t + o.totalFinSemana, 0);
  const pendienteDePago = todasLasObras.reduce((t, o) => t + o.pendienteSemana, 0);

  const estatusFiltro = ESTADO_A_ESTATUS[estadoParam];
  const obrasFiltradas = todasLasObras.filter((obra) => {
    if (qParam && !obraCoincideBusqueda(obra, qParam)) return false;
    if (estatusFiltro && !obraTieneEstado(obra, estatusFiltro)) return false;
    return true;
  });

  const conMovimientos = obrasFiltradas.filter((o) => o.totalSemana > 0);
  // Los filtros de estatus solo tienen sentido sobre movimientos existentes.
  const sinMovimientos = estatusFiltro
    ? []
    : obrasFiltradas.filter((o) => o.totalSemana === 0);

  const fechaAnterior = new Date(semana.fechaInicio);
  fechaAnterior.setDate(fechaAnterior.getDate() - 7);
  const fechaSiguiente = new Date(semana.fechaInicio);
  fechaSiguiente.setDate(fechaSiguiente.getDate() + 7);

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
        pendienteDePago={pendienteDePago}
      />

      <div className="space-y-3">
        <NavegacionSemana
          etiquetaSemana={`Semana ${semana.numero}`}
          fechaAnteriorParametro={fechaAParametro(fechaAnterior)}
          fechaSiguienteParametro={fechaAParametro(fechaSiguiente)}
          estado={estadoParam}
          q={qParam}
        />
        <FiltrosProyectos estadoActivo={estadoParam} fecha={fechaParam} q={qParam} />
      </div>

      {todasLasObras.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Todavía no hay obras registradas para {usuario.empresa.nombre}.
        </Card>
      ) : obrasFiltradas.length === 0 ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Ningún proyecto coincide con el filtro o la búsqueda actual.
        </Card>
      ) : (
        <div className="space-y-6">
          {conMovimientos.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Con movimientos esta semana
              </h2>
              <TablaProyectosHeader />
              <div className="space-y-2">
                {conMovimientos.map((obra, i) => (
                  <ObraCard key={obra.proyecto.id} obra={obra} index={i} />
                ))}
              </div>
            </section>
          )}

          {sinMovimientos.length > 0 && (
            <details>
              <summary className="group flex cursor-pointer list-none items-center gap-1.5 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] select-none [&::-webkit-details-marker]:hidden">
                <svg
                  viewBox="0 0 20 20"
                  className="h-3 w-3 shrink-0 transition-transform duration-200 ease-out group-open:rotate-90"
                  fill="currentColor"
                >
                  <path d="M7 4l6 6-6 6V4z" />
                </svg>
                Sin movimientos · {sinMovimientos.length} proyecto
                {sinMovimientos.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 space-y-2">
                <TablaProyectosHeader />
                {sinMovimientos.map((obra, i) => (
                  <ObraCard key={obra.proyecto.id} obra={obra} index={i} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
