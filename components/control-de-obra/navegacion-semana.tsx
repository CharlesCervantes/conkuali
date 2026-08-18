import { EnlaceProtegido } from "./enlace-protegido";

export function NavegacionSemana({
  proyectoId,
  etiquetaSemana,
  fechaAnteriorParametro,
  fechaSiguienteParametro,
}: {
  proyectoId: string;
  etiquetaSemana: string;
  fechaAnteriorParametro: string;
  fechaSiguienteParametro: string;
}) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <EnlaceProtegido
        href={`/control-de-obra/${proyectoId}/ejecucion/avance?fecha=${fechaAnteriorParametro}`}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        ← Semana anterior
      </EnlaceProtegido>
      <span className="px-2 font-semibold text-[var(--foreground)]">{etiquetaSemana}</span>
      <EnlaceProtegido
        href={`/control-de-obra/${proyectoId}/ejecucion/avance?fecha=${fechaSiguienteParametro}`}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium text-[var(--muted)] transition-colors duration-150 ease-out hover:bg-black/[0.04] hover:text-[var(--foreground)]"
      >
        Semana siguiente →
      </EnlaceProtegido>
    </div>
  );
}
