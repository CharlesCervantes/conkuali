import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/server/auth/dal";
import { puedeAdministrarProyectos } from "@/lib/server/permisos";
import {
  obtenerProyecto,
  proyectoTieneInformacionContractual,
  proyectoTieneMovimientosFinancieros,
  ProyectoNoEncontradoError,
} from "@/lib/server/control-de-obra/proyectos";
import { Card } from "@/components/ui/card";
import { ProyectoForm } from "@/components/control-de-obra/proyecto-form";
import { editarProyectoAction } from "../../actions";

function aFechaInput(fecha: Date | null): string | null {
  return fecha ? fecha.toISOString().slice(0, 10) : null;
}

export default async function EditarProyectoPage({
  params,
}: PageProps<"/control-de-obra/[id]/editar">) {
  const usuario = await requireSession();
  const { id } = await params;

  if (!puedeAdministrarProyectos(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para editar proyectos.
      </Card>
    );
  }

  let proyecto;
  try {
    proyecto = await obtenerProyecto(usuario, id);
  } catch (error) {
    if (error instanceof ProyectoNoEncontradoError) notFound();
    throw error;
  }

  // El esquema ya definido con información contractual queda bloqueado; sin
  // esquema todavía pero con información contractual, se puede asignar pero
  // exige confirmación explícita (sección 3-4 del rediseño, agosto 2026).
  const tieneInfo = await proyectoTieneInformacionContractual(id);
  const esquemaBloqueado = proyecto.esquemaContractual !== null && tieneInfo;
  const requiereConfirmacionEsquema = proyecto.esquemaContractual === null && tieneInfo;

  // Mismo criterio, para el esquema financiero del cliente (Control
  // Contractual, agosto 2026) — "ya tiene información" aquí es "ya tiene
  // movimientos financieros", no información contractual.
  const tieneMovimientosFinancieros = await proyectoTieneMovimientosFinancieros(id);
  const esquemaFinancieroBloqueado =
    proyecto.esquemaFinanciamientoCliente !== null && tieneMovimientosFinancieros;
  const requiereConfirmacionEsquemaFinanciero =
    proyecto.esquemaFinanciamientoCliente === null && tieneMovimientosFinancieros;

  const accionConId = editarProyectoAction.bind(null, id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/control-de-obra/${id}`}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← {proyecto.nombre}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
          Editar proyecto
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{proyecto.nombre}</p>
      </div>

      <Card className="enter p-6">
        <ProyectoForm
          action={accionConId}
          modo="editar"
          textoBoton="Guardar cambios"
          esquemaBloqueado={esquemaBloqueado}
          requiereConfirmacionEsquema={requiereConfirmacionEsquema}
          esquemaFinancieroBloqueado={esquemaFinancieroBloqueado}
          requiereConfirmacionEsquemaFinanciero={requiereConfirmacionEsquemaFinanciero}
          valoresIniciales={{
            nombre: proyecto.nombre,
            tipo: proyecto.tipo,
            cliente: proyecto.cliente,
            ubicacion: proyecto.ubicacion,
            numeroContrato: proyecto.numeroContrato,
            descripcion: proyecto.descripcion,
            notas: proyecto.notas,
            fechaInicio: aFechaInput(proyecto.fechaInicio),
            fechaEstimadaTermino: aFechaInput(proyecto.fechaEstimadaTermino),
            esquemaContractual: proyecto.esquemaContractual,
            porcentajeUtilidadDefault: proyecto.porcentajeUtilidadDefault?.toString() ?? null,
            porcentajeAdministracionDefault:
              proyecto.porcentajeAdministracionDefault?.toString() ?? null,
            esquemaFinanciamientoCliente: proyecto.esquemaFinanciamientoCliente,
          }}
        />
      </Card>
    </div>
  );
}
