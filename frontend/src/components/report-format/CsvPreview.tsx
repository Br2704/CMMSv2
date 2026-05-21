import { type ReportFormatConfigPayload } from "@/api/reportFormat";
import { Table, Info, Loader2 } from "lucide-react";
import { PaginationBar } from "./PaginationBar";
import { getCsvDelimiter, escapeCsvCell } from "./types";

export function CsvPreview({
  config,
  headers,
  rows,
  loading,
  error,
  pagination,
}: {
  config: ReportFormatConfigPayload;
  headers: string[];
  rows: Array<Array<unknown>>;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
    displayedCount: number;
    hasMore: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    onGoToPage: (page: number) => void;
    loadProgress?: number;
  };
}) {
  const locale = config.reportLocale ?? "en";
  const delimiter = getCsvDelimiter(locale);
  const now = new Date().toLocaleString(locale);
  const title = config.headerTitle || "CMMS Report";

  const columns =
    (config.sheetsConfig?.[0]?.columns ?? []).filter((c) => c.visible !== false) ?? [];
  const headerLine = columns.length > 0
    ? columns.map((c) => escapeCsvCell(c.label, locale, delimiter)).join(delimiter)
    : headers.map((h) => escapeCsvCell(h, locale, delimiter)).join(delimiter);

  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1e1e2e] text-[#c0caf5] border-b border-[#334155] rounded-t-xl text-[10px]">
        <Table className="h-3.5 w-3.5 text-[#7dd3fc]" />
        <span className="font-medium">report.csv</span>
        <span className="ml-auto text-[#6b7280]">
          <span className="tabular-nums">
            {rows.length}
            {pagination.total > 0 && (
              <span> / {pagination.total}</span>
            )}
          </span>{' '}
          rows &middot; delimiter: &quot;{delimiter}&quot;
        </span>
      </div>

      <div className="p-3 bg-[#1e1e2e] text-[#c0caf5] font-mono text-[10px] leading-relaxed">
        <div className="text-[#6b7280] mb-2"># {title.toUpperCase()}</div>
        {config.headerSubtitle && (
          <div className="text-[#6b7280] mb-1"># {config.headerSubtitle}</div>
        )}
        <div className="text-[#6b7280] mb-2"># Generated: {now}</div>
        <div className="text-[#6b7280]"># --- Data (locale: {locale}, delimiter: &quot;{delimiter}&quot;) ---</div>

        <div className="text-[#7dd3fc] mt-1">{headerLine}</div>

        {error ? (
          <div className="flex items-center justify-center py-4">
            <div className="flex flex-col items-center gap-1 text-[#dc2626]">
              <Info className="h-4 w-4" />
              <span className="text-xs">Failed to load data: {error}</span>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="flex items-center gap-2 text-[#6b7280]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading data...</span>
            </div>
          </div>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="text-[#c0caf5]">
              {row.map((cell) => escapeCsvCell(cell, locale, delimiter)).join(delimiter)}
            </div>
          ))
        )}

        <PaginationBar {...pagination} variant="compact" />

        <div className="text-[#6b7280] mt-2"># --- Footer ---</div>
        {config.showTamOptixBranding && (
          <div className="text-[#6b7280]">{config.footerSubtext}</div>
        )}
        <div className="text-[#6b7280]">{config.footerText}</div>
      </div>
    </div>
  );
}
