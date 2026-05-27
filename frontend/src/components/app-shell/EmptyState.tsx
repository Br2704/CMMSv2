import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, icon: Icon = Inbox, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center sm:p-10">
      <div className="mb-3 rounded-full bg-muted p-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button className="mt-4 w-full sm:w-auto" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
