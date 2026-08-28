import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import { formatearFecha } from "@/lib/fecha";
import type { ControlContractual } from "@/lib/server/control-de-obra/financiero-cliente";

const ESQUEMA_CONTRACTUAL_LABEL: Record<string, string> = {
  PRECIO_ALZADO: "Precio alzado",
  ADMINISTRACION: "Administración",
};

// Dos bloques deliberadamente separados, nunca mezclados en una fórmula
// (rediseño Cliente/Cliente Priv., agosto 2026): "Avance contractual" varía
// según la capa de valorización de la pantalla (operativo en Cliente,
// privado en Cliente Priv.) y es visible sin restricción financiera. "Fondo
// del cliente" es dinero real, ancorado siempre al total privado — el
// servidor ya lo omite (`datos.financiero === null`) si el usuario no tiene
// puedeVerFinancieroCliente, así que aquí solo se decide si HAY algo que
// pintar, nunca si se debe ocultar un dato que sí llegó.
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
          <Dato
            etiqueta="Monto del contrato"
            valor={formatMoney(datos.avanceContractual.montoContrato)}
          />
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
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Avance contractual
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Dato
            etiqueta="Total estimado emitido"
            valor={formatMoney(datos.avanceContractual.totalEstimado)}
          />
          <Dato
            etiqueta="Saldo contractual por ejercer"
            valor={formatMoney(datos.avanceContractual.saldoPorEjercer)}
          />
          <Dato
            etiqueta="% avance"
            valor={`${datos.avanceContractual.porcentajeEjercido.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`}
          />
        </dl>
      </Card>

      {datos.financiero && (
        <Card className="enter p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Situación financiera real
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Total cubierto" valor={formatMoney(datos.financiero.totalCubierto)} />
            <Dato
              etiqueta="Pendiente por cobrar"
              valor={formatMoney(datos.financiero.pendienteFinancieroReal)}
              resaltar={datos.financiero.pendienteFinancieroReal > 0}
            />
          </dl>
        </Card>
      )}

      {datos.financiero?.fondo && (
        <Card className="enter p-5">
          <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
            Fondo disponible del proyecto
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Efectivo real del proyecto — compartido entre General y Privado, nunca partido entre capas.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Total aportado" valor={formatMoney(datos.financiero.fondo.aportado)} />
            <Dato etiqueta="Total aplicado" valor={formatMoney(datos.financiero.fondo.aplicado)} />
            {datos.financiero.fondo.disponible >= 0 ? (
              <Dato etiqueta="Fondo disponible" valor={formatMoney(datos.financiero.fondo.disponible)} />
            ) : (
              <Dato
                etiqueta="Fondo por reponer"
                valor={formatMoney(Math.abs(datos.financiero.fondo.disponible))}
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
