import { requireSession } from "@/lib/server/auth/dal";
import { empresaTieneModulo, puedeVerContabilidad } from "@/lib/server/permisos";
import { obtenerResumenMensual } from "@/lib/server/contabilidad/resumen";
import { parametroAPeriodo } from "@/lib/contabilidad/periodo";
import { formatMoney } from "@/lib/dinero";
import { NavContabilidad } from "@/components/contabilidad/nav-contabilidad";
import { NavegacionMes } from "@/components/contabilidad/navegacion-mes";
import { Card } from "@/components/ui/card";
import Link from "next/link";

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
  const periodo = parametroAPeriodo(typeof searchParams.periodo === "string" ? searchParams.periodo : undefined);
  const resumen = await obtenerResumenMensual(usuario, periodo.anio, periodo.mes);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Contabilidad</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Ingresos y egresos fiscales de {usuario.empresa.nombre}
        </p>
      </div>

      <NavContabilidad />
      <NavegacionMes periodo={periodo} rutaBase="/contabilidad" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="enter p-5">
          <p className="text-xs font-medium text-[var(--muted)]">Ingresos fiscales</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">
            {formatMoney(resumen.ingresosFiscales)}
          </p>
        </Card>
        <Card className="enter p-5">
          <p className="text-xs font-medium text-[var(--muted)]">Egresos fiscales</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-700">
            {formatMoney(resumen.egresosFiscales)}
          </p>
        </Card>
        <Card className="enter p-5">
          <p className="text-xs font-medium text-[var(--muted)]">Resultado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--brand)]">
            {formatMoney(resumen.resultado)}
          </p>
        </Card>
        <Link href="/contabilidad/facturas">
          <Card className="enter p-5 transition-colors duration-150 ease-out hover:bg-black/[0.02]">
            <p className="text-xs font-medium text-[var(--muted)]">Facturas pendientes</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-700">
              {resumen.facturasPendientes}
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
