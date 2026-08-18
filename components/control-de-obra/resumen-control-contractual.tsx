import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import type { ControlContractual } from "@/lib/server/control-de-obra/financiero-cliente";

const ESQUEMA_CONTRACTUAL_LABEL: Record<string, string> = {
  PRECIO_ALZADO: "Precio alzado",
  ADMINISTRACION: "Administración",
};

const ESQUEMA_FINANCIERO_LABEL: Record<string, string> = {
  FONDO: "Fondo",
  PAGO_POR_ESTIMACION: "Pago por estimación",
};

export function ResumenControlContractual({
  proyectoId,
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
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            etiqueta="Esquema financiero"
            valor={
              datos.proyecto.esquemaFinanciamientoCliente
                ? (ESQUEMA_FINANCIERO_LABEL[datos.proyecto.esquemaFinanciamientoCliente] ??
                  datos.proyecto.esquemaFinanciamientoCliente)
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
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Avance financiero
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato etiqueta="Total emitido" valor={formatMoney(datos.avanceFinanciero.totalEmitido)} />
          <Dato
            etiqueta="Saldo contractual por ejercer"
            valor={formatMoney(datos.avanceFinanciero.saldoPorEjercer)}
          />
          <Dato
            etiqueta="% financiero ejercido"
            valor={`${datos.avanceFinanciero.porcentajeEjercido.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`}
          />
        </dl>
      </Card>

      {datos.fondo && (
        <Card className="enter p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Fondo</p>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Fondo aportado" valor={formatMoney(datos.fondo.aportado)} />
            <Dato etiqueta="Aplicado / ejercido" valor={formatMoney(datos.fondo.aplicado)} />
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

      {datos.pagoPorEstimacion && (
        <Card className="enter p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Pago por estimación
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato
              etiqueta="Total estimado"
              valor={formatMoney(datos.pagoPorEstimacion.totalEstimado)}
            />
            <Dato etiqueta="Total cobrado" valor={formatMoney(datos.pagoPorEstimacion.totalCobrado)} />
            <Dato
              etiqueta="Pendiente por cobrar"
              valor={formatMoney(datos.pagoPorEstimacion.pendiente)}
              resaltar={datos.pagoPorEstimacion.pendiente > 0}
            />
          </dl>
        </Card>
      )}

      {!datos.proyecto.esquemaFinanciamientoCliente && (
        <Card className="p-6 text-sm text-[var(--muted)]">
          Este proyecto no tiene un esquema financiero configurado. Un Administrador o Director
          puede definirlo desde{" "}
          <a
            href={`/control-de-obra/${proyectoId}/editar`}
            className="text-[var(--brand)] hover:underline"
          >
            editar información general
          </a>
          .
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
