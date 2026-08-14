"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type DirtyAvanceContextValue = {
  hayCambiosSinGuardar: boolean;
  marcarPartida: (partidaId: string, dirty: boolean) => void;
  // Muestra un confirm() nativo si hace falta. Regresa true si es seguro navegar.
  confirmarSalida: () => boolean;
};

const DirtyAvanceContext = createContext<DirtyAvanceContextValue | null>(null);

const MENSAJE_CONFIRMACION =
  "Tienes cambios de avance sin guardar. Si continúas, se perderán. ¿Deseas salir de todas formas?";

// Vive en el layout del proyecto (envuelve TabNav, el back-link y las 4
// pestañas) para que cualquier navegación dentro de la ficha pueda advertir
// si hay captura de avance sin guardar — no solo la navegación semanal.
export function DirtyAvanceProvider({ children }: { children: ReactNode }) {
  const [partidasSucias, setPartidasSucias] = useState<Set<string>>(new Set());
  const hayCambiosSinGuardar = partidasSucias.size > 0;

  const marcarPartida = useCallback((partidaId: string, dirty: boolean) => {
    setPartidasSucias((prev) => {
      const siguiente = new Set(prev);
      if (dirty) siguiente.add(partidaId);
      else siguiente.delete(partidaId);
      return siguiente;
    });
  }, []);

  const confirmarSalida = useCallback(() => {
    if (!hayCambiosSinGuardar) return true;
    return window.confirm(MENSAJE_CONFIRMACION);
  }, [hayCambiosSinGuardar]);

  // Cierre de pestaña/refresh/URL nueva — no cubre navegación interna (Link),
  // eso lo resuelve confirmarSalida() en cada componente de navegación.
  useEffect(() => {
    function alIntentarCerrar(evento: BeforeUnloadEvent) {
      if (!hayCambiosSinGuardar) return;
      evento.preventDefault();
    }
    window.addEventListener("beforeunload", alIntentarCerrar);
    return () => window.removeEventListener("beforeunload", alIntentarCerrar);
  }, [hayCambiosSinGuardar]);

  return (
    <DirtyAvanceContext.Provider
      value={{ hayCambiosSinGuardar, marcarPartida, confirmarSalida }}
    >
      {children}
    </DirtyAvanceContext.Provider>
  );
}

export function useDirtyAvance(): DirtyAvanceContextValue {
  const contexto = useContext(DirtyAvanceContext);
  // Fallback seguro para cualquier árbol fuera del provider — no debería
  // ocurrir dentro de la ficha de proyecto, pero evita un crash si pasa.
  return (
    contexto ?? {
      hayCambiosSinGuardar: false,
      marcarPartida: () => {},
      confirmarSalida: () => true,
    }
  );
}
