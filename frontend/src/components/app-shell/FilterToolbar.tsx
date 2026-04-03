import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FilterToolbar as LayoutFilterToolbar } from "@/components/layout/FilterToolbar";

interface AppShellFilterToolbarProps {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function FilterToolbar({ search, filters, actions, left, right, className, children }: AppShellFilterToolbarProps) {
  return (
    <Card className="shadow-card">
      <CardContent className="py-4">
        {children ?? (
          <LayoutFilterToolbar
            search={search}
            filters={filters}
            actions={actions}
            left={left}
            right={right}
            className={className}
          />
        )}
      </CardContent>
    </Card>
  );
}
