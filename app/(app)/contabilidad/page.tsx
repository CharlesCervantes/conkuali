import { Suspense } from "react";
import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeVerContabilidad } from "@/lib/server/permisos";
import { obtenerEstadoResultadosComparado } from "@/lib/server/contabilidad/estado-resultados";
import { resolverRango, type TipoRango } from "@/lib/contabilidad/periodo";
import { listarProyectos } from "@/lib/server/control-de-obra/proyectos";
import { NavContabilidad } from "@/components/contabilidad/nav-contabilidad";
import { FiltrosPeriodo } from "@/components/contabilidad/filtros-periodo";
import { IndicadoresResumen } from "@/components/contabilidad/indicadores-resumen";
import { EstadoResultadosView } from "@/components/contabilidad/estado-resultados-view";
import { Card } from "@/components/ui/card";

const RANGOS_VALIDOS: TipoRango[] = ["ESTE_MES", "MES_ANTERIOR", "TRIMESTRE", "ANIO", "PERSONALIZADO"];

export default async function ContabilidadPage(props: PageProps<"/contabilidad">) {
  const usuario = await requireSession();

  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada.
      </Card>
    );
  }
  if (!empresaTieneModulo(usuario, "contabilidad")) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu plan no incluye el módulo de Contabilidad.
      </Card>
    );
  }
  if (!puedeVerContabilidad(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para ver Contabilidad.
      </Card>
    );
  }

  const searchParams = await props.searchParams;
  const rangoParam = typeof searchParams.rango === "string" ? searchParams.rango : undefined;
  const tipoRango: TipoRango = RANGOS_VALIDOS.includes(rangoParam as TipoRango) ? (rangoParam as TipoRango) : "ESTE_MES";
  const desde = typeof searchParams.desde === "string" ? searchParams.desde : undefined;
  const hasta = typeof searchParams.hasta === "string" ? searchParams.hasta : undefined;
  const proyectoId = typeof searchParams.proyecto === "string" && searchParams.proyecto ? searchParams.proyecto : null;

  const rango = resolverRango(tipoRango, desde && hasta ? { desde, hasta } : undefined);

  const [estado, proyectos] = await Promise.all([
    obtenerEstadoResultadosComparado(usuario, rango, proyectoId),
    listarProyectos(usuario),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Contabilidad</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Estado de Resultados de {usuario.empresa.nombre}
        </p>
      </div>

      <NavContabilidad />
      <Suspense fallback={null}>
        <FiltrosPeriodo proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))} />
      </Suspense>

      <IndicadoresResumen estado={estado.periodoActual} />
      <EstadoResultadosView estado={estado} />
    </div>
  );
}
