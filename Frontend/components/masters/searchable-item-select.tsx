"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { Check, ChevronDown, X, Package2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ItemOption {
  id: string
  itemName?: string
  variant?: string
  brandName?: string
  itemGroupName?: string
}

interface SearchableItemSelectProps {
  id?: string
  value: string
  items: ItemOption[]
  placeholder?: string
  disabled?: boolean
  onValueChange: (value: string, item?: ItemOption) => void
}

export const formatItemLabel = (item?: ItemOption | null): string => {
  if (!item) return ""
  return [item.itemName, item.variant ? `· ${item.variant}` : "", item.brandName ? `(${item.brandName})` : ""]
    .filter(Boolean)
    .join(" ")
}

export function SearchableItemSelect({
  id,
  value,
  items,
  placeholder = "Search & select a product from Item Master...",
  disabled = false,
  onValueChange,
}: SearchableItemSelectProps) {
  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedItem = useMemo(
    () => items.find((it) => String(it.id) === String(value)) || null,
    [items, value]
  )

  const filteredItems = useMemo(() => {
    const q = inputValue.toLowerCase().trim()
    const base = q
      ? items.filter((it) =>
          (it.itemName || "").toLowerCase().includes(q) ||
          (it.variant || "").toLowerCase().includes(q) ||
          (it.brandName || "").toLowerCase().includes(q) ||
          (it.itemGroupName || "").toLowerCase().includes(q))
      : items
    return base.slice(0, 100) // cap the rendered list for performance
  }, [items, inputValue])

  useEffect(() => { setHighlightedIndex(0) }, [filteredItems.length])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setInputValue("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleSelect = (item: ItemOption) => {
    onValueChange(item.id, item)
    setInputValue("")
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onValueChange("")
    setInputValue("")
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) { setIsOpen(true); return }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, filteredItems.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filteredItems[highlightedIndex]) handleSelect(filteredItems[highlightedIndex])
    } else if (e.key === "Escape") {
      setIsOpen(false)
      setInputValue("")
    }
  }

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`) as HTMLElement
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [highlightedIndex])

  const displayValue = isOpen ? inputValue : (selectedItem ? formatItemLabel(selectedItem) : "")

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={cn(
        "flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors",
        isOpen && "ring-2 ring-ring ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
      )}>
        <Package2 className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          placeholder={selectedItem ? formatItemLabel(selectedItem) : placeholder}
          value={displayValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(true) }}
          onFocus={() => { setIsOpen(true); setInputValue("") }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {value && !disabled && (
          <button type="button" onClick={handleClear} className="mr-1 text-muted-foreground hover:text-foreground" tabIndex={-1} title="Clear">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0", isOpen && "rotate-180")} />
      </div>

      {isOpen && !disabled && (
        <div ref={listRef} className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">No product found.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {filteredItems.map((item, idx) => {
                const isSelected = String(item.id) === String(value)
                const isHighlighted = idx === highlightedIndex
                return (
                  <div
                    key={item.id}
                    data-index={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(item) }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors",
                      isHighlighted && "bg-red-100 text-red-800",
                      !isHighlighted && isSelected && "bg-red-50",
                    )}
                  >
                    <Check className={cn("h-4 w-4 flex-shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {item.itemName}{item.variant ? <span className="text-muted-foreground"> · {item.variant}</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.brandName, item.itemGroupName].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
