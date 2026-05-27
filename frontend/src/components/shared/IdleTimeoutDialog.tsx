// ============================================================================
// IDLE TIMEOUT WARNING DIALOG
// ============================================================================
// Modal dialog that warns the user their session is about to expire due to
// inactivity. Provides options to extend the session or logout immediately.
// ============================================================================

import { useEffect, useRef } from 'react';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface IdleTimeoutDialogProps {
  idleTimeoutMs?: number;
  warningBeforeMs?: number;
  enabled?: boolean;
}

export function IdleTimeoutDialog({
  idleTimeoutMs,
  warningBeforeMs,
  enabled = true,
}: IdleTimeoutDialogProps) {
  const { showWarning, remainingSeconds, extendSession, forceLogout } = useIdleTimeout({
    idleTimeoutMs,
    warningBeforeMs,
    enabled,
  });

  const countdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showWarning && countdownRef.current) {
      countdownRef.current.focus();
    }
  }, [showWarning]);

  return (
    <Dialog open={showWarning} onOpenChange={(open) => { if (!open) extendSession(); }}>
      <DialogContent className="sm:max-w-md" onEscapeKeyDown={(e) => { e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            Session Expiring Soon
          </DialogTitle>
          <DialogDescription className="pt-2">
            Your session will expire due to inactivity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center py-4">
          <div
            ref={countdownRef}
            tabIndex={-1}
            className="flex flex-col items-center gap-1"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="text-4xl font-bold tabular-nums text-foreground">
              {Math.max(0, remainingSeconds)}s
            </span>
            <span className="text-sm text-muted-foreground">remaining</span>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-center">
          <Button
            variant="outline"
            onClick={forceLogout}
            className="flex-1 sm:flex-none"
          >
            Logout Now
          </Button>
          <Button
            onClick={extendSession}
            className="flex-1 sm:flex-none bg-amber-600 hover:bg-amber-700 text-white"
            autoFocus
          >
            I'm Still Here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
