import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface TimeAgoProps {
  date: Date | string | number;
  addSuffix?: boolean;
  fallback?: string;
}

/**
 * Renders a relative time string (e.g. "3 minutes ago") that updates every
 * 30 seconds.
 *
 * In React 18 concurrent mode (`v7_startTransition: true` in BrowserRouter),
 * text nodes that change between render passes inside a transition cause
 * error #300 ("Text content did not match"). This component keeps the
 * text stable within a 30-second window using local state + a timer,
 * preventing the mismatch.
 */
export function TimeAgo({ date, addSuffix = true, fallback = "" }: TimeAgoProps) {
  const [label, setLabel] = useState(() => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix });
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    // Immediately sync on mount (handles dates that change while component is alive)
    try {
      setLabel(formatDistanceToNow(new Date(date), { addSuffix }));
    } catch {
      setLabel(fallback);
    }

    const timer = setInterval(() => {
      try {
        setLabel(formatDistanceToNow(new Date(date), { addSuffix }));
      } catch {
        // Ignore — keep previous value
      }
    }, 30_000);

    return () => clearInterval(timer);
  }, [date, addSuffix, fallback]);

  return <>{label}</>;
}
