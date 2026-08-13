import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--foreground)]",
        "transition-[border-color,box-shadow] duration-150 ease-out",
        "placeholder:text-[var(--muted)]",
        "focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15",
        className
      )}
      {...props}
    />
  );
}
