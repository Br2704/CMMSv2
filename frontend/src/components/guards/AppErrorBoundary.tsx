import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, errorMessage: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error?.message || error, info?.componentStack?.slice(0, 300) || "");
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const errorMsg = this.state.errorMessage;
    const isAuthError = errorMsg.includes("useAuthStore") || errorMsg.includes("zustand");

    return (
      <div style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "16px",
        padding: "24px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        textAlign: "center",
        background: "#0f172a",
        color: "#e2e8f0",
      }}>
        <div style={{
          width: "100%",
          maxWidth: "420px",
          padding: "32px",
          borderRadius: "12px",
          border: "1px solid #1e293b",
          background: "#1e293b",
        }}>
          <div style={{ marginBottom: "16px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#94a3b8", margin: "0 0 24px", fontSize: "14px" }}>
            {isAuthError ? "Authentication error. Please sign in again." : "The page crashed unexpectedly."}
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            <button onClick={() => window.location.reload()} style={{
              padding: "8px 24px", borderRadius: "8px", border: "1px solid #334155",
              background: "transparent", color: "#e2e8f0", cursor: "pointer", fontSize: "14px"
            }}>
              Reload
            </button>
            <button onClick={() => { window.location.href = "/"; }} style={{
              padding: "8px 24px", borderRadius: "8px", border: "none",
              background: "#3b82f6", color: "white", cursor: "pointer", fontSize: "14px", fontWeight: 500
            }}>
              Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
