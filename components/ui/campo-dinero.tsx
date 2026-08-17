"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Input de moneda (pesos): mientras se escribe se ve el número tal cual (sin
// separadores, para no pelear con el cursor); al perder el foco se reformatea
// con separador de miles y 2 decimales ("$1,500.00"). El valor que en verdad
// viaja en el <form> es el del input oculto (siempre crudo, sin comas) — el
// input visible nunca lleva `name` a propósito, para que un envío justo
// después de perder el foco no mande el texto ya formateado al servidor.
export function CampoDinero({
  name,
  defaultValue,
  placeholder,
  className,
}: {
  name: string;
  defaultValue?: number | string | null;
  placeholder?: string;
  className?: string;
}) {
  const inicial =
    defaultValue === null || defaultValue === undefined || defaultValue === ""
      ? ""
      : String(defaultValue);
  const [crudo, setCrudo] = useState(inicial);
  const [enfocado, setEnfocado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // El input visible es controlado por React, así que el form.reset() nativo
  // que React dispara solo (para los <input> sin controlar) tras una Server
  // Action no le hace nada por sí solo — sin esto, este campo se quedaría con
  // el último valor escrito mientras los demás campos del formulario sí se
  // limpian, una inconsistencia notoria. Escuchamos el evento "reset" del
  // <form> dueño y sincronizamos el estado a mano.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const alResetear = () => setCrudo(inicial);
    form.addEventListener("reset", alResetear);
    return () => form.removeEventListener("reset", alResetear);
  }, [inicial]);

  const mostrado = enfocado || crudo === "" ? crudo : formatearPesos(crudo);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={crudo} />
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-[var(--muted)]">
        $
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={mostrado}
        placeholder={placeholder}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        onChange={(e) => setCrudo(limpiar(e.target.value))}
        className={cn(
          "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pr-3.5 pl-6 text-sm text-[var(--foreground)]",
          "transition-[border-color,box-shadow] duration-150 ease-out",
          "placeholder:text-[var(--muted)]",
          "focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15",
          className
        )}
      />
    </div>
  );
}

// Solo dígitos y un único punto decimal — filtra letras, comas y signos
// (incluido "-": no se permiten precios negativos, igual que el min="0" que
// tenían los <input type="number"> que este componente reemplaza).
function limpiar(valor: string): string {
  const soloDigitosYPunto = valor.replace(/[^\d.]/g, "");
  const [entero, ...resto] = soloDigitosYPunto.split(".");
  return resto.length > 0 ? `${entero}.${resto.join("")}` : entero;
}

function formatearPesos(crudo: string): string {
  const n = Number(crudo);
  if (Number.isNaN(n)) return crudo;
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
