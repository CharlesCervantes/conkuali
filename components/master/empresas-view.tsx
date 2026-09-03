"use client";

import { useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearEmpresaAction, type MasterFormState } from "@/app/master/actions";
import type { FilaEmpresaMaster } from "@/lib/server/master/empresas";
import { PasswordTemporalPanel } from "@/components/master/password-temporal-panel";

function iniciales(nombre: string): string {
  return nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

export function EmpresasView({
  empresas,
  planes,
}: {
  empresas: FilaEmpresaMaster[];
  planes: { id: string; nombre: string }[];
}) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="space-y-3">
      {empresas.length === 0 && !creando && (
        <Card className="p-6 text-sm text-[var(--muted)]">Todavía no hay empresas dadas de alta.</Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {empresas.map((e) => (
          <Link key={e.id} href={`/master/empresas/${e.id}`}>
            <Card className="enter flex h-full flex-col gap-3 p-5 transition-shadow duration-150 ease-out hover:shadow-md">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/[0.05]">
                  {e.logoRef ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/empresas/${e.id}/logo`}
                      alt={e.nombre}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-xs font-semibold text-[var(--brand-foreground)]"
                      style={{ backgroundColor: "var(--brand)" }}
                    >
                      {iniciales(e.nombre)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">{e.nombre}</p>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      e.activa ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {e.activa ? "Activa" : "Inactiva"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-[var(--muted)]">
                <span>{e.usuarios} usuario{e.usuarios === 1 ? "" : "s"}</span>
                <span>{e.proyectosActivos} proyecto{e.proyectosActivos === 1 ? "" : "s"} activo{e.proyectosActivos === 1 ? "" : "s"}</span>
                <span>{e.modulosHabilitados} módulo{e.modulosHabilitados === 1 ? "" : "s"} habilitado{e.modulosHabilitados === 1 ? "" : "s"}</span>
                <span>Privado: {e.privadoHabilitado ? "Sí" : "No"}</span>
              </div>

              {e.planNombre && <p className="text-xs text-[var(--muted)]">Plan {e.planNombre}</p>}
            </Card>
          </Link>
        ))}
      </div>

      {creando ? (
        <Card className="enter p-5">
          <FormularioNuevaEmpresa planes={planes} onCancelar={() => setCreando(false)} />
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-colors duration-150 ease-out hover:bg-black/[0.03]"
        >
          + Nueva empresa
        </button>
      )}
    </div>
  );
}

function FormularioNuevaEmpresa({
  planes,
  onCancelar,
}: {
  planes: { id: string; nombre: string }[];
  onCancelar: () => void;
}) {
  const [state, formAction, pending] = useActionState<MasterFormState, FormData>(
    crearEmpresaAction,
    undefined
  );

  if (state?.guardado && state.passwordTemporal) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-[var(--foreground)]">Empresa creada correctamente.</p>
        <PasswordTemporalPanel
          nombre={state.usuarioNombre ?? "el usuario"}
          password={state.passwordTemporal}
          onCerrar={onCancelar}
        />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Identidad</p>
        <Input name="nombre" placeholder="Nombre comercial" required />
        <Input name="razonSocial" placeholder="Razón social (opcional)" />
        <Input name="rfc" placeholder="RFC (opcional)" />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">Plan</p>
        <select
          name="planId"
          required
          defaultValue=""
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        >
          <option value="" disabled>
            Selecciona un plan
          </option>
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          Usuario inicial
        </p>
        <Input name="usuarioNombre" placeholder="Nombre completo" required />
        <Input name="usuarioEmail" type="email" placeholder="Correo" required />
        <select
          name="usuarioRol"
          required
          defaultValue="ADMINISTRADOR"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15"
        >
          <option value="DIRECTOR">Director</option>
          <option value="ADMINISTRADOR">Administrador</option>
          <option value="SUPERVISOR">Supervisor de campo</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear empresa"}
        </Button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-sm text-[var(--muted)] transition-colors duration-150 ease-out hover:text-[var(--foreground)]"
        >
          Cancelar
        </button>
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      </div>
    </form>
  );
}
