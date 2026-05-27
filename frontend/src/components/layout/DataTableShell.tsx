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
    <Card className={cn("overflow-hidden shadow-card", className)}>
      <CardHeader className={cn("space-y-3 pb-3 px-4 pt-4 sm:px-6 sm:pt-6", headerClassName)}>
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
          {title ? <CardTitle className="min-w-0 text-base font-semibold sm:text-lg">{title}</CardTitle> : <div className="min-w-0" />}
          {toolbar ? <div className="w-full min-w-0 lg:w-auto">{toolbar}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4 p-0 sm:p-6", contentClassName)}>
        <div className="overflow-x-auto overscroll-x-contain">
          <div className="min-w-full align-middle">
            {children}
          </div>
        </div>
        {footer ? <div className="px-4 sm:px-0 pb-4 sm:pb-0">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
