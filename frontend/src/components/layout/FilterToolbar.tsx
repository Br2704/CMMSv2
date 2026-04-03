import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FilterToolbarProps {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function FilterToolbar({ search, filters, actions, left, right, className }: FilterToolbarProps) {
  const resolvedLeft = left ?? (
    <>
      {search ? <div className="relative w-full sm:max-w-sm">{search}</div> : null}
      {filters}
    </>
  );

  const resolvedRight = right ?? actions;

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{resolvedLeft}</div>
      {resolvedRight ? (
        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">{resolvedRight}</div>
      ) : null}
    </div>
  );
}
