"use client";

import Link from "next/link";
import type { ReactNode, MouseEvent } from "react";
import { useDirtyAvance } from "./dirty-avance-context";

// <Link> normal, pero si hay captura de avance sin guardar (ver
// dirty-avance-context) pide confirmación nativa antes de navegar.
export function EnlaceProtegido({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const { confirmarSalida } = useDirtyAvance();

  function alHacerClick(evento: MouseEvent<HTMLAnchorElement>) {
    if (!confirmarSalida()) evento.preventDefault();
  }

  return (
    <Link href={href} className={className} onClick={alHacerClick}>
      {children}
    </Link>
  );
}
