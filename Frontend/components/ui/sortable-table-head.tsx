"use client"

import { ArrowDown } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SortDirection } from "@/lib/table-sort"
import { TableHead } from "@/components/ui/table"

export const SORTABLE_HEADER_ROW_CLASS = "bg-muted/50 hover:bg-muted/50"

interface SortableTableHeadProps {
  label: string
  active?: boolean
  direction?: SortDirection
  onClick: () => void
  className?: string
  buttonClassName?: string
}

export function SortableTableHead({
  label,
  active = false,
  direction = "asc",
  onClick,
  className,
  buttonClassName,
}: SortableTableHeadProps) {
  return (
    <TableHead className={cn("font-semibold", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 font-semibold transition-opacity hover:opacity-90",
          buttonClassName,
        )}
      >
        <span>{label}</span>
        <ArrowDown
          className={cn(
            "h-4 w-4 opacity-70",
            active && "text-amber-300 opacity-100",
            active && direction === "asc" && "rotate-180",
          )}
        />
      </button>
    </TableHead>
  )
}
