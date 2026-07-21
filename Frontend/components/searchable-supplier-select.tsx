"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface SupplierOption {
  id: string
  name?: string
  city?: string
  state?: string
}

interface SearchableSupplierSelectProps {
  id?: string
  value: string
  suppliers: SupplierOption[]
  placeholder?: string
  disabled?: boolean
  onValueChange: (value: string) => void
}

const formatSupplierLabel = (supplier?: SupplierOption | null): string => {
  if (!supplier) return ""
  return [
    supplier.name,
    supplier.city ? `(${supplier.city})` : "",
    supplier.state ? `- ${supplier.state}` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

export function SearchableSupplierSelect({
  id,
  value,
  suppliers,
  placeholder = "Select or type supplier...",
  disabled = false,
  onValueChange,
}: SearchableSupplierSelectProps) {
  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Find the currently selected supplier
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => String(s.id) === String(value)) || null,
    [suppliers, value]
  )

  // Filter suppliers based on what user types
  const filteredSuppliers = useMemo(() => {
    const q = inputValue.toLowerCase().trim()
    if (!q) return suppliers
    return suppliers.filter((s) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.city || "").toLowerCase().includes(q) ||
      (s.state || "").toLowerCase().includes(q)
    )
  }, [suppliers, inputValue])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredSuppliers.length])

  // Close on outside click
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setIsOpen(true)
  }

  const handleSelect = (supplier: SupplierOption) => {
    onValueChange(supplier.id)
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

  const handleInputFocus = () => {
    setIsOpen(true)
    setInputValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) { setIsOpen(true); return }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, filteredSuppliers.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filteredSuppliers[highlightedIndex]) {
        handleSelect(filteredSuppliers[highlightedIndex])
      }
    } else if (e.key === "Escape") {
      setIsOpen(false)
      setInputValue("")
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`) as HTMLElement
    if (item) item.scrollIntoView({ block: "nearest" })
  }, [highlightedIndex])

  // What to show in the input when not typing
  const displayValue = isOpen ? inputValue : (selectedSupplier ? formatSupplierLabel(selectedSupplier) : "")

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Input field ── */}
      <div className={cn(
        "flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors",
        isOpen && "ring-2 ring-ring ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
      )}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          placeholder={selectedSupplier ? formatSupplierLabel(selectedSupplier) : placeholder}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {/* Clear button — only when a value is selected */}
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="mr-1 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            title="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Chevron */}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-150 flex-shrink-0",
            isOpen && "rotate-180"
          )}
        />
      </div>

      {/* ── Dropdown list ── */}
      {isOpen && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden"
        >
          {filteredSuppliers.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No supplier found.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {filteredSuppliers.map((supplier, idx) => {
                const label = formatSupplierLabel(supplier)
                const isSelected = String(supplier.id) === String(value)
                const isHighlighted = idx === highlightedIndex

                return (
                  <div
                    key={supplier.id}
                    data-index={idx}
                    onMouseDown={(e) => {
                      // Use mousedown so it fires before blur
                      e.preventDefault()
                      handleSelect(supplier)
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors",
                      isHighlighted && "bg-accent text-accent-foreground",
                      !isHighlighted && isSelected && "bg-primary/5",
                    )}
                  >
                    {/* ✅ Check mark for selected */}
                    <Check
                      className={cn(
                        "h-4 w-4 flex-shrink-0 text-primary",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{label}</span>
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