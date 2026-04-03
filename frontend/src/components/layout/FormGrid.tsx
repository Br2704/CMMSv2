import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormGridProps {
  children: ReactNode;
  className?: string;
}

export function FormGrid({ children, className }: FormGridProps) {
  return <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}>{children}</div>;
}
