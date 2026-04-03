import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AppSwitchSize = "sm" | "md";

interface AppSwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: AppSwitchSize;
  loading?: boolean;
  wrapperClassName?: string;
}

const SIZE_STYLES: Record<AppSwitchSize, { track: string; thumb: string; spinner: string }> = {
  sm: {
    track: "h-5 w-9",
    thumb: "h-4 w-4 data-[state=checked]:translate-x-4",
    spinner: "h-3 w-3",
  },
  md: {
    track: "h-6 w-11",
    thumb: "h-5 w-5 data-[state=checked]:translate-x-5",
    spinner: "h-3.5 w-3.5",
  },
};

const AppSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  AppSwitchProps
>(({ className, wrapperClassName, label, description, size = "md", loading = false, disabled, id, ...props }, ref) => {
  const generatedId = React.useId();
  const switchId = id ?? generatedId;
  const sizeStyle = SIZE_STYLES[size];

  const control = (
    <span className={cn("inline-flex min-h-11 min-w-11 items-center justify-center", !label && !description && wrapperClassName)}>
      <SwitchPrimitives.Root
        ref={ref}
        id={switchId}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border p-0.5 align-middle",
          "border-slate-300/90 bg-slate-200/85 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] transition-all duration-200 ease-out",
          "data-[state=checked]:border-primary/35 data-[state=checked]:bg-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          sizeStyle.track,
          className,
        )}
        {...props}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block rounded-full bg-white shadow-sm ring-1 ring-slate-950/5 transition-transform duration-200 ease-out",
            "data-[state=unchecked]:translate-x-0",
            sizeStyle.thumb,
            loading && "opacity-0",
          )}
        />
        {loading ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className={cn("animate-spin text-white/95", sizeStyle.spinner)} />
          </span>
        ) : null}
      </SwitchPrimitives.Root>
    </span>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between", wrapperClassName)}>
      <div className="min-w-0 space-y-1">
        {label ? (
          <Label htmlFor={switchId} className="cursor-pointer text-sm font-medium leading-none">
            {label}
          </Label>
        ) : null}
        {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {control}
    </div>
  );
});
AppSwitch.displayName = "AppSwitch";

export { AppSwitch };
