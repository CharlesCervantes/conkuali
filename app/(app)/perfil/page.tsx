import { requireSession } from "@/lib/server/auth/dal";
import { puedeConfigurarVistaPrivada } from "@/lib/server/permisos";
import { NOMBRE_ROL } from "@/lib/roles";
import { PerfilView } from "@/components/perfil/perfil-view";

export default async function PerfilPage() {
  const usuario = await requireSession();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Mi perfil</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Información de tu cuenta, seguridad y preferencias de privacidad.
        </p>
      </div>

      <PerfilView
        nombre={usuario.nombre}
        email={usuario.email}
        rolLabel={NOMBRE_ROL[usuario.rol] ?? usuario.rol}
        mostrarPrivacidad={puedeConfigurarVistaPrivada(usuario)}
        vistaPrivadaActivaInicial={usuario.vistaPrivadaActiva}
      />
    </div>
  );
}
