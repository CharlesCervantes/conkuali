import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
};

// Feedback en :active (no en hover) — es lo que hace que un botón se sienta
// presionado de verdad. scale() escala también el contenido, por eso basta
// una sola transform.
export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium",
        "transition-[transform,background-color,color,box-shadow] duration-150 ease-out",
        "active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand)]",
        variant === "primary" &&
          "bg-[var(--brand)] text-[var(--brand-foreground)] shadow-sm hover:brightness-110",
        variant === "outline" &&
          "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-black/[0.03]",
        variant === "ghost" &&
          "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/[0.04]",
        className
      )}
      {...props}
    />
  );
}
