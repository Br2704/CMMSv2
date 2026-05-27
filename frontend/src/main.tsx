import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "next-themes";
import { AppErrorBoundary } from "@/components/guards/AppErrorBoundary.tsx";
import { bootstrapMobileRuntime } from "@/mobile/runtime";
import { installGlobalErrorHandler } from "@/lib/globalErrorHandler";
import { startApiHealthMonitor } from "@/lib/apiHealth";

installGlobalErrorHandler();
bootstrapMobileRuntime();
startApiHealthMonitor();

const rootEl = document.getElementById("root");
if (rootEl) {
  try {
    createRoot(rootEl).render(
      <AppErrorBoundary>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <App />
        </ThemeProvider>
      </AppErrorBoundary>,
    );
  } catch (error) {
    // If the app fails to render entirely, show a full-screen error (safe DOM construction, no innerHTML)
    // Clear any partial React-rendered content first
    rootEl.textContent = '';

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;min-height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;font-family:sans-serif;text-align:center;background:#0f172a;color:#e2e8f0';

    const heading = document.createElement('h1');
    heading.style.cssText = 'font-size:24px;margin:0';
    heading.textContent = 'Application Error';

    const message = document.createElement('p');
    message.style.cssText = 'color:#94a3b8;margin:0';
    message.textContent = error instanceof Error ? error.message : 'Failed to initialize';

    const button = document.createElement('button');
    button.style.cssText = 'padding:8px 24px;border-radius:8px;border:none;background:#3b82f6;color:white;cursor:pointer;font-size:14px';
    button.textContent = 'Reload';
    button.addEventListener('click', () => location.reload());

    container.appendChild(heading);
    container.appendChild(message);
    container.appendChild(button);
    rootEl.appendChild(container);
  }
} else {
  // No root element found — use safe DOM construction
  const container = document.createElement('div');
  container.style.cssText = 'display:flex;min-height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px;font-family:sans-serif;text-align:center;background:#0f172a;color:#e2e8f0';

  const heading = document.createElement('h1');
  heading.style.cssText = 'font-size:24px;margin:0';
  heading.textContent = 'Application Error';

  const message = document.createElement('p');
  message.style.cssText = 'color:#94a3b8;margin:0';
  message.textContent = 'Failed to find the app container';

  container.appendChild(heading);
  container.appendChild(message);
  document.body.appendChild(container);
}
