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
        "group relative overflow-hidden rounded-[2rem] border p-6",
        "bg-white/40 backdrop-blur-xl shadow-industrial-sm",
        variant === "primary" ? "border-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent" :
        variant === "success" ? "border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent" :
        variant === "warning" ? "border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] to-transparent" :
        variant === "destructive" ? "border-rose-500/20 bg-gradient-to-br from-rose-500/[0.08] to-transparent" :
        variant === "info" ? "border-sky-500/20 bg-gradient-to-br from-sky-500/[0.08] to-transparent" :
        "border-slate-200/60 bg-white/60",
        className
      )}
    >
      <div className="relative z-10 flex items-start justify-between">
        <div className="space-y-4">
          <div className="space-y-1">
             <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 text-slate-600">
               {title}
             </p>
             <h3 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
               {value}
             </h3>
          </div>
          
          <div className="flex items-center gap-3">
             {trend && (
               <div className={cn(
                 "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest uppercase",
                 trend.isPositive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
               )}>
                 {trend.isPositive ? "+" : ""}{trend.value}%
               </div>
             )}
             {subtitle && (
               <p className="text-[11px] font-bold text-slate-400 text-slate-500">
                 {subtitle}
               </p>
             )}
          </div>
        </div>

        <div className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl",
          variant === "primary" ? "bg-primary/10 text-primary shadow-lg shadow-primary/10" :
          variant === "success" ? "bg-emerald-500/10 text-emerald-600 shadow-lg shadow-emerald-500/10" :
          variant === "warning" ? "bg-amber-500/10 text-amber-600 shadow-lg shadow-amber-500/10" :
          variant === "destructive" ? "bg-rose-500/10 text-rose-600 shadow-lg shadow-rose-500/10" :
          variant === "info" ? "bg-sky-500/10 text-sky-600 shadow-lg shadow-sky-500/10" :
          "bg-slate-100 text-slate-500"
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
