import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  hideOnMobile?: boolean;
  className?: string;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  mobileCard?: (item: T) => ReactNode;
  emptyMessage?: string;
  stickyHeader?: boolean;
  containerClassName?: string;
  tableClassName?: string;
  ariaLabel?: string;
  virtualizeRows?: boolean;
  virtualizationThreshold?: number;
  virtualRowHeight?: number;
  virtualOverscan?: number;
  virtualMaxHeight?: number;
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  mobileCard,
  emptyMessage = "No data found",
  stickyHeader = false,
  containerClassName,
  tableClassName,
  ariaLabel,
  virtualizeRows = false,
  virtualizationThreshold = 120,
  virtualRowHeight = 56,
  virtualOverscan = 8,
  virtualMaxHeight = 620,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(virtualMaxHeight);

  const visibleColumns = columns.filter((col) => !col.hideOnMobile || !isMobile);
  const shouldVirtualize = virtualizeRows && data.length >= virtualizationThreshold;

  useEffect(() => {
    if (!shouldVirtualize || !scrollRef.current) {
      return;
    }

    const element = scrollRef.current;
    const updateSize = () => {
      setViewportHeight(element.clientHeight || virtualMaxHeight);
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [shouldVirtualize, virtualMaxHeight]);

  const virtualWindow = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: data.length,
      };
    }

    const baseStartIndex = Math.floor(scrollTop / virtualRowHeight);
    const visibleCount = Math.ceil(Math.max(viewportHeight, virtualRowHeight) / virtualRowHeight);
    const startIndex = Math.max(0, baseStartIndex - virtualOverscan);
    const endIndex = Math.min(data.length, startIndex + visibleCount + virtualOverscan * 2);

    return { startIndex, endIndex };
  }, [data.length, scrollTop, shouldVirtualize, viewportHeight, virtualOverscan, virtualRowHeight]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {data.map((item) => (
          <div key={keyExtractor(item)}>
            {mobileCard ? mobileCard(item) : (
              <div className="rounded-lg border bg-card p-4 shadow-sm">
                <div className="space-y-2">
                  {columns.map((column) => (
                    <div key={column.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-3 text-sm">
                      <span className="min-w-0 break-words text-muted-foreground">{column.header}</span>
                      <span className="min-w-0 break-words text-right">{column.render(item)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }



  const rows = shouldVirtualize
    ? data.slice(virtualWindow.startIndex, virtualWindow.endIndex)
    : data;

  const topSpacerHeight = shouldVirtualize ? virtualWindow.startIndex * virtualRowHeight : 0;
  const bottomSpacerHeight = shouldVirtualize
    ? Math.max(0, (data.length - virtualWindow.endIndex) * virtualRowHeight)
    : 0;

  return (
    <div className={cn("table-responsive-wrapper -mx-4 sm:-mx-0", containerClassName)}>
      <div
        ref={scrollRef}
        className={cn("inline-block min-w-full align-middle px-4 sm:px-0", shouldVirtualize && "overflow-y-auto")}
        style={shouldVirtualize ? { maxHeight: `${virtualMaxHeight}px` } : undefined}
        onScroll={shouldVirtualize ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}
      >
        <Table className={cn("min-w-[920px]", tableClassName)} aria-label={ariaLabel}>
          <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-background/95 backdrop-blur") }>
            <TableRow>
              {visibleColumns.map((col) => (
                <TableHead key={col.key} className={cn("whitespace-nowrap", col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {topSpacerHeight > 0 ? (
              <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length} className="p-0" style={{ height: topSpacerHeight }} />
              </TableRow>
            ) : null}

            {rows.map((item) => (
              <TableRow key={keyExtractor(item)} className="h-12">
                {visibleColumns.map((col) => (
                  <TableCell key={col.key} className={cn("align-top", col.className)}>
                    {col.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {bottomSpacerHeight > 0 ? (
              <TableRow aria-hidden="true" className="border-0 hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length} className="p-0" style={{ height: bottomSpacerHeight }} />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
