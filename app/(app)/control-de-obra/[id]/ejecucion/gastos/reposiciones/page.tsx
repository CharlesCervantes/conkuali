import { requireSession } from "@/lib/server/auth/dal";
import {
  puedeCapturarGastos,
  puedeAprobarGastos,
} from "@/lib/server/permisos";
import {
  obtenerOCrearSemana,
  formatearRangoSemana,
  fechaAParametro,
  parametroAFecha,
} from "@/lib/server/semanas";
import {
  obtenerGastos,
  calcularDashboardGastos,
  listarBeneficiariosParaGasto,
} from "@/lib/server/control-de-obra/gastos";
import { obtenerReposiciones } from "@/lib/server/control-de-obra/reposiciones";
import { NavegacionSemana } from "@/components/control-de-obra/navegacion-semana";
import { GastosReposicionesView } from "@/components/control-de-obra/gastos-reposiciones-view";
import { Card } from "@/components/ui/card";

export default async function ReposicionesPage({
  params,
  searchParams,
}: PageProps<"/control-de-obra/[id]/ejecucion/gastos/reposiciones">) {
  const usuario = await requireSession();

  if (!puedeCapturarGastos(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para ver Gastos de Obra.
      </Card>
    );
  }

  const { id } = await params;
  const { fecha } = await searchParams;
  const fechaParam = typeof fecha === "string" ? fecha : undefined;

  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada.
      </Card>
    );
  }

  const semana = await obtenerOCrearSemana(usuario.empresa.id, parametroAFecha(fechaParam));
  const [gastos, reposiciones, beneficiarios] = await Promise.all([
    obtenerGastos(usuario, id, semana.id),
    obtenerReposiciones(usuario, id, semana.id),
    listarBeneficiariosParaGasto(usuario),
  ]);
  const dashboard = calcularDashboardGastos(gastos);

  const fechaAnterior = new Date(semana.fechaInicio);
  fechaAnterior.setDate(fechaAnterior.getDate() - 7);
  const fechaSiguiente = new Date(semana.fechaInicio);
  fechaSiguiente.setDate(fechaSiguiente.getDate() + 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Gastos de obra</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Reposiciones de gastos · {formatearRangoSemana(semana)}
        </p>
      </div>

      <NavegacionSemana
        proyectoId={id}
        rutaBase="ejecucion/gastos/reposiciones"
        etiquetaSemana={`Semana ${semana.numero}`}
        fechaAnteriorParametro={fechaAParametro(fechaAnterior)}
        fechaSiguienteParametro={fechaAParametro(fechaSiguiente)}
      />

      <GastosReposicionesView
        proyectoId={id}
        semanaId={semana.id}
        gastos={gastos}
        reposiciones={reposiciones}
        beneficiarios={beneficiarios}
        dashboard={dashboard}
        puedeAprobar={puedeAprobarGastos(usuario)}
        usuarioId={usuario.id}
      />
    </div>
  );
}
