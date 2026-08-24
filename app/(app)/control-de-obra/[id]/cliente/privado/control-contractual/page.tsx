import { requireSession } from "@/lib/server/auth/dal";
import {
  puedeVerFinancieroCliente,
  puedeRegistrarMovimientoFinancieroCliente,
} from "@/lib/server/permisos";
import {
  obtenerControlContractual,
  obtenerHistorialEstimacionesCliente,
  obtenerAportacionesFondo,
} from "@/lib/server/control-de-obra/financiero-cliente";
import { ResumenControlContractual } from "@/components/control-de-obra/resumen-control-contractual";
import { HistorialEstimacionesCliente } from "@/components/control-de-obra/historial-estimaciones-cliente";
import { AportacionesFondo } from "@/components/control-de-obra/aportaciones-fondo";
import { Card } from "@/components/ui/card";

export default async function ControlContractualPage({
  params,
}: PageProps<"/control-de-obra/[id]/cliente/privado/control-contractual">) {
  const usuario = await requireSession();

  // Control Contractual es información financiera privada — mismo gate que
  // el resto de la capa privada, validado aquí antes de consultar nada
  // (sección 17/22 del diseño de Control Contractual, agosto 2026).
  if (!puedeVerFinancieroCliente(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para ver Control Contractual.
      </Card>
    );
  }

  const { id } = await params;

  const [datos, historial, aportaciones] = await Promise.all([
    obtenerControlContractual(usuario, id),
    obtenerHistorialEstimacionesCliente(usuario, id),
    obtenerAportacionesFondo(usuario, id),
  ]);

  const puedeRegistrar = puedeRegistrarMovimientoFinancieroCliente(usuario);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Control contractual</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{datos.proyecto.nombre}</p>
      </div>

      <ResumenControlContractual proyectoId={id} datos={datos} />

      <HistorialEstimacionesCliente
        proyectoId={id}
        fondoDisponible={datos.fondo?.disponible ?? 0}
        filas={historial}
        puedeRegistrar={puedeRegistrar}
      />

      <AportacionesFondo proyectoId={id} aportaciones={aportaciones} puedeRegistrar={puedeRegistrar} />
    </div>
  );
}
