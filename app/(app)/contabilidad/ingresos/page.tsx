import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeVerContabilidad } from "@/lib/server/permisos";
import { obtenerIngresos } from "@/lib/server/contabilidad/ingresos";
import { listarMediosFinancieros } from "@/lib/server/contabilidad/medios-financieros";
import { listarFacturas } from "@/lib/server/contabilidad/facturas";
import { listarProyectos } from "@/lib/server/control-de-obra/proyectos";
import { parametroAPeriodo } from "@/lib/contabilidad/periodo";
import { NavContabilidad } from "@/components/contabilidad/nav-contabilidad";
import { NavegacionMes } from "@/components/contabilidad/navegacion-mes";
import { IngresosView } from "@/components/contabilidad/ingresos-view";
import { Card } from "@/components/ui/card";

export default async function IngresosContabilidadPage(props: PageProps<"/contabilidad/ingresos">) {
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

  const searchParams = await props.searchParams;
  const periodo = parametroAPeriodo(typeof searchParams.periodo === "string" ? searchParams.periodo : undefined);

  const [ingresos, medios, facturas, proyectos] = await Promise.all([
    obtenerIngresos(usuario, periodo.anio, periodo.mes),
    listarMediosFinancieros(usuario, true),
    listarFacturas(usuario),
    listarProyectos(usuario),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Contabilidad</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Ingresos fiscales</p>
      </div>

      <NavContabilidad />
      <NavegacionMes periodo={periodo} rutaBase="/contabilidad/ingresos" />

      <IngresosView
        ingresos={ingresos}
        mediosFinancieros={medios}
        facturasEmitidas={facturas.filter((f) => f.direccion === "EMITIDA")}
        proyectosDisponibles={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />
    </div>
  );
}
