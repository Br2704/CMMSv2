import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      // Keep this client-side log only in development diagnostics.
      // eslint-disable-next-line no-console
      console.error("Unhandled UI error", error, info);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">The page crashed unexpectedly. You can retry or return to dashboard.</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Button asChild>
              <Link to="/">Dashboard</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
