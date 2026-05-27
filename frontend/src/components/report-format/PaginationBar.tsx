import { useState, useRef, useEffect } from "react";
import { ChevronDown, Loader2, ArrowRight } from "lucide-react";

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  total: number;
  displayedCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** Called with the target page number when user submits a page jump */
  onGoToPage?: (page: number) => void;
  /** Optional variant: "load-more" (default) shows a button; "compact" shows minimal info */
  variant?: "load-more" | "compact";
  /** Progress value 0–1 indicating how much data has been loaded (requires known total) */
  loadProgress?: number;
}

export function PaginationBar({
  currentPage,
  totalPages,
  total,
  displayedCount,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onGoToPage,
  variant = "load-more",
  loadProgress = 0,
}: PaginationBarProps) {
  // Page-jump input state (must be before early return to satisfy Rules of Hooks)
  const [jumpValue, setJumpValue] = useState(String(currentPage));
  const [showJump, setShowJump] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input with current page when it changes externally
  useEffect(() => {
    if (!showJump) setJumpValue(String(currentPage));
  }, [currentPage, showJump]);

  useEffect(() => {
    if (showJump && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [showJump]);

  // Don't show pagination at all if there's only one page worth of data
  if (!hasMore && displayedCount === 0) return null;

  const hasKnownTotal = total > 0;
  const hasKnownPages = totalPages > 1;
  const isCompact = variant === "compact";
  const showLoadProgress = loadProgress > 0 && loadProgress < 1;

  const handleJumpSubmit = () => {
    const parsed = parseInt(jumpValue, 10);
    if (isNaN(parsed) || parsed < 1 || (hasKnownTotal && parsed > totalPages)) {
      setJumpValue(String(currentPage));
      setShowJump(false);
      return;
    }
    onGoToPage?.(parsed);
    setShowJump(false);
  };

  return (
    <div
      className={`relative ${
        isCompact ? "" : "rounded-b-xl overflow-hidden"
      }`}
    >
      {/* Progress bar */}
      {showLoadProgress && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#e5e7eb] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${Math.round(loadProgress * 100)}%`,
              backgroundColor: "#2563eb",
            }}
          />
          {/* Animated shimmer when loading more pages */}
          {isLoadingMore && (
            <div
              className="absolute top-0 h-full w-1/3 animate-pulse"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                left: `${Math.round(loadProgress * 100)}%`,
                transform: "translateX(-50%)",
              }}
            />
          )}
        </div>
      )}

      <div
        className={`flex items-center justify-between px-3 py-1.5 border-t text-[10px] text-[#6b7280] ${
          isCompact
            ? "border-[#f3f4f6] bg-transparent"
            : "border-[#d1d5db] bg-[#fafafa]"
        } ${showLoadProgress ? "pt-3" : ""}`}
      >
      <div className="flex items-center gap-2">
        <span className="font-medium tabular-nums">{displayedCount}</span>
        <span>row{displayedCount !== 1 ? "s" : ""}</span>
        {showLoadProgress && (
          <span className="text-[#2563eb] font-medium tabular-nums">
            {Math.round(loadProgress * 100)}%
          </span>
        )}
        {hasKnownTotal && total > displayedCount && !showLoadProgress && (
          <span className="text-[#9ca3af]">
            / {total} total
          </span>
        )}
        {hasKnownPages && (
          <span className="text-[#9ca3af]">
            · Page {currentPage} of {totalPages}
          </span>
        )}
        {!hasKnownTotal && displayedCount > 0 && (
          <span className="text-[#9ca3af]">· Page {currentPage}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Page-jump input — only in "load-more" variant when pages are known */}
        {!isCompact && hasKnownPages && onGoToPage && (
          <div className="flex items-center gap-1">
            {showJump ? (
              <div className="flex items-center gap-0.5">
                <input
                  id="page-jump"
                  name="pageJump"
                  ref={inputRef}
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpValue}
                  onChange={(e) => setJumpValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJumpSubmit();
                    if (e.key === "Escape") {
                      setJumpValue(String(currentPage));
                      setShowJump(false);
                    }
                  }}
                  onBlur={() => {
                    // Only hide if the value matches — otherwise treat as submit
                    if (jumpValue === String(currentPage)) {
                      setShowJump(false);
                    } else {
                      handleJumpSubmit();
                    }
                  }}
                  className="w-10 h-5 px-1 text-[10px] text-center
                    border border-[#d1d5db] rounded
                    focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/30
                    [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  aria-label="Go to page number"
                />
                <button
                  onClick={handleJumpSubmit}
                  className="inline-flex items-center justify-center w-5 h-5 rounded
                    text-[10px] text-[#2563eb] hover:text-white
                    hover:bg-[#2563eb] active:bg-[#1d4ed8]
                    transition-colors duration-150
                    border border-[#2563eb]/20 hover:border-[#2563eb]"
                  aria-label="Go to page"
                >
                  <ArrowRight className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowJump(true)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
                  text-[9px] font-medium text-[#6b7280]
                  hover:text-[#2563eb] hover:bg-[#eff6ff]
                  transition-colors duration-150"
                aria-label="Jump to page"
              >
                Go to page
              </button>
            )}
          </div>
        )}

        {/* Load More button — only shown in "load-more" variant */}
        {!isCompact && hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md
              text-[10px] font-medium
              text-[#2563eb] hover:text-white
              hover:bg-[#2563eb] active:bg-[#1d4ed8]
              transition-colors duration-150
              disabled:opacity-50 disabled:pointer-events-none
              border border-[#2563eb]/20 hover:border-[#2563eb]"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Load More
              </>
            )}
          </button>
        )}

        {isCompact && hasMore && (
          <span className="text-[#2563eb] text-[9px]">
            + Load more available
          </span>
        )}

        {!hasMore && displayedCount > 0 && (
          <span className="text-[#9ca3af] italic">All rows loaded</span>
        )}
        </div>
      </div>
    </div>
  );
}
