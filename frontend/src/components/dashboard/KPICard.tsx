import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

const kpiCardVariants = cva(
  "relative overflow-hidden rounded-xl border bg-card p-3 sm:p-4 lg:p-6 shadow-card",
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
    <div
      className={cn(
        "group relative overflow-hidden rounded-[2rem] border p-4 sm:p-5 lg:p-6",
        "border-border/80 bg-card/80 backdrop-blur-xl shadow-industrial-sm dark:bg-card/70 min-w-0",
        variant === "primary" ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent dark:from-primary/20" :
        variant === "success" ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent dark:from-emerald-500/20" :
        variant === "warning" ? "border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent dark:from-amber-500/20" :
        variant === "destructive" ? "border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-transparent dark:from-rose-500/20" :
        variant === "info" ? "border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-transparent dark:from-sky-500/20" :
        "border-border/70",
        className
      )}
    >
      <div className="relative z-10 flex flex-row items-start justify-between gap-3 min-w-0">
        <div className="flex-1 min-w-0 space-y-3 sm:space-y-4">
          <div className="space-y-1 min-w-0">
             <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground truncate w-full pr-2">
               {title}
             </p>
             <h3 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl lg:text-4xl truncate w-full">
               {value}
             </h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
             {trend && (
               <div className={cn(
                 "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase shrink-0",
                 trend.isPositive ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500"
               )}>
                 {trend.isPositive ? "+" : ""}{trend.value}%
               </div>
             )}
             {subtitle && (
               <p className="text-[10px] sm:text-[11px] font-bold text-muted-foreground truncate max-w-full">
                 {subtitle}
               </p>
             )}
          </div>
        </div>

        <div className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl",
          variant === "primary" ? "bg-primary/15 text-primary shadow-lg shadow-primary/15" :
          variant === "success" ? "bg-emerald-500/15 text-emerald-500 shadow-lg shadow-emerald-500/15" :
          variant === "warning" ? "bg-amber-500/15 text-amber-500 shadow-lg shadow-amber-500/15" :
          variant === "destructive" ? "bg-rose-500/15 text-rose-500 shadow-lg shadow-rose-500/15" :
          variant === "info" ? "bg-sky-500/15 text-sky-500 shadow-lg shadow-sky-500/15" :
          "bg-muted text-muted-foreground"
        )}>
          <Icon className="h-7 w-7" />
        </div>
      </div>
      
      {/* Dynamic Ambient Glow */}
      <div className={cn(
        "absolute -right-6 -bottom-6 h-32 w-32 rounded-full blur-3xl opacity-20 opacity-20",
        variant === "primary" ? "bg-primary" :
        variant === "success" ? "bg-emerald-500" :
        variant === "warning" ? "bg-amber-500" :
        variant === "destructive" ? "bg-rose-500" :
        variant === "info" ? "bg-sky-500" :
        "bg-slate-300"
      )} />
    </div>
  );
}
