import { FileInput } from "@/components/ui/file-input";
import type { FilaMedioFinanciero } from "@/lib/server/contabilidad/medios-financieros";

// Bloque opcional compartido por "Registrar pago"/"Registrar aportación"
// (Cliente/Cliente Priv.) — captura, en el MISMO paso, los datos que antes
// solo se podían agregar desde Contabilidad. Nunca obligatorio: si no se
// tienen todavía, el cobro se registra igual y se completan después
// (Cobros de cliente, septiembre 2026).
export function CamposFiscalesCobro({
  mediosFinancieros,
  valoresIniciales,
}: {
  mediosFinancieros: FilaMedioFinanciero[];
  valoresIniciales?: {
    cuentaReceptoraId?: string | null;
    comprobanteNombre?: string | null;
    facturaEsperada?: boolean;
  };
}) {
  return (
    <details className="rounded-lg border border-[var(--border)] px-3.5 py-2.5 open:pb-3.5">
      <summary className="cursor-pointer text-sm font-medium text-[var(--muted)]">
        Datos para Contabilidad (opcional)
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Cuenta receptora</label>
          <select
            name="cuentaReceptoraId"
            defaultValue={valoresIniciales?.cuentaReceptoraId ?? ""}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
          >
            <option value="">Sin especificar</option>
            {mediosFinancieros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--foreground)]">Comprobante</label>
          <FileInput
            name="comprobante"
            accept="image/*,application/pdf"
            className="w-full text-sm text-[var(--foreground)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand)]/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--brand)]"
          />
          {valoresIniciales?.comprobanteNombre && (
            <p className="mt-1 text-xs text-[var(--muted)]">Actual: {valoresIniciales.comprobanteNombre}</p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input
            name="facturaEsperada"
            type="checkbox"
            defaultChecked={valoresIniciales?.facturaEsperada ?? false}
            className="h-4 w-4 rounded border-[var(--border)]"
          />
          Espera factura
        </label>
      </div>
    </details>
  );
}
