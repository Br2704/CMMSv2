import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DataTableShellProps {
  title?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  footer?: ReactNode;
}

export function DataTableShell({
  title,
  toolbar,
  children,
  className,
  headerClassName,
  contentClassName,
  footer,
}: DataTableShellProps) {
  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader className={cn("space-y-3 pb-3", headerClassName)}>
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
          {title ? <CardTitle className="text-base font-semibold">{title}</CardTitle> : <div />}
          {toolbar ? <div className="w-full lg:w-auto">{toolbar}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>
        <div className="overflow-x-auto">{children}</div>
        {footer ? <div>{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
