import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MobileCardProps {
  children: ReactNode;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  actions?: { label: string; icon?: ReactNode; onClick: () => void }[];
}

export function MobileCard({
  children,
  onView,
  onEdit,
  onDelete,
  actions,
}: MobileCardProps) {
  const hasActions = onView || onEdit || onDelete || (actions && actions.length > 0);

  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">{children}</div>
          {hasActions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onView && (
                  <DropdownMenuItem onClick={onView}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {actions?.map((action, i) => (
                  <DropdownMenuItem key={i} onClick={action.onClick}>
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                ))}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface MobileCardRowProps {
  label: string;
  value: ReactNode;
}

export function MobileCardRow({ label, value }: MobileCardRowProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

interface MobileCardHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
}

export function MobileCardHeader({ title, subtitle, badge }: MobileCardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-semibold text-primary">{title}</p>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {badge}
    </div>
  );
}
