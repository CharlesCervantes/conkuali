"use client";

import { useRef, useState, type DragEvent, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type FileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  // Clase para el <div> que envuelve al <input> (no para el input mismo) —
  // solo hace falta cuando ese <div> vive dentro de un contenedor flex/grid
  // que necesita controlar cómo se dimensiona él mismo (ej. `flex-1` para
  // que crezca dentro de una fila flex), ya que ahora el <div> es el hijo
  // directo de ese contenedor, no el <input>.
  containerClassName?: string;
};

// Reemplaza cada <input type="file"> del proyecto — agrega arrastrar y
// soltar sin cambiar nada más (mismo name/accept/required/capture/className
// que ya tenía cada formulario; sigue siendo un <input> nativo normal, así
// que cualquier <form action>/FormData lo sigue leyendo igual). Un solo
// componente, no un parche por formulario (carga de archivos con
// arrastrar-y-soltar, septiembre 2026). Usa `outline` (no `border`) para el
// aviso visual al arrastrar — así nunca desplaza el layout existente de
// ningún formulario, ni siquiera 2px, cuando no se está arrastrando nada.
export function FileInput({ className, containerClassName, ...props }: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastrando(false);
    const archivo = e.dataTransfer.files?.[0];
    if (!archivo || !inputRef.current) return;

    // DataTransfer es la única forma soportada de asignarle un FileList a
    // mano a un <input type="file"> — así el archivo soltado queda
    // exactamente igual que si se hubiera elegido con el explorador (mismo
    // `name`, sin necesidad de que cada formulario maneje el drop por su
    // cuenta).
    const dt = new DataTransfer();
    dt.items.add(archivo);
    inputRef.current.files = dt.files;
    inputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={alSoltar}
      className={cn(
        "rounded-lg outline-2 outline-dashed outline-offset-2 transition-colors duration-150 ease-out",
        arrastrando ? "outline-[var(--brand)] bg-[var(--brand)]/5" : "outline-transparent",
        containerClassName
      )}
    >
      <input ref={inputRef} type="file" className={className} {...props} />
    </div>
  );
}
