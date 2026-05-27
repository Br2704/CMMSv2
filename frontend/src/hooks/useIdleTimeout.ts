// ============================================================================
// IDLE SESSION TIMEOUT HOOK
// ============================================================================
// Monitors user activity and triggers a warning when the session is idle for
// the configured duration. If the user does not respond, the session is
// forcibly terminated.
//
// Uses:
//   - mousedown, keydown, touchstart, scroll, wheel events for activity detection
//   - A configurable warning threshold before forced logout
//   - The auth store's logout function to terminate the session
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth.store';

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_WARNING_BEFORE_MS = 60 * 1000; // Warn 1 minute before
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'mousemove', 'focus'] as const;

interface UseIdleTimeoutOptions {
  /** Total idle time before forced logout (ms). Default: 30 min */
  idleTimeoutMs?: number;
  /** Time before timeout to show warning (ms). Default: 1 min */
  warningBeforeMs?: number;
  /** Whether idle timeout is enabled. Default: true */
  enabled?: boolean;
}

interface UseIdleTimeoutReturn {
  /** Whether the warning dialog should be shown */
  showWarning: boolean;
  /** Time remaining in seconds before forced logout */
  remainingSeconds: number;
  /** Extend the session (user clicked "I'm still here") */
  extendSession: () => void;
  /** Force logout immediately */
  forceLogout: () => void;
}

export function useIdleTimeout(options: UseIdleTimeoutOptions = {}): UseIdleTimeoutReturn {
  const {
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    warningBeforeMs = DEFAULT_WARNING_BEFORE_MS,
    enabled = true,
  } = options;

  const { isAuthenticated, logout } = useAuthStore();
  const lastActivityRef = useRef<number>(Date.now());
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (forceTimerRef.current) {
      clearTimeout(forceTimerRef.current);
      forceTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const extendSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
    setRemainingSeconds(0);
    clearAllTimers();
  }, [clearAllTimers]);

  const forceLogout = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setRemainingSeconds(0);
    void logout();
  }, [logout, clearAllTimers]);

  const handleActivity = useCallback(() => {
    if (showWarning) return; // Don't reset while warning is shown
    lastActivityRef.current = Date.now();
  }, [showWarning]);

  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      clearAllTimers();
      setShowWarning(false);
      return;
    }

    // Register activity listeners
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    // Schedule warning and force timers
    const scheduleTimers = () => {
      clearAllTimers();

      const idleDuration = idleTimeoutMs;
      const warnAt = idleDuration - warningBeforeMs;

      warningTimerRef.current = setTimeout(() => {
        setShowWarning(true);
        setRemainingSeconds(Math.ceil(warningBeforeMs / 1000));

        // Start countdown
        countdownRef.current = setInterval(() => {
          setRemainingSeconds((prev) => {
            if (prev <= 1) {
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        // Force logout after warning period
        forceTimerRef.current = setTimeout(() => {
          forceLogout();
        }, warningBeforeMs);
      }, Math.max(warnAt, 0));
    };

    // Check activity every 10 seconds and reschedule if needed
    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;

      if (elapsed >= idleTimeoutMs) {
        // Already past timeout - force logout
        forceLogout();
        return;
      }

      // If no warning is showing and timers aren't running, reschedule
      if (!showWarning && !warningTimerRef.current) {
        scheduleTimers();
      }
    }, 10000);

    scheduleTimers();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      clearInterval(checkInterval);
      clearAllTimers();
    };
  }, [enabled, isAuthenticated, idleTimeoutMs, warningBeforeMs, handleActivity, forceLogout, clearAllTimers, showWarning]);

  return {
    showWarning,
    remainingSeconds,
    extendSession,
    forceLogout,
  };
}
