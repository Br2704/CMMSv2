import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_COUNT_KEY = "cmms:notif-dismiss-count";
const MAX_DISMISS_BEFORE_HIDE = 2;

function getDismissCount(): number {
  try {
    return Number(sessionStorage.getItem(DISMISS_COUNT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function incrementDismissCount(): number {
  const next = getDismissCount() + 1;
  try {
    sessionStorage.setItem(DISMISS_COUNT_KEY, String(next));
  } catch { /* ignore */ }
  return next;
}

export function NotificationPermission() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (getDismissCount() >= MAX_DISMISS_BEFORE_HIDE) return;
    setVisible(true);
  }, []);

  const request = async () => {
    if (!("Notification" in window)) return;
    setRequesting(true);
    try {
      await Notification.requestPermission();
      setVisible(false);
    } finally {
      setRequesting(false);
    }
  };

  const dismiss = () => {
    incrementDismissCount();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-36 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 fade-in">
      <div className="flex items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">Enable Notifications</p>
          <p className="text-xs text-muted-foreground">Get alerts for work orders & updates</p>
        </div>
        <Button size="sm" onClick={request} disabled={requesting}>
          {requesting ? "..." : "Enable"}
        </Button>
        <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
