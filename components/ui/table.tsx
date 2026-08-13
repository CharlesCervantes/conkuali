import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function Thead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-black/[0.02]" {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-[var(--border)] px-3.5 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)]",
        className
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--border)] last:border-0 transition-colors duration-150 ease-out hover:bg-black/[0.015]",
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("px-3.5 py-2.5 text-[var(--foreground)]", className)}
      {...props}
    />
  );
}
