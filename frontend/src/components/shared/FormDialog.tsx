import { ReactNode, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  isLoading?: boolean;
  submitDisabled?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  modal?: boolean;
  contentClassName?: string;
}

const sizeClasses = {
  sm: "sm:max-w-[440px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[760px]",
  xl: "sm:max-w-[980px]",
};

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel = "Save",
  isLoading = false,
  submitDisabled = false,
  size = "md",
  modal = true,
  contentClassName,
}: FormDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent
        modal={modal}
        className={`${sizeClasses[size]} w-full p-0 flex flex-col ${contentClassName || ""}`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          <DialogHeader className="px-4 sm:px-6 py-4 border-b shrink-0">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Form dialog for {title}</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <div className="p-4 sm:p-6 grid gap-4">
              {children}
            </div>
          </div>
          <DialogFooter className="px-4 sm:px-6 py-4 border-t flex-col gap-3 sm:flex-row sm:justify-end sm:space-x-2 shrink-0 bg-background/95 backdrop-blur z-10">
            <Button
              ref={cancelButtonRef}
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="min-h-11 w-full sm:w-auto font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={isLoading || submitDisabled}
              className="min-h-11 w-full sm:w-auto font-semibold gradient-primary text-primary-foreground"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
