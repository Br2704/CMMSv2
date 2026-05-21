import { Clock, User } from "lucide-react";

interface AuditInfoProps {
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

function formatAuditDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function AuditInfo({ createdAt, updatedAt, createdBy, updatedBy }: AuditInfoProps) {
  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        <span>Created: {formatAuditDate(createdAt)}</span>
        {createdBy && (
          <>
            <span className="mx-0.5">by</span>
            <User className="h-3 w-3" />
            <span>{createdBy}</span>
          </>
        )}
      </div>
      {updatedAt && updatedAt !== createdAt && (
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          <span>Updated: {formatAuditDate(updatedAt)}</span>
          {updatedBy && (
            <>
              <span className="mx-0.5">by</span>
              <User className="h-3 w-3" />
              <span>{updatedBy}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
