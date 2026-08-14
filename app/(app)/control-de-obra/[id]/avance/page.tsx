import { requireSession } from "@/lib/server/auth/dal";
import {
  obtenerOCrearSemana,
  formatearRangoSemana,
  fechaAParametro,
  parametroAFecha,
} from "@/lib/server/semanas";
import { obtenerAvanceSemanal } from "@/lib/server/control-de-obra/avance";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import { ResumenAvance } from "@/components/control-de-obra/resumen-avance";
import { NavegacionSemana } from "@/components/control-de-obra/navegacion-semana";
import { FormAvanceSemanal } from "@/components/control-de-obra/form-avance-semanal";
import { Card } from "@/components/ui/card";

export default async function AvanceObraPage({
  params,
  searchParams,
}: PageProps<"/control-de-obra/[id]/avance">) {
  const usuario = await requireSession();
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

  // Semana compartida con toda la empresa (la misma entidad que Reporte
  // General) — no se crea un ciclo semanal independiente para este módulo.
  const semana = await obtenerOCrearSemana(usuario.empresa.id, parametroAFecha(fechaParam));
  const partidas = await obtenerAvanceSemanal(usuario, id, semana);

  const todosLosConceptos = partidas.flatMap((p) => p.conceptos);
  const conMovimiento = todosLosConceptos.filter((c) => c.estaSemana > 0).length;
  const terminados = todosLosConceptos.filter((c) => c.estado === "TERMINADO").length;
  const pendientes = todosLosConceptos.filter((c) => c.estado !== "TERMINADO").length;

  const fechaAnterior = new Date(semana.fechaInicio);
  fechaAnterior.setDate(fechaAnterior.getDate() - 7);
  const fechaSiguiente = new Date(semana.fechaInicio);
  fechaSiguiente.setDate(fechaSiguiente.getDate() + 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Avance de obra
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Avance físico real por concepto · {formatearRangoSemana(semana)}
        </p>
      </div>

      <ResumenAvance
        conMovimiento={conMovimiento}
        terminados={terminados}
        pendientes={pendientes}
      />

      <NavegacionSemana
        proyectoId={id}
        etiquetaSemana={`Semana ${semana.numero}`}
        fechaAnteriorParametro={fechaAParametro(fechaAnterior)}
        fechaSiguienteParametro={fechaAParametro(fechaSiguiente)}
      />

      <FormAvanceSemanal
        key={semana.id}
        proyectoId={id}
        semanaId={semana.id}
        partidas={partidas}
        puedeAprobar={puedeAdministrarProyectos(usuario)}
      />
    </div>
  );
}
