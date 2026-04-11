import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { WorkOrderStatus, Priority } from "@/types";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        raised: "bg-info/10 text-info",
        triaged: "bg-info/10 text-info",
        assigned: "bg-primary/10 text-primary",
        opened: "bg-warning/10 text-warning",
        in_progress: "bg-accent text-accent-foreground",
        partially_closed: "bg-warning/20 text-warning",
        approval_pending: "bg-warning/15 text-warning",
        user_verification: "bg-warning/15 text-warning",
        rejected: "bg-destructive/10 text-destructive",
        closed: "bg-success/10 text-success",
        critical: "bg-destructive/10 text-destructive",
        high: "bg-warning/15 text-warning",
        medium: "bg-warning/10 text-warning",
        low: "bg-muted text-muted-foreground",
        active: "bg-success/10 text-success",
        inactive: "bg-muted text-muted-foreground",
        overdue: "bg-destructive/10 text-destructive",
        scheduled: "bg-info/10 text-info",
        completed: "bg-success/10 text-success",
        primary: "bg-primary/10 text-primary",
        info: "bg-info/10 text-info",
        warning: "bg-warning/10 text-warning",
        success: "bg-success/10 text-success",
        error: "bg-destructive/10 text-destructive",
        default: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface StatusBadgeProps extends VariantProps<typeof statusBadgeVariants> {
  status?: WorkOrderStatus | Priority | string;
  children?: React.ReactNode;
  className?: string;
  showDot?: boolean;
}

const statusLabels: Record<string, string> = {
  RAISED: "Raised",
  TRIAGED: "Triaged",
  ASSIGNED: "Assigned",
  OPENED: "Opened",
  IN_PROGRESS: "In Progress",
  PARTIALLY_CLOSED: "Partially Closed",
  APPROVAL_PENDING: "Submitted for Approval",
  USER_VERIFICATION: "Waiting for User Verification",
  REJECTED: "Rejected",
  CLOSED: "Completed",
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNDER_MAINTENANCE: "Under Maintenance",
  OVERDUE: "Overdue",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
};

export function StatusBadge({ status, variant, children, className, showDot = true }: StatusBadgeProps) {
  const computedVariant = variant || (status?.toLowerCase().replace(/_/g, '_') as typeof variant) || "default";
  const label = children || (status && statusLabels[status]) || status;
  
  return (
    <span className={cn(statusBadgeVariants({ variant: computedVariant }), className)}>
      {showDot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      )}
      {label}
    </span>
  );
}
