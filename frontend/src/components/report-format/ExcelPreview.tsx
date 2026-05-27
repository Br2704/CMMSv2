import { type ReportFormatConfigPayload } from "@/api/reportFormat";
import { APP_NAME, APP_TAGLINE } from "@/config/branding";
import { FileSpreadsheet, Info, Loader2, Grid3X3 } from "lucide-react";
import { ImageCell } from "./ImageCell";
import { PaginationBar } from "./PaginationBar";
import { hexToRgba, getContrastColor } from "./types";
import { useColumnResize, DragHandle } from "./useColumnResize";

export function ExcelPreview({
  config,
  headers,
  rows,
  loading,
  error,
  previewSheetIdx,
  onPreviewSheetChange,
  pagination,
}: {
  config: ReportFormatConfigPayload;
  headers: string[];
  rows: Array<Array<unknown>>;
  loading: boolean;
  error: string | null;
  previewSheetIdx: number;
  onPreviewSheetChange: (idx: number) => void;
  pagination: {
    currentPage: number;
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
  const now = new Date().toLocaleString(locale);
  const title = config.headerTitle || APP_NAME;
  const headerWeight = config.headerBold ? "bold" : "normal";
  const headerDecor = config.headerUnderline ? "underline" : "none";
  const align = config.logoAlignment ?? "left";
  const hAlign = config.headerAlignment ?? "left";
  const rowBorderColor = hexToRgba(config.primaryColor ?? "#111827", 0.08);
  const cellBg = config.cellDefaults?.bgColor ?? "#FFFFFF";
  const cellColor = config.cellDefaults?.textColor ?? "#374151";
  const sheets = config.sheetsConfig && config.sheetsConfig.length > 0 ? config.sheetsConfig : [];
  const activeSheet = sheets[previewSheetIdx] ?? sheets[0];
  const previewCols = activeSheet?.columns?.filter((c) => c.visible !== false) ?? [];
  const colCount = Math.max(previewCols.length || 5, 1);
  const {
    getWidth,
    getResizerProps,
    isDragging,
    gridTemplateColumns,
  } = useColumnResize(colCount);

  if (error) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="flex flex-col items-center gap-1 text-[#dc2626]">
          <Info className="h-4 w-4" />
          <span className="text-xs">Failed to load data: {error}</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="flex items-center gap-2 text-[#6b7280]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans text-[11px] leading-relaxed">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f3f4f6] border-b border-[#d1d5db] text-[10px] text-[#6b7280] rounded-t-xl">
        <FileSpreadsheet className="h-3.5 w-3.5 text-[#16a34a]" />
        <span className="font-medium text-[#374151]">Report.xlsx</span>
        <div className="ml-auto flex items-center gap-3">
          <span className="tabular-nums">
            {rows.length}
            {pagination.total > 0 && (
              <span className="text-[#9ca3af]"> / {pagination.total}</span>
            )}
            <span className="text-[#9ca3af]"> rows</span>
          </span>
          <span className="text-[#9ca3af]">{now}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Header area */}
        <div
          style={{
            textAlign: hAlign === "center" ? "center" : hAlign === "right" ? "right" : "left",
          }}
          className="space-y-1"
        >
          {config.showOrganizationLogo && (
            <div
              style={{
                display: "flex",
                justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
              }}
              className="mb-1"
            >
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-white text-[7px] font-bold"
                style={{ backgroundColor: config.primaryColor ?? "#111827" }}
              >
                Logo
              </div>
            </div>
          )}
          <div
            style={{
              fontSize: `${Math.max(12, config.headerFontSize ?? 14)}px`,
              color: config.headerColor ?? "#000000",
              fontWeight: headerWeight,
              textDecoration: headerDecor,
            }}
          >
            {title}
          </div>
          {config.headerSubtitle && (
            <div className="text-[10px]" style={{ color: config.headerColor }}>
              {config.headerSubtitle}
            </div>
          )}
          {config.showGeneratedDate && (
            <div className="text-[9px] text-[#6b7280]">Generated: {now}</div>
          )}
        </div>

        {/* Sheet Tabs in Preview */}
        {sheets.length > 0 && (
          <div className="flex items-center gap-1 text-[9px] text-[#6b7280] border-b border-[#d1d5db] pb-1">
            {sheets.map((sheet, i) => (
              <div
                key={sheet.id}
                className={`px-2 py-0.5 rounded-t text-[9px] cursor-pointer transition-colors ${
                  i === previewSheetIdx
                    ? "bg-white border border-[#d1d5db] border-b-white text-[#374151] font-medium"
                    : "text-[#9ca3af] hover:text-[#6b7280]"
                }`}
                onClick={() => onPreviewSheetChange(i)}
              >
                {sheet.name}
              </div>
            ))}
          </div>
        )}

        {activeSheet && activeSheet.name && (
          <div className="text-[9px] font-semibold text-[#6b7280] uppercase tracking-wider">
            {activeSheet.name}
          </div>
        )}

        {/* Excel-style grid */}
        <div
          className="border border-[#d1d5db] rounded overflow-x-auto"
          style={{
            borderColor: hexToRgba(config.primaryColor ?? "#111827", 0.25),
            cursor: isDragging ? "col-resize" : undefined,
            userSelect: isDragging ? "none" : undefined,
          }}
        >
            <div className="min-w-full" style={{ width: `${Array.from({ length: colCount }, (_, i) => getWidth(i)).reduce((a, b) => a + b, 0)}px` }}>
          {/* Column headers */}
          <div
            className="grid"
            style={{
              backgroundColor: config.headerBgColor ?? "#000000",
              gridTemplateColumns,
            }}
          >
            {previewCols.length > 0
              ? previewCols.map((col, idx) => (
                  <div
                    key={col.key}
                    className="px-3 py-2 text-[10px] font-semibold truncate relative"
                    style={{
                      color: getContrastColor(config.headerBgColor ?? "#000000"),
                      width: getWidth(idx),
                    }}
                  >
                    {col.label}
                    {idx < colCount - 1 && <DragHandle {...getResizerProps(idx)} />}
                  </div>
                ))
              : ["WO #", "Asset", "Status", "Date", "Priority"].map((h, idx) => (
                  <div
                    key={h}
                    className="px-3 py-2 text-[10px] font-semibold truncate relative"
                    style={{
                      color: getContrastColor(config.headerBgColor ?? "#000000"),
                      width: getWidth(idx),
                    }}
                  >
                    {h}
                    {idx < colCount - 1 && <DragHandle {...getResizerProps(idx)} />}
                  </div>
                ))}
          </div>
          {/* Data rows */}
          <div className="divide-y" style={{ borderColor: rowBorderColor }}>
            {rows.map((row, i) => {
              const bgColor =
                config.showRowStriping
                  ? i % 2 === 0
                    ? cellBg
                    : hexToRgba(config.primaryColor ?? "#111827", 0.02)
                  : cellBg;
              return (
                <div
                  key={i}
                  className="grid"
                  style={{
                    backgroundColor: bgColor,
                    gridTemplateColumns,
                  }}
                >
                  {row.map((cell, j) => {
                    const colDef = previewCols[j];
                    const isImage = colDef?.dataType === "image";
                    const isDate = colDef?.dataType === "date";
                    const priorityStyle =
                      j === 4
                        ? cell === "Critical"
                          ? "text-red-600 font-semibold"
                          : cell === "High"
                            ? "text-orange-600"
                            : cell === "Medium"
                              ? "text-yellow-600"
                              : "text-gray-500"
                        : "";
                    let displayValue = cell;
                    if (isDate && typeof cell === "string") {
                      try {
                        displayValue = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(cell));
                      } catch { displayValue = cell; }
                    }
                    return (
                      <div
                        key={j}
                        className={`px-3 py-1.5 text-[10px] truncate ${priorityStyle}`}
                        style={{
                          width: getWidth(j),
                          borderRight: j < row.length - 1 ? `1px solid ${rowBorderColor}` : "none",
                          fontSize: `${config.cellDefaults?.fontSize ?? 10}px`,
                          color: cellColor,
                          textAlign: (config.cellDefaults?.alignment ?? "left") as "left" | "center" | "right" | "justify",
                        }}
                      >
                        {isImage && typeof cell === "string" && cell.startsWith("http") ? (
                          <ImageCell src={cell} alt="" />
                        ) : (
                          <>{displayValue}</>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          </div>
        </div>
        
        {/* Footer */}
        <div
          className="pt-3 space-y-0.5 border-t"
          style={{
            borderColor: hexToRgba(config.footerColor ?? "#6B7280", 0.2),
            textAlign: hAlign === "center" ? "center" : hAlign === "right" ? "right" : "left",
          }}
        >
          {config.showTamOptixBranding && (
            <div
              className="text-[9px]"
              style={{
                color: config.footerColor ?? "#6B7280",
                fontWeight: config.footerBold ? "bold" : "normal",
              }}
            >
              {config.footerSubtext || `${APP_NAME} | Intelligent CMMS Platform`}
            </div>
          )}
          <div
            className="text-[9px]"
            style={{
              color: config.footerColor ?? "#6B7280",
              fontWeight: config.footerBold ? "bold" : "normal",
            }}
          >
            {config.footerText || APP_TAGLINE}
          </div>
        </div>

        {/* Pagination bar */}
        <PaginationBar {...pagination} />

        {/* Multi-sheet bar */}
        {sheets.length > 1 && (
          <div className="flex items-center gap-1 text-[9px] text-[#6b7280] border-t border-[#d1d5db] pt-2">
            {sheets.map((sheet, i) => (
              <div
                key={sheet.id}
                className={`px-2 py-0.5 rounded-t text-[9px] ${
                  i === 0
                    ? "bg-white border border-[#d1d5db] border-b-white text-[#374151] font-medium"
                    : "text-[#9ca3af]"
                }`}
              >
                {sheet.name}
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <Grid3X3 className="h-3 w-3" />
              <span>100%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
