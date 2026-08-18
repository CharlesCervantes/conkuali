import { requireSession } from "@/lib/server/auth/dal";
import {
  obtenerOCrearSemana,
  formatearRangoSemana,
  fechaAParametro,
  parametroAFecha,
} from "@/lib/server/semanas";
import { obtenerResumenCierreSemana } from "@/lib/server/control-de-obra/cierre-semana";
import {
  obtenerEstimacionSemanalEnVivo,
  obtenerEstimacionCliente,
  soloOperativo,
  agruparPorPartida,
  totalOperativo,
} from "@/lib/server/control-de-obra/estimacion-cliente";
import { NavegacionSemana } from "@/components/control-de-obra/navegacion-semana";
import { TablaEstimacion, type FilaTablaEstimacion } from "@/components/control-de-obra/tabla-estimacion";
import { ResumenEstimacionOperativa } from "@/components/control-de-obra/resumen-estimacion";
import { Card } from "@/components/ui/card";

function aFilaTabla(f: {
  conceptoId: string;
  descripcionConcepto: string;
  unidad: string;
  cantidadContratada: number;
  precioUnitarioOperativo: number;
  importeContratadoOperativo: number;
  cantidadAnterior: number;
  cantidadEstaSemana: number;
  cantidadAcumulada: number;
  importeEstaSemanaOperativo: number;
  importeAcumuladoOperativo: number;
  cantidadPorEjercer: number;
  importePorEjercerOperativo: number;
  avancePorcentaje: number;
}): FilaTablaEstimacion {
  return {
    conceptoId: f.conceptoId,
    descripcionConcepto: f.descripcionConcepto,
    unidad: f.unidad,
    cantidadContratada: f.cantidadContratada,
    precioUnitario: f.precioUnitarioOperativo,
    importeContratado: f.importeContratadoOperativo,
    cantidadAnterior: f.cantidadAnterior,
    cantidadEstaSemana: f.cantidadEstaSemana,
    cantidadAcumulada: f.cantidadAcumulada,
    importeEstaSemana: f.importeEstaSemanaOperativo,
    importeAcumulado: f.importeAcumuladoOperativo,
    cantidadPorEjercer: f.cantidadPorEjercer,
    importePorEjercer: f.importePorEjercerOperativo,
    avancePorcentaje: f.avancePorcentaje,
  };
}

export default async function ClienteGeneralPage({
  params,
  searchParams,
}: PageProps<"/control-de-obra/[id]/cliente/general">) {
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

  const semana = await obtenerOCrearSemana(usuario.empresa.id, parametroAFecha(fechaParam));
  const resumenCierre = await obtenerResumenCierreSemana(usuario, id, semana.id);
  const semanaCerrada = resumenCierre.estatus === "CERRADA";

  // Distinguir "no existe snapshot todavía" (semana cerrada antes de que
  // existiera este módulo, o que por algún motivo nunca se generó) de
  // "existe el snapshot pero en verdad no hubo avance esa semana" — son
  // mensajes distintos para el usuario (ver también cliente/privado/page.tsx).
  const congelado = semanaCerrada ? await obtenerEstimacionCliente(usuario, id, semana.id) : null;
  const sinSnapshot = semanaCerrada && congelado === null;

  const filasOperativas = semanaCerrada
    ? soloOperativo(congelado?.filas ?? [])
    : soloOperativo((await obtenerEstimacionSemanalEnVivo(usuario, id, semana)).filas);

  const partidas = agruparPorPartida(filasOperativas).map((p) => ({
    partidaNombre: p.partidaNombre,
    conceptos: p.conceptos.map(aFilaTabla),
  }));
  const total = totalOperativo(filasOperativas);

  const fechaAnterior = new Date(semana.fechaInicio);
  fechaAnterior.setDate(fechaAnterior.getDate() - 7);
  const fechaSiguiente = new Date(semana.fechaInicio);
  fechaSiguiente.setDate(fechaSiguiente.getDate() + 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Cliente</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Valorización del avance físico con la lógica de Contrato General ·{" "}
          {formatearRangoSemana(semana)}
        </p>
      </div>

      <NavegacionSemana
        proyectoId={id}
        rutaBase="cliente/general"
        etiquetaSemana={`Semana ${semana.numero}`}
        fechaAnteriorParametro={fechaAParametro(fechaAnterior)}
        fechaSiguienteParametro={fechaAParametro(fechaSiguiente)}
      />

      {semanaCerrada ? (
        <p className="text-xs font-medium text-emerald-700">
          Semana cerrada · corte oficial de esta semana
        </p>
      ) : (
        <p className="text-xs font-medium text-amber-700">
          Semana abierta · información preliminar
        </p>
      )}

      {sinSnapshot ? (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Esta semana no tiene una estimación generada todavía.
        </Card>
      ) : (
        <>
          <TablaEstimacion partidas={partidas} />
          <ResumenEstimacionOperativa total={total} />
        </>
      )}
    </div>
  );
}
