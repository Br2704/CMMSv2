import { ReactNode } from "react";
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
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  mobileCard,
  emptyMessage = "No data found",
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

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
                    <div key={column.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{column.header}</span>
                      <span className="text-right">{column.render(item)}</span>
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

  const visibleColumns = columns.filter((col) => !col.hideOnMobile || !isMobile);

  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-0">
      <div className="inline-block min-w-full align-middle px-4 sm:px-0">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map((col) => (
                <TableHead key={col.key} className={cn(col.className, "whitespace-nowrap")}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={keyExtractor(item)} className="h-12">
                {visibleColumns.map((col) => (
                  <TableCell key={col.key} className={cn(col.className, "whitespace-nowrap")}>
                    {col.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
