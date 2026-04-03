import { ReactNode } from "react";
import { PageHeader as LayoutPageHeader } from "@/components/layout/PageHeader";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return <LayoutPageHeader title={title} subtitle={description} actions={actions} />;
}
