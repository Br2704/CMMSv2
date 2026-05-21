import { useState, useRef, useCallback, useEffect } from "react";

const MIN_COL_WIDTH = 60;
const DEFAULT_COL_WIDTH = 120;

export interface DragHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

export interface ColumnResizeApi {
  columnWidths: Record<number, number>;
  getWidth: (index: number) => number;
  getResizerProps: (index: number) => DragHandleProps;
  isDragging: boolean;
  gridTemplateColumns: string;
}

export function useColumnResize(columnCount: number): ColumnResizeApi {
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});

  // Reset widths whenever the number of columns changes
  useEffect(() => {
    setColumnWidths({});
  }, [columnCount]);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    index: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const getWidth = useCallback(
    (index: number): number => columnWidths[index] ?? DEFAULT_COL_WIDTH,
    [columnWidths],
  );

  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        index,
        startX: e.clientX,
        startWidth: getWidth(index),
      };
      setIsDragging(true);
    },
    [getWidth],
  );

  useEffect(() => {
    if (!isDragging || !dragRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { index, startX, startWidth } = dragRef.current;
      const delta = e.clientX - startX;
      const newWidth = Math.max(MIN_COL_WIDTH, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [index]: newWidth }));
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const gridTemplateColumns = Array.from(
    { length: columnCount },
    (_, i) => `${getWidth(i)}px`,
  ).join(" ");

  const getResizerProps = useCallback(
    (index: number): DragHandleProps => ({
      onMouseDown: (e: React.MouseEvent) => handleMouseDown(index, e),
    }),
    [handleMouseDown],
  );

  return {
    columnWidths,
    getWidth,
    getResizerProps,
    isDragging,
    gridTemplateColumns,
  };
}

/** Resizable drag handle bar UI — render inside a position:relative header cell */
export function DragHandle({ onMouseDown }: DragHandleProps) {
  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-[5px] -mr-[2px] z-10
        cursor-col-resize group"
      onMouseDown={onMouseDown}
    >
      <div
        className="absolute right-[1.5px] top-1 bottom-1 w-[2px] rounded-full
          bg-transparent group-hover:bg-blue-400 group-active:bg-blue-500
          transition-colors duration-150"
      />
    </div>
  );
}
