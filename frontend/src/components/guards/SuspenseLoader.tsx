import { Suspense, type ReactNode } from "react";

interface SuspenseLoaderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

const DefaultFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

export function SuspenseLoader({ children, fallback }: SuspenseLoaderProps) {
  return (
    <Suspense fallback={fallback ?? <DefaultFallback />}>
      {children}
    </Suspense>
  );
}
