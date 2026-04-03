import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/guards/AppErrorBoundary.tsx";
import { bootstrapMobileRuntime } from "@/mobile/runtime";

bootstrapMobileRuntime();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
