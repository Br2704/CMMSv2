import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  sticky?: boolean;
}

export function PageHeader({ title, subtitle, description, actions, className, sticky = false }: PageHeaderProps) {
  const resolvedSubtitle = subtitle ?? description;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between",
        sticky && "sticky top-14 z-header -mx-4 rounded-xl border border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:top-16 sm:px-6",
        className,
      )}>
      <div className="min-w-0 max-w-full space-y-1.5">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">{title}</h1>
        {resolvedSubtitle ? <p className="break-words text-sm leading-relaxed text-muted-foreground sm:text-[0.95rem]">{resolvedSubtitle}</p> : null}
      </div>
      {actions ? <div className="flex w-full min-w-0 shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">{actions}</div> : null}
    </div>
  );
}
