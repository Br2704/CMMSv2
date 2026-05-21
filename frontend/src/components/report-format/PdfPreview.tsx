import { type ReportFormatConfigPayload, type ChartConfig } from "@/api/reportFormat";
import { FilePdf, Info, Loader2, Monitor, Download } from "lucide-react";
import { ImageCell } from "./ImageCell";
import { MiniChartPreview } from "./MiniCharts";
import { PaginationBar } from "./PaginationBar";
import { hexToRgba, getContrastColor } from "./types";
import { useColumnResize, DragHandle } from "./useColumnResize";

export function PdfPreview({
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
  const now = new Date().toLocaleString(locale);
  const title = config.headerTitle || "CMMS Report";
  const headerWeight = config.headerBold ? "bold" : "normal";
  const headerDecor = config.headerUnderline ? "underline" : "none";
  const align = config.logoAlignment ?? "left";
  const hAlign = config.headerAlignment ?? "left";
  const sheets = config.sheetsConfig && config.sheetsConfig.length > 0 ? config.sheetsConfig : [];
  const activeSheet = sheets[previewSheetIdx] ?? sheets[0];
  const previewCols = activeSheet?.columns?.filter((c) => c.visible !== false) ?? [];
  const colCount = Math.max(previewCols.length || 5, 1);
  const {
    getWidth,
    getResizerProps,
    isDragging,
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
      {/* PDF viewer toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f3f4f6] border-b border-[#d1d5db] rounded-t-xl text-[10px]">
        <FilePdf className="h-3.5 w-3.5 text-[#dc2626]" />
        <span className="font-medium text-[#374151]">report.pdf</span>
        <div className="ml-auto flex items-center gap-3 text-[#6b7280]">
          <span className="tabular-nums">
            {rows.length}
            {pagination.total > 0 && (
              <span className="text-[#9ca3af]"> / {pagination.total}</span>
            )}
            <span className="text-[#9ca3af]"> rows</span>
          </span>
          <span>1 / 1</span>
          <Monitor className="h-3 w-3" />
          <Download className="h-3 w-3" />
        </div>
      </div>

      {/* PDF page surface */}
      <div className="p-4 bg-[#e5e7eb]">
        <div
          className="bg-white shadow-md mx-auto rounded-sm"
          style={{
            maxWidth: config.pageOrientation === "landscape" ? "500px" : "360px",
            minHeight: "380px",
          }}
        >
          {/* PDF Header */}
          <div
            className="px-4 py-3 border-b"
            style={{
              borderColor: hexToRgba(config.headerColor ?? "#000000", 0.2),
              borderBottomWidth: config.headerUnderline ? "2px" : "1px",
            }}
          >
            <div
              style={{
                textAlign: hAlign === "center" ? "center" : hAlign === "right" ? "right" : "left",
              }}
            >
              {config.showOrganizationLogo && (
                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start",
                  }}
                  className="mb-1.5"
                >
                  <div
                    className="w-7 h-7 rounded flex items-center justify-center text-white text-[7px] font-bold"
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
                <div className="text-[9px] mt-0.5 text-muted-foreground">{config.headerSubtitle}</div>
              )}
              {config.showGeneratedDate && (
                <div className="text-[8px] mt-1 text-[#9ca3af]">Generated: {now}</div>
              )}
            </div>
          </div>

          {/* PDF Table */}
          <div className="p-3 space-y-2">
            {sheets.length > 1 && (
              <div className="flex items-center gap-1 mb-2">
                {sheets.map((sheet, i) => (
                  <div
                    key={sheet.id}
                    className={`px-2 py-0.5 text-[8px] rounded cursor-pointer transition-colors ${
                      i === previewSheetIdx
                        ? "bg-muted font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => onPreviewSheetChange(i)}
                  >
                    {sheet.name}
                  </div>
                ))}
              </div>
            )}
            <div className="text-[9px] font-semibold text-[#6b7280] uppercase tracking-wider">
              {activeSheet?.name ?? "Data"}
            </div>
            <table
              className="w-full text-[9px] border-collapse table-fixed"
              style={{
                cursor: isDragging ? "col-resize" : undefined,
                userSelect: isDragging ? "none" : undefined,
              }}
            >
              <thead>
                <tr>
                  {previewCols.length > 0
                    ? previewCols.map((col, idx) => (
                        <th
                          key={col.key}
                          className="px-2 py-1.5 text-left font-semibold border-b text-white relative"
                          style={{
                            backgroundColor: config.headerBgColor ?? "#000000",
                            color: getContrastColor(config.headerBgColor ?? "#000000"),
                            width: getWidth(idx),
                          }}
                        >
                          {col.label}
                          {idx < colCount - 1 && <DragHandle {...getResizerProps(idx)} />}
                        </th>
                      ))
                    : ["WO #", "Asset", "Status", "Date", "Priority"].map((h, idx) => (
                        <th
                          key={h}
                          className="px-2 py-1.5 text-left font-semibold border-b text-white relative"
                          style={{
                            backgroundColor: config.headerBgColor ?? "#000000",
                            color: getContrastColor(config.headerBgColor ?? "#000000"),
                            width: getWidth(idx),
                          }}
                        >
                          {h}
                          {idx < colCount - 1 && <DragHandle {...getResizerProps(idx)} />}
                        </th>
                      ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      backgroundColor:
                        config.showRowStriping && i % 2 === 1
                          ? hexToRgba(config.primaryColor ?? "#111827", 0.02)
                          : "#ffffff",
                    }}
                  >
                    {row.map((cell, j) => {
                      const colDef = previewCols[j];
                      const isImage = colDef?.dataType === "image";
                      const isDate = colDef?.dataType === "date";
                      let displayValue = cell;
                      if (isDate && typeof cell === "string") {
                        try {
                          displayValue = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(cell));
                        } catch { displayValue = cell; }
                      }
                      return (
                        <td key={j} className="px-2 py-1 border-b border-[#f3f4f6] text-[#374151]">
                          {isImage && typeof cell === "string" && cell.startsWith("http") ? (
                            <ImageCell src={cell} alt="" />
                          ) : (
                            <>{displayValue}</>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {activeSheet?.charts && activeSheet.charts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed border-[#d1d5db]">
                <div className="text-[9px] font-semibold text-[#6b7280] uppercase tracking-wider mb-2">
                  Charts
                </div>
                {activeSheet.charts.map((chart, idx) => (
                  <div
                    key={idx}
                    className="border border-dashed border-[#d1d5db] rounded p-3"
                    style={{ height: `${Math.min(chart.height ?? 180, 200)}px` }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-medium">{chart.title || `Chart ${idx + 1}`}</span>
                      <span className="text-[7px] text-muted-foreground capitalize">{chart.type}</span>
                    </div>
                    <div className="w-full" style={{ height: 'calc(100% - 18px)' }}>
                      <MiniChartPreview chart={chart} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pagination info */}
          <div className="px-3 pb-1">
            <PaginationBar {...pagination} variant="compact" />
          </div>

          {/* PDF Footer */}
          <div
            className="px-4 py-2 mt-2 border-t text-[8px]"
            style={{
              borderColor: hexToRgba(config.footerColor ?? "#6B7280", 0.2),
              textAlign: hAlign === "center" ? "center" : hAlign === "right" ? "right" : "left",
              color: config.footerColor ?? "#6B7280",
              fontWeight: config.footerBold ? "bold" : "normal",
            }}
          >
            {config.showTamOptixBranding && <div>{config.footerSubtext}</div>}
            <div>{config.footerText}</div>
            <div className="text-[#9ca3af] mt-0.5 text-[7px]">
              Page 1 of 1 · {config.paperSize ?? "A4"} · {config.pageOrientation === "landscape" ? "Landscape" : "Portrait"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
