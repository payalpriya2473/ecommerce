"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { ChevronDown, X, Package2, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ItemOption } from "@/components/masters/searchable-item-select"

interface SearchableMultiItemSelectProps {
  values: string[]
  items: ItemOption[]
  placeholder?: string
  disabled?: boolean
  onChange: (values: string[]) => void
}

/**
 * Multi-select version of the Item Master picker.
 * Selected products appear as removable chips; the dropdown adds/removes items.
 */
export function SearchableMultiItemSelect({
  values,
  items,
  placeholder = "Search & add products from Item Master...",
  disabled = false,
  onChange,
}: SearchableMultiItemSelectProps) {
  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedSet = useMemo(() => new Set(values.map(String)), [values])

  const selectedItems = useMemo(
    () => items.filter((it) => selectedSet.has(String(it.id))),
    [items, selectedSet],
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
    return base.slice(0, 100)
  }, [items, inputValue])

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

  const toggle = (id: string) => {
    if (selectedSet.has(String(id))) {
      onChange(values.filter((v) => String(v) !== String(id)))
    } else {
      onChange([...values, String(id)])
    }
  }

  const label = (it?: ItemOption) =>
    it ? [it.itemName, it.variant ? `· ${it.variant}` : "", it.brandName ? `(${it.brandName})` : ""].filter(Boolean).join(" ") : ""

  return (
    <div ref={containerRef} className="relative w-full">
      {selectedItems.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedItems.map((it) => (
            <span key={it.id} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
              {label(it)}
              <button type="button" onClick={() => toggle(String(it.id))} className="hover:text-accent/70" title="Remove">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={cn(
        "flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors",
        isOpen && "ring-2 ring-ring ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
      )}>
        <Package2 className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          autoComplete="off"
        />
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0", isOpen && "rotate-180")} />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">No product found.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {filteredItems.map((item) => {
                const isSel = selectedSet.has(String(item.id))
                return (
                  <div
                    key={item.id}
                    onMouseDown={(e) => { e.preventDefault(); toggle(String(item.id)) }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors",
                      isSel ? "bg-red-50" : "hover:bg-red-50",
                    )}
                  >
                    <Check className={cn("h-4 w-4 flex-shrink-0 text-red-600", isSel ? "opacity-100" : "opacity-0")} />
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
