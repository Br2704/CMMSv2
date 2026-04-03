import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}

export function PageShell({ children, className, compact = false }: PageShellProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full min-w-0 max-w-[1680px]",
        compact ? "space-y-4" : "space-y-4 sm:space-y-6",
        className,
      )}
    >
      {children}
    </section>
  );
}
