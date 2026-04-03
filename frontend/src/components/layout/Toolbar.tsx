import { ReactNode } from "react";
import { FilterToolbar } from "@/components/layout/FilterToolbar";

interface ToolbarProps {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function Toolbar({ left, right, className }: ToolbarProps) {
  return <FilterToolbar left={left} right={right} className={className} />;
}
