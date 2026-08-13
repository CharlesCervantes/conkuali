"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { EnlaceProtegido } from "./enlace-protegido";

export function TabNav({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-[var(--border)]">
      {tabs.map((tab) => {
        const activo = pathname === tab.href;
        return (
          <EnlaceProtegido
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 ease-out",
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
