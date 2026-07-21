"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export interface TablePaginationProps {
  /** Current page, 1-based. */
  page: number;
  /** Rows shown per page. */
  pageSize: number;
  /** Total number of rows across all pages. */
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Show the first/last (« ») jump buttons. Defaults to true. */
  showEdgeButtons?: boolean;
  /** Noun used in the count label, e.g. "items". Defaults to "items". */
  itemLabel?: string;
  className?: string;
}

/**
 * Shared list-page pagination control.
 *
 * Layout (left → right):
 *   "Rows per page: [select]"   "X-Y of Z items"   [«] [‹] Page A of B [›] [»]
 *
 * Purely presentational: the parent owns page/pageSize state and refetches on
 * change (server-side pagination), exactly like the Item Master module.
 */
export function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  showEdgeButtons = true,
  itemLabel = "items",
  className,
}: TablePaginationProps) {
  const safePageSize = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const firstRow = totalItems === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const lastRow = Math.min(currentPage * safePageSize, totalItems);

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped !== currentPage) onPageChange(clamped);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {/* Left: rows-per-page + count */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page:</span>
          <Select
            value={String(safePageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger size="sm" className="h-8 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {firstRow}-{lastRow} of {totalItems.toLocaleString()} {itemLabel}
        </span>
      </div>

      {/* Right: navigation */}
      <div className="flex items-center gap-2">
        {showEdgeButtons && (
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => goTo(1)}
            disabled={currentPage === 1}
            className="h-8 w-8 rounded-lg border-border/70 text-muted-foreground"
            aria-label="First page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-8 gap-1 rounded-lg border-border/70 px-3 text-muted-foreground"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>
        <span className="min-w-[88px] text-center text-sm font-medium whitespace-nowrap">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-8 gap-1 rounded-lg border-border/70 px-3 text-muted-foreground"
          aria-label="Next page"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {showEdgeButtons && (
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => goTo(totalPages)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 rounded-lg border-border/70 text-muted-foreground"
            aria-label="Last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default TablePagination;
