import Link from "next/link";
import { requireSession } from "@/lib/server/auth/dal";
import { obtenerProyecto } from "@/lib/server/control-de-obra/proyectos";
import { Card } from "@/components/ui/card";
import { formatearFecha } from "@/lib/fecha";

const TIPO_LABEL: Record<string, string> = {
  FORMAL: "Obra formal",
  MOMENTANEA: "Obra momentánea",
  OFICINA: "Oficina",
};

export default async function ResumenProyectoPage({
  params,
}: PageProps<"/control-de-obra/[id]">) {
  const usuario = await requireSession();
  const { id } = await params;
  const proyecto = await obtenerProyecto(usuario, id);

  const campos: { label: string; valor: string }[] = [
    { label: "Tipo", valor: TIPO_LABEL[proyecto.tipo] ?? proyecto.tipo },
    { label: "Cliente", valor: proyecto.cliente ?? "—" },
    { label: "Ubicación", valor: proyecto.ubicacion ?? "—" },
    { label: "Número de contrato", valor: proyecto.numeroContrato ?? "—" },
    { label: "Fecha de inicio", valor: formatearFecha(proyecto.fechaInicio) },
    {
      label: "Fecha estimada de término",
      valor: formatearFecha(proyecto.fechaEstimadaTermino),
    },
    { label: "Fecha real de cierre", valor: formatearFecha(proyecto.fechaCierre) },
  ];

  return (
    <Card className="enter p-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {campos.map((c) => (
          <div key={c.label}>
            <dt className="text-xs font-medium text-[var(--muted)]">{c.label}</dt>
            <dd className="mt-0.5 text-sm text-[var(--foreground)]">{c.valor}</dd>
          </div>
        ))}
      </dl>

      {proyecto.descripcion && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <dt className="text-xs font-medium text-[var(--muted)]">Descripción</dt>
          <dd className="mt-0.5 text-sm text-[var(--foreground)]">
            {proyecto.descripcion}
          </dd>
        </div>
      )}

      {proyecto.notas && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <dt className="text-xs font-medium text-[var(--muted)]">Notas</dt>
          <dd className="mt-0.5 text-sm text-[var(--foreground)]">{proyecto.notas}</dd>
        </div>
      )}

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <Link
          href={`/control-de-obra/${id}/editar`}
          className="text-sm text-[var(--brand)] hover:underline"
        >
          Editar información general →
        </Link>
      </div>
    </Card>
  );
}
