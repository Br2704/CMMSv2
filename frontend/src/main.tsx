import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/guards/AppErrorBoundary.tsx";
import { bootstrapMobileRuntime } from "@/mobile/runtime";
import { installGlobalErrorHandler } from "@/lib/globalErrorHandler";

installGlobalErrorHandler();
bootstrapMobileRuntime();

const rootEl = document.getElementById("root");
if (rootEl) {
  try {
    createRoot(rootEl).render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>,
    );
  } catch (error) {
    // If the app fails to render entirely, show a full-screen error
    rootEl.innerHTML = `<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;font-family:sans-serif;text-align:center;background:#0f172a;color:#e2e8f0">
      <h1 style="font-size:24px;margin:0">Application Error</h1>
      <p style="color:#94a3b8;margin:0">${error instanceof Error ? error.message : "Failed to initialize"}</p>
      <button onclick="location.reload()" style="padding:8px 24px;border-radius:8px;border:none;background:#3b82f6;color:white;cursor:pointer;font-size:14px">Reload</button>
    </div>`;
  }
} else {
  // No root element found
  document.body.innerHTML = `<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;font-family:sans-serif;text-align:center;background:#0f172a;color:#e2e8f0">
    <h1 style="font-size:24px;margin:0">Application Error</h1>
    <p style="color:#94a3b8;margin:0">Failed to find the app container</p>
  </div>`;
}
