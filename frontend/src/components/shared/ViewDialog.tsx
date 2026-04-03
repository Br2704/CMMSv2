import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  contentClassName?: string;
  children: ReactNode;
}

export function ViewDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  contentClassName,
  children,
}: ViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`sm:max-w-[600px] max-h-[90vh] overflow-y-auto ${contentClassName || ""}`}>
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl">{title}</DialogTitle>
              {subtitle && (
                <DialogDescription className="mt-1">{subtitle}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="mt-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

interface DetailRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function DetailRow({ label, value, className }: DetailRowProps) {
  return (
    <div className={`flex flex-col gap-1 py-2 ${className}`}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value || "-"}</span>
    </div>
  );
}

interface DetailSectionProps {
  title: string;
  children: ReactNode;
}

export function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm border-b pb-2">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">{children}</div>
    </div>
  );
}
