import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth/dal";
import { NuevaPasswordView } from "@/components/nueva-password-view";

// Ruta hermana de /login (fuera de (app)/(proyecto)) — mientras
// debeCambiarPassword sea true, ambos layouts protegidos redirigen aquí sin
// importar qué URL se pida, y esta pantalla nunca redirige de vuelta hacia
// ellos, así que nunca hay loop (ver app/(app)/layout.tsx,
// app/(proyecto)/control-de-obra/[id]/layout.tsx y app/master/layout.tsx).
export default async function NuevaPasswordPage() {
  const usuario = await requireSession();

  if (!usuario.debeCambiarPassword) {
    redirect(usuario.rol === "MASTER" ? "/master" : "/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <NuevaPasswordView nombre={usuario.nombre} />
    </div>
  );
}
