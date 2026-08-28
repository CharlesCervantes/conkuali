"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EstatusProyectoBadge } from "@/components/control-de-obra/estatus-proyecto-badge";
import { EnlaceProtegido } from "@/components/control-de-obra/enlace-protegido";
import { cn } from "@/lib/cn";
import type { EstatusProyecto } from "@/lib/generated/prisma/enums";
import { logout } from "../actions";

type ModuloNav = {
  clave: string;
  nombre: string;
  href: string | null;
};

type GrupoProyecto = {
  label: string;
  hrefActivo: string;
  hijos: { href: string; label: string; coincideSubrutas?: boolean }[];
};

type SidebarProps =
  | {
      variant: "global";
      empresaNombre: string;
      logoUrl: string | null;
      usuarioNombre: string;
      rolLabel: string;
      modulos: ModuloNav[];
    }
  | {
      variant: "proyecto";
      empresaNombre: string;
      logoUrl: string | null;
      usuarioNombre: string;
      rolLabel: string;
      proyecto: { id: string; nombre: string; estatus: EstatusProyecto };
      resumenHref: string;
      grupos: GrupoProyecto[];
    };

function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase())
    .join("");
}

// Un solo componente con variante global/proyecto (en vez de dos sidebars
// completos) — comparten el header de marca y el bloque de usuario/logout,
// y solo el <nav> central cambia (rediseño de navegación, agosto 2026).
export function Sidebar(props: SidebarProps) {
  const pathname = usePathname();
  const { empresaNombre, logoUrl, usuarioNombre, rolLabel } = props;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]">
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 px-5 py-5 transition-opacity duration-150 ease-out hover:opacity-80"
      >
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
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {props.variant === "global" ? (
          <>
            <NavLink href="/dashboard" active={pathname === "/dashboard"}>
              Inicio
            </NavLink>

            {props.modulos.map((modulo) =>
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
          </>
        ) : (
          <>
            <EnlaceProtegido
              href="/control-de-obra"
              className="mb-3 block text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              ← Todos los proyectos
            </EnlaceProtegido>

            <div className="px-3 pb-3">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                {props.proyecto.nombre}
              </p>
              <div className="mt-1">
                <EstatusProyectoBadge estatus={props.proyecto.estatus} />
              </div>
            </div>

            <NavLink href={props.resumenHref} active={pathname === props.resumenHref}>
              Resumen
            </NavLink>

            {props.grupos.map((grupo) => {
              const grupoActivo = pathname.startsWith(grupo.hrefActivo);
              return (
                <div key={grupo.label}>
                  <p
                    className={cn(
                      "px-3 pt-4 pb-1 text-xs font-semibold tracking-wide uppercase",
                      grupoActivo ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                    )}
                  >
                    {grupo.label}
                  </p>
                  {grupo.hijos.map((hijo) => {
                    const activo =
                      pathname === hijo.href ||
                      (hijo.coincideSubrutas && pathname.startsWith(hijo.href + "/"));
                    return (
                      <EnlaceProtegido
                        key={hijo.href}
                        href={hijo.href}
                        className={cn(
                          "block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out",
                          activo
                            ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                            : "text-[var(--foreground)] hover:bg-black/[0.04]"
                        )}
                      >
                        {hijo.label}
                      </EnlaceProtegido>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        <Link
          href="/perfil"
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 ease-out hover:bg-black/[0.04]"
        >
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
        </Link>
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
