import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  rows?: number;
}

export function TableSkeleton({ rows = 6 }: TableSkeletonProps) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full rounded-md" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}
