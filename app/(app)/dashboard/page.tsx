import { requireSession } from "@/lib/server/auth/dal";
import { Card } from "@/components/ui/card";
import { NOMBRE_ROL } from "@/lib/roles";

export default async function DashboardPage() {
  const usuario = await requireSession();

  return (
    <div className="enter space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">
          Hola, {usuario.nombre.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {NOMBRE_ROL[usuario.rol] ?? usuario.rol} ·{" "}
          {usuario.empresa?.nombre ?? "Conkuali"}
        </p>
      </div>

      {!usuario.empresa && usuario.rol !== "MASTER" && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Tu cuenta no tiene una empresa asignada. Contacta a un
          administrador.
        </Card>
      )}

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Próximo paso
        </h2>
        <p className="mt-1.5 max-w-lg text-sm text-[var(--muted)]">
          El módulo de Reporte General (pagos semanales a contratistas,
          proveedores y administración) está en construcción. En cuanto esté
          listo, aparecerá en el menú de la izquierda.
        </p>
      </Card>
    </div>
  );
}
