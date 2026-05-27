import React from "react";

export const Skeleton: React.FC<{className?: string}> = ({ className = '' }) => {
  return (
    <div className={`animate-pulse ${className}`} aria-hidden>
      <div className="h-6 w-1/3 rounded bg-muted-foreground/20 mb-3" />
      <div className="h-48 w-full rounded bg-muted-foreground/10" />
    </div>
  );
};

export default Skeleton;
