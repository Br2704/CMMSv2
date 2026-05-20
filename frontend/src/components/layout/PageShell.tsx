import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.2,
    },
  },
};

export function PageShell({ children, className, compact = false }: PageShellProps) {
  return (
    <motion.section
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        "mx-auto w-full min-w-0 max-w-[1680px]",
        compact ? "space-y-4" : "space-y-4 sm:space-y-6",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}
