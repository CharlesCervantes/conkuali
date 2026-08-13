import { Card } from "@/components/ui/card";

export function ResumenAvance({
  conMovimiento,
  terminados,
  pendientes,
}: {
  conMovimiento: number;
  terminados: number;
  pendientes: number;
}) {
  const tarjetas = [
    {
      etiqueta: "Avance físico general",
      valor: "—",
      nota: "Pendiente de definir metodología",
    },
    { etiqueta: "Con movimiento esta semana", valor: String(conMovimiento) },
    { etiqueta: "Conceptos terminados", valor: String(terminados) },
    { etiqueta: "Conceptos pendientes", valor: String(pendientes) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tarjetas.map((t, i) => (
        <Card key={t.etiqueta} className="enter p-4" style={{ transitionDelay: `${i * 40}ms` }}>
          <p className="text-xs font-medium text-[var(--muted)]">{t.etiqueta}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--foreground)]">
            {t.valor}
          </p>
          {t.nota && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{t.nota}</p>}
        </Card>
      ))}
    </div>
  );
}
