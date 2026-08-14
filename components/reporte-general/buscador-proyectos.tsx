"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export function BuscadorProyectos({ valorInicial }: { valorInicial: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [valor, setValor] = useState(valorInicial);
  const primerRender = useRef(true);

  useEffect(() => {
    // Evita navegar al montar — solo cuando el usuario realmente escribe.
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (valor.trim()) {
        params.set("q", valor.trim());
      } else {
        params.delete("q");
      }
      router.replace(`/reporte-general?${params.toString()}`);
    }, 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <Input
      type="search"
      placeholder="Buscar proyecto o beneficiario…"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      className="w-56 py-1.5"
    />
  );
}
