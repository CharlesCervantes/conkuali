"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Revelación de un solo uso — el valor solo vive en memoria de este
// componente (viene del retorno de la Server Action), nunca se persiste en
// texto plano ni se vuelve a poder consultar después de esta pantalla (ver
// generarPasswordTemporal/regenerarPasswordTemporal, lib/server/auth/service.ts).
export function PasswordTemporalPanel({
  nombre,
  password,
  onCerrar,
}: {
  nombre: string;
  password: string;
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">
        Contraseña temporal de {nombre}
      </p>
      <p className="mt-1 text-xs text-amber-800">
        Cópiala y compártela de forma segura — no volverá a mostrarse. {nombre} deberá definir
        una contraseña propia al iniciar sesión.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-mono text-amber-950 select-all">
          {password}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(password);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          }}
        >
          {copiado ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <div className="mt-3">
        <Button type="button" variant="ghost" onClick={onCerrar}>
          Entendido, ya la copié
        </Button>
      </div>
    </div>
  );
}
