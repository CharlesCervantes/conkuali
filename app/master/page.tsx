import Link from "next/link";
import { requireSession } from "@/lib/server/auth/dal";
import { listarEmpresas } from "@/lib/server/master/empresas";
import { Card } from "@/components/ui/card";

export default async function MasterResumenPage() {
  const usuario = await requireSession();
  const empresas = await listarEmpresas(usuario);

  const activas = empresas.filter((e) => e.activa).length;
  const totalUsuarios = empresas.reduce((sum, e) => sum + e.usuarios, 0);
  const totalProyectosActivos = empresas.reduce((sum, e) => sum + e.proyectosActivos, 0);

  return (
    <div className="enter space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Resumen de plataforma</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Vista general de todas las empresas dadas de alta.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta etiqueta="Empresas" valor={String(empresas.length)} />
        <Tarjeta etiqueta="Activas" valor={String(activas)} />
        <Tarjeta etiqueta="Usuarios" valor={String(totalUsuarios)} />
        <Tarjeta etiqueta="Proyectos activos" valor={String(totalProyectosActivos)} />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Empresas</h2>
          <Link href="/master/empresas" className="text-sm font-medium text-[var(--brand)] hover:underline">
            Ver todas →
          </Link>
        </div>
        {empresas.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Todavía no hay empresas dadas de alta.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {empresas.slice(0, 5).map((e) => (
              <Link
                key={e.id}
                href={`/master/empresas/${e.id}`}
                className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3 text-sm transition-colors duration-150 ease-out hover:bg-black/[0.02]"
              >
                <span className="font-medium text-[var(--foreground)]">{e.nombre}</span>
                <span className={e.activa ? "text-[var(--muted)]" : "text-red-700"}>
                  {e.activa ? "Activa" : "Inactiva"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Tarjeta({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">{valor}</p>
    </Card>
  );
}
