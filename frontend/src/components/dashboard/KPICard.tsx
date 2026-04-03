import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

const kpiCardVariants = cva(
  "relative overflow-hidden rounded-xl border bg-card p-3 sm:p-4 lg:p-6 shadow-card transition-all duration-300 hover:shadow-card-hover",
  {
    variants: {
      variant: {
        default: "border-border",
        primary: "border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10",
        success: "border-success/20 bg-gradient-to-br from-success/5 to-success/10",
        warning: "border-warning/20 bg-gradient-to-br from-warning/5 to-warning/10",
        destructive: "border-destructive/20 bg-gradient-to-br from-destructive/5 to-destructive/10",
        info: "border-info/20 bg-gradient-to-br from-info/5 to-info/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const iconContainerVariants = cva(
  "flex h-9 w-9 sm:h-10 sm:w-10 lg:h-12 lg:w-12 items-center justify-center rounded-lg shrink-0",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        primary: "bg-primary/10 text-primary",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
        info: "bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface KPICardProps extends VariantProps<typeof kpiCardVariants> {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant,
  className,
}: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(kpiCardVariants({ variant }), className)}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5 sm:space-y-2">
          <p className="break-words text-xs font-medium leading-snug text-muted-foreground sm:text-sm">{title}</p>
          <div className="flex items-baseline gap-1 sm:gap-2 flex-wrap">
            <h3 className="break-words text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl">{value}</h3>
            {trend && (
              <span
                className={cn(
                  "text-xs sm:text-sm font-medium",
                  trend.isPositive ? "text-success" : "text-destructive"
                )}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="break-words text-[11px] leading-snug text-muted-foreground sm:text-xs">{subtitle}</p>
          )}
        </div>
        <div className={cn(iconContainerVariants({ variant }), "self-start sm:self-auto")}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
        </div>
      </div>
      
      {/* Decorative gradient */}
      <div className="absolute -bottom-1 -right-1 h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-transparent blur-2xl" />
    </motion.div>
  );
}
