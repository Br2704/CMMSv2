import { ReactNode } from "react";
import { motion } from "framer-motion";
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
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between",
        sticky && "sticky top-14 sm:top-16 z-20 -mx-1 rounded-lg border border-border/60 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="break-words text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">{title}</h1>
        {resolvedSubtitle ? <p className="break-words text-sm leading-relaxed text-muted-foreground">{resolvedSubtitle}</p> : null}
      </div>
      {actions ? <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-stretch sm:justify-end">{actions}</div> : null}
    </motion.div>
  );
}
