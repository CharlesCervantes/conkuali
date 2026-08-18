import { EnlaceProtegido } from "./enlace-protegido";

// `rutaBase` es la ruta de la pestaña actual (relativa a
// /control-de-obra/{id}/) — así Avance de obra, Cliente y Cliente Priv.
// reutilizan el mismo mecanismo de navegación semanal (?fecha=) sin duplicar
// este componente, cada uno permaneciendo en su propia subpestaña al navegar
// (sección 4 del diseño de Cliente, agosto 2026).
export function NavegacionSemana({
  proyectoId,
  rutaBase = "ejecucion/avance",
  etiquetaSemana,
  fechaAnteriorParametro,
  fechaSiguienteParametro,
}: {
  proyectoId: string;
  rutaBase?: string;
  etiquetaSemana: string;
  fechaAnteriorParametro: string;
  fechaSiguienteParametro: string;
}) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <EnlaceProtegido
        href={`/control-de-obra/${proyectoId}/${rutaBase}?fecha=${fechaAnteriorParametro}`}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        ← Semana anterior
      </EnlaceProtegido>
      <span className="px-2 font-semibold text-[var(--foreground)]">{etiquetaSemana}</span>
      <EnlaceProtegido
        href={`/control-de-obra/${proyectoId}/${rutaBase}?fecha=${fechaSiguienteParametro}`}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        Semana siguiente →
      </EnlaceProtegido>
    </div>
  );
}
