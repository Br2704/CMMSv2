import { useState, useMemo, useEffect } from "react";
import { Search, X } from "lucide-react";
import { type ReportFormatConfigPayload } from "@/api/reportFormat";
import { useReportData } from "@/hooks/useReportData";
import type { PreviewFormat } from "./types";
import { ExcelPreview } from "./ExcelPreview";
import { PdfPreview } from "./PdfPreview";
import { CsvPreview } from "./CsvPreview";

export function ReportPreview({
  config,
  format,
}: {
  config: ReportFormatConfigPayload;
  format: PreviewFormat;
}) {
  const [previewSheetIdx, setPreviewSheetIdx] = useState(0);
  const sheets = config.sheetsConfig && config.sheetsConfig.length > 0 ? config.sheetsConfig : [];
  const activeSheet = sheets[previewSheetIdx] ?? sheets[0];
  const dataSource = activeSheet?.dataSource ?? config.reportDataSource ?? "work_orders";
  const {
    headers,
    rows: allRows,
    loading,
    error,
    page,
    totalPages,
    total,
    hasMore,
    isLoadingMore,
    loadMore,
    goToPage,
    loadProgress,
  } = useReportData(dataSource);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchColumn, setSearchColumn] = useState<string>("all");

  // Debounce search by 150ms to avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset search column when it no longer exists in the current headers
  useEffect(() => {
    if (searchColumn !== "all" && !headers.includes(searchColumn)) {
      setSearchColumn("all");
    }
  }, [headers, searchColumn]);

  const columnOptions = useMemo(() => {
    const options = [{ value: "all", label: "All Fields" }];
    if (headers.length > 0) {
      for (const h of headers) {
        options.push({ value: h, label: h });
      }
    }
    return options;
  }, [headers]);

  const filteredRows = useMemo(() => {
    if (!debouncedQuery.trim()) return allRows;
    const q = debouncedQuery.toLowerCase().trim();
    return allRows.filter((row) => {
      if (searchColumn === "all") {
        return row.some((cell) => {
          if (cell === null || cell === undefined) return false;
          return String(cell).toLowerCase().includes(q);
        });
      }
      // Find the index of the selected column header
      const colIdx = headers.indexOf(searchColumn);
      if (colIdx === -1 || colIdx >= row.length) return false;
      const cell = row[colIdx];
      if (cell === null || cell === undefined) return false;
      return String(cell).toLowerCase().includes(q);
    });
  }, [allRows, debouncedQuery, searchColumn, headers]);

  const paginationProps = {
    currentPage: page,
    totalPages,
    total,
    displayedCount: filteredRows.length,
    hasMore,
    isLoadingMore,
    onLoadMore: loadMore,
    onGoToPage: goToPage,
    loadProgress,
  };

  const hasFilter = searchQuery.trim().length > 0;

  const renderPreview = () => {
    switch (format) {
      case "excel":
        return (
          <ExcelPreview
            config={config}
            headers={headers}
            rows={filteredRows}
            loading={loading}
            error={error}
            previewSheetIdx={previewSheetIdx}
            onPreviewSheetChange={setPreviewSheetIdx}
            pagination={paginationProps}
          />
        );
      case "pdf":
        return (
          <PdfPreview
            config={config}
            headers={headers}
            rows={filteredRows}
            loading={loading}
            error={error}
            previewSheetIdx={previewSheetIdx}
            onPreviewSheetChange={setPreviewSheetIdx}
            pagination={paginationProps}
        />
        );
      case "csv":
        return (
          <CsvPreview
            config={config}
            headers={headers}
            rows={filteredRows}
            loading={loading}
            error={error}
            pagination={paginationProps}
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3">
        {/* Column selector dropdown */}
        <select
          value={searchColumn}
          onChange={(e) => setSearchColumn(e.target.value)}
          className="h-7 px-2 text-[10px] border border-[#d1d5db] rounded-md
            bg-white text-[#374151]
            focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/30
            transition-colors duration-150 cursor-pointer
            appearance-none bg-no-repeat"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='%239ca3af'%3E%3Cpath d='M0 0l5 6 5-6z'/%3E%3C/svg%3E")`,
            backgroundPosition: 'right 6px center',
            paddingRight: '20px',
          }}
          aria-label="Search in column"
        >
          {columnOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9ca3af] pointer-events-none" />
          <input
            id="report-search"
            name="reportSearch"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchColumn === "all" ? "Filter rows…" : `Filter ${searchColumn}…`}
            className="w-full h-7 pl-6 pr-7 text-[11px]
              border border-[#d1d5db] rounded-md
              bg-white
              placeholder:text-[#9ca3af]
              focus:outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]/30
              transition-colors duration-150"
          />
          {hasFilter && (
            <button
              onClick={() => {
                setSearchQuery("");
                setDebouncedQuery("");
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5
                text-[#9ca3af] hover:text-[#6b7280] hover:bg-[#f3f4f6] rounded
                transition-colors"
              aria-label="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {hasFilter && (
          <span className="text-[10px] text-[#6b7280] whitespace-nowrap">
            {filteredRows.length}{' '}
            {filteredRows.length === allRows.length ? "rows" : `of ${allRows.length} rows`}
            {searchColumn !== "all" && (
              <span className="text-[#9ca3af]"> in {searchColumn}</span>
            )}
          </span>
        )}
      </div>
      {renderPreview()}
    </div>
  );
}
