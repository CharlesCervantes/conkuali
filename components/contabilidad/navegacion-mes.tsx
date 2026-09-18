import Link from "next/link";
import {
  type Periodo,
  periodoAnterior,
  periodoSiguiente,
  periodoAParametro,
  etiquetaPeriodo,
} from "@/lib/contabilidad/periodo";

export function NavegacionMes({ periodo, rutaBase }: { periodo: Periodo; rutaBase: string }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <Link
        href={`${rutaBase}?periodo=${periodoAParametro(periodoAnterior(periodo))}`}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        ← Mes anterior
      </Link>
      <span className="px-2 font-semibold text-[var(--foreground)] capitalize">{etiquetaPeriodo(periodo)}</span>
      <Link
        href={`${rutaBase}?periodo=${periodoAParametro(periodoSiguiente(periodo))}`}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        Mes siguiente →
      </Link>
    </div>
  );
}
