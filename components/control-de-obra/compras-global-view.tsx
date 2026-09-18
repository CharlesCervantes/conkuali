import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import type { FilaRequisicionGlobal } from "@/lib/server/control-de-obra/requisiciones";
import type { FilaOrdenCompraGlobal, FilaFacturaPendienteCompra } from "@/lib/server/control-de-obra/ordenes-compra";

function rutaRequisiciones(proyectoId: string): string {
  return `/control-de-obra/${proyectoId}/ejecucion/gastos/requisiciones`;
}
function rutaOrdenesCompra(proyectoId: string): string {
  return `/control-de-obra/${proyectoId}/ejecucion/gastos/ordenes-compra`;
}
function rutaFacturas(): string {
  return "/contabilidad/facturas";
}

export function ComprasGlobalView({
  requisiciones,
  ordenesCompraPendientesAutorizacion,
  ordenesCompraPendientesPago,
  ordenesCompraPendientesRecepcion,
  facturasPendientes,
}: {
  requisiciones: FilaRequisicionGlobal[];
  ordenesCompraPendientesAutorizacion: FilaOrdenCompraGlobal[];
  ordenesCompraPendientesPago: FilaOrdenCompraGlobal[];
  ordenesCompraPendientesRecepcion: FilaOrdenCompraGlobal[];
  facturasPendientes: FilaFacturaPendienteCompra[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel titulo="Requisiciones pendientes / en cotización" vacio="Sin requisiciones pendientes.">
        {requisiciones.map((r) => (
          <FilaPanel
            key={r.id}
            href={rutaRequisiciones(r.proyectoId)}
            titulo={r.concepto}
            detalle={`${r.proyectoNombre} · ${r.cantidad} ${r.unidad} · ${r.solicitantePorNombre}`}
            etiqueta={r.estatus === "EN_COTIZACION" ? "En cotización" : "Pendiente"}
            etiquetaClase={r.estatus === "EN_COTIZACION" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}
          />
        ))}
      </Panel>

      <Panel titulo="OC pendientes de autorización" vacio="Sin órdenes de compra pendientes de autorizar.">
        {ordenesCompraPendientesAutorizacion.map((oc) => (
          <FilaPanel
            key={oc.id}
            href={rutaOrdenesCompra(oc.proyectoId)}
            titulo={`${oc.folio} · ${oc.proveedorNombre}`}
            detalle={`${oc.proyectoNombre} · ${formatearFecha(new Date(oc.fecha))}`}
            monto={oc.total}
          />
        ))}
      </Panel>

      <Panel titulo="OC autorizadas pendientes de pago" vacio="Sin órdenes de compra pendientes de pago.">
        {ordenesCompraPendientesPago.map((oc) => (
          <FilaPanel
            key={oc.id}
            href={rutaOrdenesCompra(oc.proyectoId)}
            titulo={`${oc.folio} · ${oc.proveedorNombre}`}
            detalle={oc.proyectoNombre}
            monto={oc.total}
          />
        ))}
      </Panel>

      <Panel titulo="OC pendientes de recepción" vacio="Sin órdenes de compra pendientes de recibir.">
        {ordenesCompraPendientesRecepcion.map((oc) => (
          <FilaPanel
            key={oc.id}
            href={rutaOrdenesCompra(oc.proyectoId)}
            titulo={`${oc.folio} · ${oc.proveedorNombre}`}
            detalle={oc.proyectoNombre}
            etiqueta={oc.estatusRecepcion === "PARCIAL" ? "Parcial" : "Pendiente"}
            etiquetaClase={oc.estatusRecepcion === "PARCIAL" ? "bg-amber-100 text-amber-800" : "bg-black/[0.05] text-[var(--muted)]"}
          />
        ))}
      </Panel>

      <Panel titulo="Facturas pendientes relacionadas con compras" vacio="Sin facturas pendientes." className="lg:col-span-2">
        {facturasPendientes.map((f) => (
          <FilaPanel
            key={f.gastoId}
            href={rutaFacturas()}
            titulo={f.ordenCompraFolio}
            detalle={`${f.proyectoNombre} · ${formatearFecha(new Date(f.fecha))}`}
            monto={f.monto}
          />
        ))}
      </Panel>
    </div>
  );
}

function Panel({
  titulo,
  vacio,
  children,
  className,
}: {
  titulo: string;
  vacio: string;
  children: React.ReactNode;
  className?: string;
}) {
  const hayContenido = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <Card className={`enter p-5 ${className ?? ""}`}>
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">{titulo}</p>
      {hayContenido ? (
        <div className="mt-3 divide-y divide-[var(--border)]/70">{children}</div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">{vacio}</p>
      )}
    </Card>
  );
}

function FilaPanel({
  href,
  titulo,
  detalle,
  monto,
  etiqueta,
  etiquetaClase,
}: {
  href: string;
  titulo: string;
  detalle: string;
  monto?: number;
  etiqueta?: string;
  etiquetaClase?: string;
}) {
  return (
    <Link href={href} className="flex items-center justify-between gap-3 py-2.5 hover:bg-black/[0.015]">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[var(--foreground)]">{titulo}</p>
        <p className="truncate text-xs text-[var(--muted)]">{detalle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {etiqueta && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${etiquetaClase}`}>{etiqueta}</span>}
        {monto !== undefined && (
          <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">{formatMoney(monto)}</span>
        )}
      </div>
    </Link>
  );
}
