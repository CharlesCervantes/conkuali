"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import type { TipoRango } from "@/lib/contabilidad/periodo";

// Solo construye la URL de navegación — ningún cálculo contable vive aquí,
// el servidor decide qué significa cada rango (lib/contabilidad/periodo.ts)
// y qué números corresponden (lib/server/contabilidad/estado-resultados.ts).

const OPCIONES_RANGO: { valor: TipoRango; etiqueta: string }[] = [
  { valor: "ESTE_MES", etiqueta: "Este mes" },
  { valor: "MES_ANTERIOR", etiqueta: "Mes anterior" },
  { valor: "TRIMESTRE", etiqueta: "Trimestre" },
  { valor: "ANIO", etiqueta: "Año" },
  { valor: "PERSONALIZADO", etiqueta: "Personalizado" },
];

export function FiltrosPeriodo({
  proyectos,
}: {
  proyectos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rangoActual = (searchParams.get("rango") as TipoRango) || "ESTE_MES";
  const proyectoActual = searchParams.get("proyecto") || "";
  const [desdePersonalizado, setDesdePersonalizado] = useState(searchParams.get("desde") || "");
  const [hastaPersonalizado, setHastaPersonalizado] = useState(searchParams.get("hasta") || "");

  function navegar(params: Record<string, string | null>) {
    const nuevos = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(params)) {
      if (valor) nuevos.set(clave, valor);
      else nuevos.delete(clave);
    }
    router.push(`${pathname}?${nuevos.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1 rounded-lg bg-black/[0.03] p-1">
        {OPCIONES_RANGO.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            onClick={() => navegar({ rango: opcion.valor, desde: null, hasta: null })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-out ${
              rangoActual === opcion.valor
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {rangoActual === "PERSONALIZADO" && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={desdePersonalizado}
            onChange={(e) => setDesdePersonalizado(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5"
          />
          <span className="text-[var(--muted)]">a</span>
          <input
            type="date"
            value={hastaPersonalizado}
            onChange={(e) => setHastaPersonalizado(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1.5"
          />
          <button
            type="button"
            onClick={() => navegar({ desde: desdePersonalizado, hasta: hastaPersonalizado })}
            disabled={!desdePersonalizado || !hastaPersonalizado}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 font-medium text-[var(--brand-foreground)] disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}

      <select
        value={proyectoActual}
        onChange={(e) => navegar({ proyecto: e.target.value || null })}
        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm"
      >
        <option value="">Toda la empresa</option>
        {proyectos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
