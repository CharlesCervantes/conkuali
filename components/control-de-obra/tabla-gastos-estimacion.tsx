import { Card } from "@/components/ui/card";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/table";
import { formatMoney } from "@/lib/dinero";
import { aplanarGastosCobrables } from "@/lib/control-de-obra/lineas-gasto-estimacion";

// Tabla plana de conceptos cobrables — cada línea de GastoObraDetalle
// aparece directamente como fila (sin acordeón, sin "Ver detalle"), igual
// que una partida de conceptos de una estimación de obra. El GastoObra
// padre (ej. "Gastos de la semana") nunca se muestra como fila propia
// cuando tiene detalle — solo es el contenedor administrativo (Estimación
// semanal: presentación plana de gastos cobrables, agosto 2026).
export type FilaGastoTabla = {
  id: string;
  descripcion: string;
  categoria: string;
  monto: number;
  detalle: { descripcion: string; unidad: string; cantidad: number; precioUnitario: number }[];
};

export function TablaGastosEstimacion({ gastos }: { gastos: FilaGastoTabla[] }) {
  if (gastos.length === 0) return null;

  const lineas = aplanarGastosCobrables(gastos);
  const subtotal = lineas.reduce((t, l) => t + l.importe, 0);

  return (
    <Card className="enter overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-sm font-semibold text-[var(--foreground)]">Gastos de obra / Materiales</span>
        <span className="text-xs text-[var(--muted)]">
          Subtotal gastos{" "}
          <span className="tabular-nums text-[var(--foreground)]">{formatMoney(subtotal)}</span>
        </span>
      </div>
      <div className="border-t border-[var(--border)]">
        <Table>
          <Thead>
            <Tr>
              <Th className="w-[46%]">Descripción</Th>
              <Th className="w-[13%]">Unidad</Th>
              <Th className="w-[13%] text-right">Cantidad</Th>
              <Th className="w-[14%] text-right">P.U.</Th>
              <Th className="w-[14%] text-right">Importe</Th>
            </Tr>
          </Thead>
          <tbody>
            {lineas.map((l, i) => (
              <Tr key={i}>
                <Td className="text-[var(--foreground)]">{l.descripcion}</Td>
                <Td className="text-[var(--muted)]">{l.unidad}</Td>
                <Td className="text-right tabular-nums text-[var(--foreground)]">
                  {l.cantidad.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
                </Td>
                <Td className="text-right tabular-nums text-[var(--foreground)]">
                  {formatMoney(l.precioUnitario)}
                </Td>
                <Td className="text-right tabular-nums text-[var(--foreground)]">
                  {formatMoney(l.importe)}
                </Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <Tr className="border-b-0 bg-black/[0.015] font-semibold text-[var(--foreground)]">
              <Td className="text-xs" colSpan={4}>
                Subtotal gastos
              </Td>
              <Td className="text-right text-xs tabular-nums">{formatMoney(subtotal)}</Td>
            </Tr>
          </tfoot>
        </Table>
      </div>
    </Card>
  );
}
