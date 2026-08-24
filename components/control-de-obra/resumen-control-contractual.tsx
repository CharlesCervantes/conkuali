import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import type { ControlContractual } from "@/lib/server/control-de-obra/financiero-cliente";

const ESQUEMA_CONTRACTUAL_LABEL: Record<string, string> = {
  PRECIO_ALZADO: "Precio alzado",
  ADMINISTRACION: "Administración",
};

// Toda obra se cobra por Estimación — ya no hay un "esquema financiero" que
// elegir ni bloque que ocultar por falta de configuración. El bloque de
// Fondo es puramente data-driven: aparece solo si el proyecto ya recibió
// alguna aportación (rediseño del modelo financiero del cliente, agosto
// 2026).
export function ResumenControlContractual({
  datos,
}: {
  proyectoId: string;
  datos: ControlContractual;
}) {
  return (
    <div className="space-y-4">
      <Card className="enter p-5">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Información contractual
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato etiqueta="Monto del contrato" valor={formatMoney(datos.proyecto.montoContrato)} />
          <Dato
            etiqueta="Esquema contractual"
            valor={
              datos.proyecto.esquemaContractual
                ? (ESQUEMA_CONTRACTUAL_LABEL[datos.proyecto.esquemaContractual] ??
                  datos.proyecto.esquemaContractual)
                : "Sin definir"
            }
          />
          <Dato
            etiqueta="Fecha de inicio"
            valor={datos.proyecto.fechaInicio ? formatearFecha(new Date(datos.proyecto.fechaInicio)) : "—"}
          />
        </dl>
      </Card>

      <Card className="enter p-5 ring-2 ring-emerald-200">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Contrato</p>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato etiqueta="Total estimado emitido" valor={formatMoney(datos.contrato.totalEstimado)} />
          <Dato etiqueta="Total cubierto" valor={formatMoney(datos.contrato.totalCubierto)} />
          <Dato
            etiqueta="Pendiente por cobrar"
            valor={formatMoney(datos.contrato.pendienteCobro)}
            resaltar={datos.contrato.pendienteCobro > 0}
          />
          <Dato
            etiqueta="Saldo contractual por ejercer"
            valor={formatMoney(datos.contrato.saldoPorEjercer)}
          />
          <Dato
            etiqueta="% avance financiero"
            valor={`${datos.contrato.porcentajeEjercido.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`}
          />
        </dl>
      </Card>

      {datos.fondo && (
        <Card className="enter p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Fondo del cliente
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Total aportado" valor={formatMoney(datos.fondo.aportado)} />
            <Dato etiqueta="Total aplicado" valor={formatMoney(datos.fondo.aplicado)} />
            {datos.fondo.disponible >= 0 ? (
              <Dato etiqueta="Fondo disponible" valor={formatMoney(datos.fondo.disponible)} />
            ) : (
              <Dato
                etiqueta="Fondo por reponer"
                valor={formatMoney(Math.abs(datos.fondo.disponible))}
                resaltar
              />
            )}
          </dl>
        </Card>
      )}
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  resaltar,
}: {
  etiqueta: string;
  valor: string;
  resaltar?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted)]">{etiqueta}</dt>
      <dd
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          resaltar ? "text-red-600" : "text-[var(--foreground)]"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
