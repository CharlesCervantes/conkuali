import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";
import type { EsquemaContractual } from "@/lib/generated/prisma/enums";

// Desglose obligatorio de 6 líneas (sección 8 del rediseño de Estimación
// semanal, agosto 2026): Subtotal trabajos / Gastos cobrables / Subtotal /
// Administración-o-Utilidad / IVA (solo si aplica) / TOTAL. Se muestra como
// monto, nunca como "% único" — un solo porcentaje sobre trabajos+gastos
// combinados sería engañoso en cuanto algún concepto tiene un override
// propio (la administración real es la suma exacta por concepto más la de
// gastos, no un porcentaje plano visible aquí).
type ResumenCompleto = {
  subtotalTrabajos: number;
  gastosCobrables: number;
  administracion: number;
  aplicaIVA: boolean;
  montoIVA: number;
  total: number;
};

function esCompleto(props: { total: number } | ResumenCompleto): props is ResumenCompleto {
  return "subtotalTrabajos" in props;
}

export function ResumenEstimacionOperativa(props: { total: number } | ResumenCompleto) {
  if (!esCompleto(props)) {
    return (
      <Card className="enter p-5 ring-2 ring-emerald-200">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Resumen de la semana
        </p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--muted)]">Total de esta semana</span>
          <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
            {formatMoney(props.total)}
          </span>
        </div>
      </Card>
    );
  }

  return (
    <ResumenLineas
      titulo="Resumen de la semana"
      etiquetaMonto="Administración"
      {...props}
    />
  );
}

export function ResumenEstimacionPrivada({
  esquemaContractual,
  ...resto
}: ResumenCompleto & { esquemaContractual: EsquemaContractual | null }) {
  const etiquetaMonto = esquemaContractual === "ADMINISTRACION" ? "Administración" : "Utilidad";
  return (
    <ResumenLineas titulo="Resumen comercial de esta estimación" etiquetaMonto={etiquetaMonto} {...resto} />
  );
}

function ResumenLineas({
  titulo,
  etiquetaMonto,
  subtotalTrabajos,
  gastosCobrables,
  administracion,
  aplicaIVA,
  montoIVA,
  total,
}: ResumenCompleto & { titulo: string; etiquetaMonto: string }) {
  const subtotal = subtotalTrabajos + gastosCobrables;
  return (
    <Card className="enter p-5 ring-2 ring-emerald-200">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">{titulo}</p>
      <div className="mt-3 space-y-1.5">
        <Linea label="Subtotal trabajos" valor={subtotalTrabajos} />
        <Linea label="Gastos cobrables" valor={gastosCobrables} />
        <Linea label="Subtotal" valor={subtotal} destacado />
        <Linea label={etiquetaMonto} valor={administracion} />
        {aplicaIVA && <Linea label="IVA" valor={montoIVA} />}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-sm font-medium text-[var(--muted)]">TOTAL</span>
        <span className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
          {formatMoney(total)}
        </span>
      </div>
    </Card>
  );
}

function Linea({ label, valor, destacado }: { label: string; valor: number; destacado?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${destacado ? "font-medium text-[var(--foreground)]" : "text-[var(--muted)]"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${destacado ? "text-sm font-semibold text-[var(--foreground)]" : "text-sm text-[var(--foreground)]"}`}
      >
        {formatMoney(valor)}
      </span>
    </div>
  );
}
