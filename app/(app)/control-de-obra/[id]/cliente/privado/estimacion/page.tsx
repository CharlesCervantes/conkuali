import { requireSession } from "@/lib/server/auth/dal";
import {
  puedeVerContratoGeneralPrivado,
  puedeEmitirEstimacionCliente,
  puedeMaterializarEstimacionHistorica,
} from "@/lib/server/permisos";
import { obtenerProyecto } from "@/lib/server/control-de-obra/proyectos";
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
  agruparPorPartida,
  type FilaEstimacion,
} from "@/lib/server/control-de-obra/estimacion-cliente";
import { NavegacionSemana } from "@/components/control-de-obra/navegacion-semana";
import { TablaEstimacion, type FilaTablaEstimacion } from "@/components/control-de-obra/tabla-estimacion";
import { ResumenEstimacionPrivada } from "@/components/control-de-obra/resumen-estimacion";
import { EmitirEstimacion } from "@/components/control-de-obra/emitir-estimacion";
import { MaterializarEstimacionHistorica } from "@/components/control-de-obra/materializar-estimacion-historica";
import { Card } from "@/components/ui/card";

function aFilaTabla(f: FilaEstimacion): FilaTablaEstimacion {
  return {
    conceptoId: f.conceptoId,
    descripcionConcepto: f.descripcionConcepto,
    unidad: f.unidad,
    cantidadContratada: f.cantidadContratada,
    precioUnitario: f.precioUnitarioPrivado,
    importeContratado: f.importeContratadoPrivado,
    cantidadAnterior: f.cantidadAnterior,
    cantidadEstaSemana: f.cantidadEstaSemana,
    cantidadAcumulada: f.cantidadAcumulada,
    importeEstaSemana: f.importeEstaSemanaPrivado,
    importeAcumulado: f.importeAcumuladoPrivado,
    cantidadPorEjercer: f.cantidadPorEjercer,
    importePorEjercer: f.importePorEjercerPrivado,
    avancePorcentaje: f.avancePorcentaje,
    porcentajeAplicado: f.porcentajeAplicadoPrivado,
  };
}

export default async function ClientePrivadoEstimacionPage({
  params,
  searchParams,
}: PageProps<"/control-de-obra/[id]/cliente/privado/estimacion">) {
  const usuario = await requireSession();

  // Mismo criterio que Contrato General Privado: el permiso se valida aquí,
  // del lado servidor, antes de consultar cualquier dato privado — no basta
  // con ocultar la subpestaña (sección 9 del diseño de Cliente, agosto 2026).
  if (!puedeVerContratoGeneralPrivado(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para ver Cliente Priv.
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
  const [proyecto, resumenCierre] = await Promise.all([
    obtenerProyecto(usuario, id),
    obtenerResumenCierreSemana(usuario, id, semana.id),
  ]);
  const semanaCerrada = resumenCierre.estatus === "CERRADA";

  // congelado === null con semana cerrada significa que nunca se generó un
  // snapshot para esta semana (semana cerrada antes de que existiera este
  // módulo, típicamente) — distinto de "existe pero no tuvo avance esa
  // semana". Ver también cliente/general/page.tsx.
  const congelado = semanaCerrada ? await obtenerEstimacionCliente(usuario, id, semana.id) : null;
  const sinSnapshot = semanaCerrada && congelado === null;

  let filas: FilaEstimacion[];
  let totales: { subtotal: number; montoAdministracionOUtilidad: number; total: number };

  if (semanaCerrada) {
    filas = congelado?.filas ?? [];
    totales = congelado?.estimacion ?? { subtotal: 0, montoAdministracionOUtilidad: 0, total: 0 };
  } else {
    const resultado = await obtenerEstimacionSemanalEnVivo(usuario, id, semana);
    filas = resultado.filas;
    totales = resultado.totalesPrivados;
  }

  const partidas = agruparPorPartida(filas).map((p) => ({
    partidaNombre: p.partidaNombre,
    conceptos: p.conceptos.map(aFilaTabla),
  }));

  const fechaAnterior = new Date(semana.fechaInicio);
  fechaAnterior.setDate(fechaAnterior.getDate() - 7);
  const fechaSiguiente = new Date(semana.fechaInicio);
  fechaSiguiente.setDate(fechaSiguiente.getDate() + 7);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Cliente Priv.</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Valorización del avance físico con la lógica de Contrato General Privado ·{" "}
          {formatearRangoSemana(semana)}
        </p>
      </div>

      <NavegacionSemana
        proyectoId={id}
        rutaBase="cliente/privado/estimacion"
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
          Semana abierta · información preliminar — no se puede emitir todavía
        </p>
      )}

      {sinSnapshot ? (
        puedeMaterializarEstimacionHistorica(usuario) ? (
          <MaterializarEstimacionHistorica
            proyectoId={id}
            semanaId={semana.id}
            numeroSemana={semana.numero}
          />
        ) : (
          <Card className="p-6 text-sm text-[var(--muted)]">
            Esta semana no tiene una estimación generada todavía.
          </Card>
        )
      ) : (
        <>
          <TablaEstimacion partidas={partidas} mostrarPorcentajeAplicado />

          <ResumenEstimacionPrivada
            esquemaContractual={proyecto.esquemaContractual}
            subtotal={totales.subtotal}
            montoAdministracionOUtilidad={totales.montoAdministracionOUtilidad}
            total={totales.total}
          />

          {semanaCerrada && congelado && (
            <EmitirEstimacion
              proyectoId={id}
              estimacionId={congelado.estimacion.id}
              numero={congelado.estimacion.numero}
              estatus={congelado.estimacion.estatus}
              total={congelado.estimacion.total}
              generadoPorNombre={congelado.estimacion.generadoPorNombre}
              emitidoPorNombre={congelado.estimacion.emitidoPorNombre}
              emitidoEn={congelado.estimacion.emitidoEn}
              puedeEmitir={puedeEmitirEstimacionCliente(usuario)}
            />
          )}
        </>
      )}
    </div>
  );
}
