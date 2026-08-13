import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/dinero";

export function ResumenSemana({
  totalEntreSemana,
  totalFinSemana,
  obrasConMovimientos,
}: {
  totalEntreSemana: number;
  totalFinSemana: number;
  obrasConMovimientos: number;
}) {
  const total = totalEntreSemana + totalFinSemana;

  const tarjetas = [
    { etiqueta: "Total semana", valor: formatMoney(total), destacado: true },
    { etiqueta: "Entre semana", valor: formatMoney(totalEntreSemana) },
    { etiqueta: "Fin de semana", valor: formatMoney(totalFinSemana) },
    {
      etiqueta: "Obras con movimientos",
      valor: String(obrasConMovimientos),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tarjetas.map((t, i) => (
        <Card
          key={t.etiqueta}
          className="enter p-4"
          style={{ transitionDelay: `${i * 40}ms` }}
        >
          <p className="text-xs font-medium text-[var(--muted)]">
            {t.etiqueta}
          </p>
          <p
            className={
              t.destacado
                ? "mt-1 text-2xl font-semibold tabular-nums text-[var(--brand)]"
                : "mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]"
            }
          >
            {t.valor}
          </p>
        </Card>
      ))}
    </div>
  );
}
