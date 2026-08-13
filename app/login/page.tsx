"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  );

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div
        className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{
          background:
            "radial-gradient(120% 140% at 0% 0%, #4338ca 0%, #1e1b4b 60%, #0f0c29 100%)",
        }}
      >
        <span className="text-lg font-semibold tracking-tight text-white">
          Conkuali
        </span>
        <div className="max-w-md">
          <p className="text-2xl font-medium leading-snug text-white/90">
            Un solo lugar para controlar avance, pagos y gastos de cada obra.
          </p>
          <p className="mt-3 text-sm text-white/50">
            Sistema interno de gestión de obra — Grupo Conkuali
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-[var(--background)] p-6">
        <Card className="enter w-full max-w-sm p-8">
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            Inicia sesión
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Ingresa con tu cuenta de Conkuali.
          </p>

          <form action={action} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
              >
                Correo
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
              >
                Contraseña
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>

            {state?.error && (
              <p className="enter rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {state.error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
