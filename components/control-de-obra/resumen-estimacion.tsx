import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

export function ResumenEstimacionOperativa({ total }: { total: number }) {
  return (
    <Card className="enter p-5 ring-2 ring-emerald-200">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        Resumen de la semana
      </p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted)]">Total de esta semana</span>
        <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
          {formatMoney(total)}
        </span>
      </div>
    </Card>
  );
}

export function ResumenEstimacionPrivada({
  esquemaContractual,
  subtotal,
  montoAdministracionOUtilidad,
  total,
}: {
  esquemaContractual: EsquemaContractual | null;
  subtotal: number;
  montoAdministracionOUtilidad: number;
  total: number;
}) {
  const esAdministracion = esquemaContractual === "ADMINISTRACION";
  const etiquetaMonto = esAdministracion ? "Administración" : "Utilidad";

  return (
    <Card className="enter p-5 ring-2 ring-emerald-200">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
        Resumen comercial de esta estimación
      </p>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
        <Metrica label="Subtotal" valor={subtotal} />
        <Metrica label={etiquetaMonto} valor={montoAdministracionOUtilidad} />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-sm font-medium text-[var(--muted)]">Total de esta estimación</span>
        <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
          {formatMoney(total)}
        </span>
      </div>
    </Card>
  );
}

function Metrica({ label, valor }: { label: string; valor: number }) {
  return (
    <div>
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-base font-semibold tabular-nums text-[var(--foreground)]">
        {formatMoney(valor)}
      </p>
    </div>
  );
}
