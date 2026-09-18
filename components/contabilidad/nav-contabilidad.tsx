"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/contabilidad", label: "Resumen" },
  { href: "/contabilidad/ingresos", label: "Ingresos" },
  { href: "/contabilidad/egresos", label: "Egresos" },
  { href: "/contabilidad/facturas", label: "Facturas pendientes" },
  { href: "/contabilidad/cuentas", label: "Cuentas" },
];

export function NavContabilidad() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-[var(--border)]">
      {TABS.map((t) => {
        const activo = t.href === "/contabilidad" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out",
              activo
                ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
