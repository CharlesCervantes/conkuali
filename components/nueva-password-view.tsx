"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cambiarPasswordAction, type PerfilFormState } from "@/app/(app)/perfil/actions";
import { logout } from "@/app/(app)/actions";

// Pantalla de cambio obligatorio (debeCambiarPassword=true, alta desde
// Portal Master con contraseña temporal) — mientras esta bandera siga
// activa, ambos layouts protegidos redirigen aquí sin importar la URL
// pedida; el único otro destino accesible es cerrar sesión.
export function NuevaPasswordView({ nombre }: { nombre: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<PerfilFormState, FormData>(
    cambiarPasswordAction,
    undefined
  );

  useEffect(() => {
    if (state?.guardado) router.push("/dashboard");
  }, [state?.guardado, router]);

  if (state?.guardado) {
    return (
      <Card className="w-full max-w-sm p-8 text-center text-sm text-[var(--muted)]">
        Contraseña actualizada — redirigiendo…
      </Card>
    );
  }

  return (
    <Card className="enter w-full max-w-sm p-8">
      <h1 className="text-xl font-semibold text-[var(--foreground)]">Define tu contraseña</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Hola {nombre} — tu acceso se creó con una contraseña temporal. Antes de continuar, define
        una contraseña definitiva.
      </p>

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label htmlFor="passwordActual" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Contraseña temporal
          </label>
          <Input id="passwordActual" name="passwordActual" type="password" required autoFocus />
        </div>
        <div>
          <label htmlFor="passwordNueva" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Contraseña nueva
          </label>
          <Input id="passwordNueva" name="passwordNueva" type="password" required minLength={8} />
        </div>
        <div>
          <label htmlFor="passwordConfirmar" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
            Confirmar contraseña nueva
          </label>
          <Input id="passwordConfirmar" name="passwordConfirmar" type="password" required minLength={8} />
        </div>

        {state?.error && (
          <p className="enter rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Guardando…" : "Guardar y continuar"}
        </Button>
      </form>

      <form action={logout} className="mt-3">
        <Button variant="ghost" type="submit" className="w-full justify-center">
          Cerrar sesión
        </Button>
      </form>
    </Card>
  );
}
