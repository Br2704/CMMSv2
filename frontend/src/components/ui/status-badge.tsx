import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { WorkOrderStatus, Priority } from "@/types";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        raised: "bg-blue-500/10 text-blue-600 border border-blue-200",
        triaged: "bg-indigo-500/10 text-indigo-600 border border-indigo-200",
        assigned: "bg-violet-500/10 text-violet-600 border border-violet-200",
        opened: "bg-amber-500/10 text-amber-600 border border-amber-200",
        in_progress: "bg-sky-500/10 text-sky-600 border border-sky-200",
        partially_closed: "bg-orange-500/10 text-orange-600 border border-orange-200",
        approval_pending: "bg-rose-500/10 text-rose-600 border border-rose-200",
        user_verification: "bg-pink-500/10 text-pink-600 border border-pink-200",
        rejected: "bg-red-500/10 text-red-600 border border-red-200",
        closed: "bg-emerald-500/10 text-emerald-600 border border-emerald-200",
        critical: "bg-red-600/10 text-red-600 border border-red-200 shadow-[0_0_8px_rgba(220,38,38,0.2)]",
        high: "bg-orange-500/10 text-orange-600 border border-orange-200",
        medium: "bg-yellow-500/10 text-yellow-600 border border-yellow-200",
        low: "bg-slate-500/10 text-slate-600 border border-slate-200",
        active: "bg-emerald-500/10 text-emerald-600 border border-emerald-200",
        inactive: "bg-slate-300/30 text-slate-500 border border-slate-200",
        overdue: "bg-red-600/10 text-red-600 border border-red-200 animate-pulse",
        scheduled: "bg-blue-500/10 text-blue-600 border border-blue-200",
        completed: "bg-emerald-500/10 text-emerald-600 border border-emerald-200",
        primary: "bg-primary/10 text-primary border border-primary/20",
        info: "bg-blue-500/10 text-blue-600 border border-blue-200",
        warning: "bg-amber-500/10 text-amber-600 border border-amber-200",
        success: "bg-emerald-500/10 text-emerald-600 border border-emerald-200",
        error: "bg-red-500/10 text-red-600 border border-red-200",
        default: "bg-slate-100 text-slate-600 border border-slate-200",
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
