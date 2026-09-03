import { requireSession } from "@/lib/server/auth/dal";
import { listarEmpresas, listarPlanesCatalogo } from "@/lib/server/master/empresas";
import { EmpresasView } from "@/components/master/empresas-view";

export default async function MasterEmpresasPage() {
  const usuario = await requireSession();
  const [empresas, planes] = await Promise.all([
    listarEmpresas(usuario),
    listarPlanesCatalogo(usuario),
  ]);

  return (
    <div className="enter space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Empresas</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Todas las empresas dadas de alta en la plataforma.
        </p>
      </div>
      <EmpresasView empresas={empresas} planes={planes} />
    </div>
  );
}
