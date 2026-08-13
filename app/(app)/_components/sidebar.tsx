"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { logout } from "../actions";

type ModuloNav = {
  clave: string;
  nombre: string;
  href: string | null;
};

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase())
    .join("");
}

export function Sidebar({
  empresaNombre,
  logoUrl,
  usuarioNombre,
  rolLabel,
  modulos,
}: {
  empresaNombre: string;
  logoUrl: string | null;
  usuarioNombre: string;
  rolLabel: string;
  modulos: ModuloNav[];
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2.5 px-5 py-5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={empresaNombre}
            className="h-8 w-8 rounded-md object-cover"
          />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-[var(--brand-foreground)]"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {iniciales(empresaNombre)}
          </span>
        )}
        <span className="truncate text-sm font-semibold text-[var(--foreground)]">
          {empresaNombre}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <NavLink href="/dashboard" active={pathname === "/dashboard"}>
          Inicio
        </NavLink>

        {modulos.map((modulo) =>
          modulo.href ? (
            <NavLink
              key={modulo.clave}
              href={modulo.href}
              active={pathname.startsWith(modulo.href)}
            >
              {modulo.nombre}
            </NavLink>
          ) : (
            <div
              key={modulo.clave}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--muted)]"
            >
              <span>{modulo.nombre}</span>
              <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px]">
                Próximamente
              </span>
            </div>
          )
        )}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-[var(--brand-foreground)]"
            style={{ backgroundColor: "var(--brand)" }}
          >
            {iniciales(usuarioNombre)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--foreground)]">
              {usuarioNombre}
            </p>
            <p className="truncate text-xs text-[var(--muted)]">{rolLabel}</p>
          </div>
        </div>
        <form action={logout} className="mt-1">
          <Button variant="ghost" type="submit" className="w-full justify-start">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--brand)]/10 text-[var(--brand)]"
          : "text-[var(--foreground)] hover:bg-black/[0.04]"
      )}
    >
      {children}
    </Link>
  );
}
