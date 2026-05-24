import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AlertTriangle, Bug, ChevronDown, ChevronUp, Trash2, X } from "lucide-react";

type LogLevel = "error" | "warn" | "info";

interface LogEntry {
  id: number;
  level: LogLevel;
  message: string;
  timestamp: Date;
  stack?: string;
}

const levelStyles: Record<LogLevel, string> = {
  error: "border-l-destructive text-destructive",
  warn: "border-l-warning text-warning",
  info: "border-l-info text-info",
};

const levelLabels: Record<LogLevel, string> = {
  error: "ERR",
  warn: "WRN",
  info: "INF",
};

export function ConsoleErrorPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const nextId = useRef(1);
  const originalConsole = useRef<{
    error: typeof console.error;
    warn: typeof console.warn;
  } | null>(null);

  const addLog = useCallback((level: LogLevel, args: unknown[]) => {
    const message = args
      .map((arg) => {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");

    const stack = args.find((arg): arg is Error => arg instanceof Error)?.stack;

    setLogs((prev) => {
      const next = [
        ...prev,
        {
          id: nextId.current++,
          level,
          message,
          timestamp: new Date(),
          stack,
        },
      ];
      // Keep last 100 entries
      return next.length > 100 ? next.slice(-100) : next;
    });
  }, []);

  useEffect(() => {
    // Save originals
    originalConsole.current = {
      error: console.error.bind(console),
      warn: console.warn.bind(console),
    };

    // Intercept console.error
    console.error = (...args: unknown[]) => {
      originalConsole.current?.error(...args);
      addLog("error", args);
    };

    // Intercept console.warn
    console.warn = (...args: unknown[]) => {
      originalConsole.current?.warn(...args);
      addLog("warn", args);
    };

    // Intercept unhandled errors
    const handleWindowError = (event: ErrorEvent) => {
      addLog("error", [event.message || "Unhandled error"]);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason
          : typeof event.reason === "string"
            ? event.reason
            : "Unhandled promise rejection";
      addLog("error", [reason]);
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      // Restore originals
      if (originalConsole.current) {
        console.error = originalConsole.current.error;
        console.warn = originalConsole.current.warn;
      }
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [addLog]);

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-20 right-3 z-[200] flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold shadow-lg transition-all sm:bottom-4 sm:right-4",
          errorCount > 0
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : warnCount > 0
              ? "bg-warning text-warning-foreground hover:bg-warning/90"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
        )}
        aria-label="Open console error panel"
      >
        <Bug className="h-4 w-4" />
        {errorCount > 0 && <span>{errorCount}</span>}
        {warnCount > 0 && <span className="opacity-70">+{warnCount}</span>}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed z-[200] flex flex-col rounded-xl border bg-card shadow-2xl transition-all",
        isMinimized
          ? "bottom-20 right-3 h-auto w-64 sm:bottom-4 sm:right-4"
          : "bottom-20 right-3 left-3 top-auto max-h-[60vh] sm:bottom-4 sm:right-4 sm:left-auto sm:w-[480px] sm:max-h-[70vh]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Console</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {logs.length}
          </span>
          {errorCount > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
              {errorCount} err
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
              {warnCount} warn
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setLogs([])}
            aria-label="Clear logs"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsMinimized((prev) => !prev)}
            aria-label={isMinimized ? "Expand panel" : "Minimize panel"}
          >
            {isMinimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsOpen(false)}
            aria-label="Close panel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Logs */}
      {!isMinimized && (
        <ScrollArea className="flex-1 min-h-0">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Bug className="mb-2 h-8 w-8 opacity-30" />
              <p className="text-sm">No console output yet</p>
              <p className="text-xs opacity-60">Errors and warnings will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    "border-l-2 px-3 py-2 text-xs",
                    levelStyles[log.level],
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-bold uppercase opacity-70">
                      {levelLabels[log.level]}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-all text-foreground/80">
                    {log.message}
                  </p>
                  {log.stack && (
                    <pre className="mt-1 max-h-20 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground/60">
                      {log.stack}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
