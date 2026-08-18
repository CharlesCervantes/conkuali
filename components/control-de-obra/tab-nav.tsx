"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { EnlaceProtegido } from "./enlace-protegido";

// `coincideSubrutas`: para pestañas que agrupan sub-rutas (p. ej. "Contrato"
// enlaza a /contrato/general pero también debe verse activa en
// /contrato/privado) — sin esto, solo hay match exacto de pathname, que
// sigue siendo lo correcto para pestañas sin hijos (Resumen, Cliente, y
// cualquier subpestaña de segundo nivel).
// `variante`: "secundaria" es el mismo componente con jerarquía visual más
// discreta (texto más chico, borde más suave) — para el segundo nivel
// (Contrato General | Contrato General Priv., Avance de obra | Contratistas)
// sin que compita visualmente con la navegación principal del proyecto.
export function TabNav({
  tabs,
  variante = "principal",
}: {
  tabs: { href: string; label: string; coincideSubrutas?: boolean }[];
  variante?: "principal" | "secundaria";
}) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex gap-1 overflow-x-auto border-b",
        variante === "principal" ? "border-[var(--border)]" : "border-[var(--border)]/60"
      )}
    >
      {tabs.map((tab) => {
        const activo =
          pathname === tab.href ||
          (tab.coincideSubrutas === true && pathname.startsWith(`${tab.href}/`));
        return (
          <EnlaceProtegido
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px shrink-0 border-b-2 font-medium transition-colors duration-150 ease-out",
              variante === "principal" ? "px-3 py-2 text-sm" : "px-2.5 py-1.5 text-xs",
              activo
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {tab.label}
          </EnlaceProtegido>
        );
      })}
    </nav>
  );
}
