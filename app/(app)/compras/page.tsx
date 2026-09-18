import Link from "next/link";
import { requireSession } from "@/lib/server/auth/dal";
import { puedeAutorizarOrdenesCompra } from "@/lib/server/permisos";
import { obtenerRequisicionesGlobal } from "@/lib/server/control-de-obra/requisiciones";
import {
  obtenerOrdenesCompraPendientesGlobal,
  obtenerFacturasPendientesCompras,
} from "@/lib/server/control-de-obra/ordenes-compra";
import { obtenerOCrearProyectoOficina } from "@/lib/server/control-de-obra/proyecto-oficina";
import { ComprasGlobalView } from "@/components/control-de-obra/compras-global-view";
import { Card } from "@/components/ui/card";

// Vista transversal (Administrador/Director, todas las obras + Empresa) —
// Compras, septiembre 2026. Solo lectura + enlaces a la pantalla real de
// cada Proyecto — nunca reimplementa acciones aquí (no duplicar lógica).
export default async function ComprasPage() {
  const usuario = await requireSession();

  if (!puedeAutorizarOrdenesCompra(usuario)) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        No tienes permiso para ver Compras.
      </Card>
    );
  }
  if (!usuario.empresa) {
    return (
      <Card className="p-6 text-sm text-[var(--muted)]">
        Tu cuenta no tiene una empresa asignada.
      </Card>
    );
  }

  const [requisiciones, ordenesCompra, facturasPendientes, proyectoOficinaId] = await Promise.all([
    obtenerRequisicionesGlobal(usuario),
    obtenerOrdenesCompraPendientesGlobal(usuario),
    obtenerFacturasPendientesCompras(usuario),
    obtenerOCrearProyectoOficina(usuario.empresa.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Compras</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Requisiciones, cotizaciones y órdenes de compra que necesitan atención — todas las obras y Empresa.
          </p>
        </div>
        <Link
          href={`/control-de-obra/${proyectoOficinaId}/ejecucion/gastos/requisiciones`}
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          + Nueva requisición de Empresa
        </Link>
      </div>

      <ComprasGlobalView
        requisiciones={requisiciones}
        ordenesCompraPendientesAutorizacion={ordenesCompra.pendientesAutorizacion}
        ordenesCompraPendientesPago={ordenesCompra.pendientesPago}
        ordenesCompraPendientesRecepcion={ordenesCompra.pendientesRecepcion}
        facturasPendientes={facturasPendientes}
      />
    </div>
  );
}
