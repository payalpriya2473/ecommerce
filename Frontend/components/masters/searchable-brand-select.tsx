"use client"
import { resolveAssetUrl } from "@/lib/asset-url"

import { useMemo, useState, useRef, useEffect } from "react"
import { Check, ChevronDown, X, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { API_BASE_URL } from "@/lib/api"

export interface BrandOption {
  id: string
  name: string
  iconUrl?: string | null
}

/** Resolve a brand's uploaded icon (relative /uploads/... path) to a full URL. */
export function toBrandIconUrl(url?: string | null): string {
  return resolveAssetUrl(url)
}

interface SearchableBrandSelectProps {
  id?: string
  value: string
  brands: BrandOption[]
  placeholder?: string
  disabled?: boolean
  onValueChange: (value: string, brand?: BrandOption) => void
}

/**
 * Single-select searchable Brand Master picker — same look, feel and
 * keyboard/click behaviour as SearchableItemSelect ("Apply to Products"),
 * but sourced from the Brands Master and shows each brand's uploaded logo.
 */
export function SearchableBrandSelect({
  id,
  value,
  brands,
  placeholder = "Search & select a brand from Brands Master...",
  disabled = false,
  onValueChange,
}: SearchableBrandSelectProps) {
  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedBrand = useMemo(
    () => brands.find((b) => String(b.id) === String(value)) || null,
    [brands, value]
  )

  const filteredBrands = useMemo(() => {
    const q = inputValue.toLowerCase().trim()
    const base = q ? brands.filter((b) => (b.name || "").toLowerCase().includes(q)) : brands
    return base.slice(0, 100)
  }, [brands, inputValue])

  useEffect(() => { setHighlightedIndex(0) }, [filteredBrands.length])

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

  const handleSelect = (brand: BrandOption) => {
    onValueChange(brand.id, brand)
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
      setHighlightedIndex((i) => Math.min(i + 1, filteredBrands.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filteredBrands[highlightedIndex]) handleSelect(filteredBrands[highlightedIndex])
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

  const displayValue = isOpen ? inputValue : (selectedBrand ? selectedBrand.name : "")

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={cn(
        "flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors",
        isOpen && "ring-2 ring-ring ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
      )}>
        {selectedBrand?.iconUrl ? (
          <img src={toBrandIconUrl(selectedBrand.iconUrl)} alt="" className="h-5 w-5 mr-2 flex-shrink-0 rounded object-contain" />
        ) : (
          <Tag className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          placeholder={selectedBrand ? selectedBrand.name : placeholder}
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
          {filteredBrands.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">No brand found.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {filteredBrands.map((brand, idx) => {
                const isSelected = String(brand.id) === String(value)
                const isHighlighted = idx === highlightedIndex
                return (
                  <div
                    key={brand.id}
                    data-index={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(brand) }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors",
                      isHighlighted && "bg-red-100 text-red-800",
                      !isHighlighted && isSelected && "bg-red-50",
                    )}
                  >
                    <Check className={cn("h-4 w-4 flex-shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                    {brand.iconUrl ? (
                      <img src={toBrandIconUrl(brand.iconUrl)} alt="" className="h-6 w-6 flex-shrink-0 rounded object-contain border border-border bg-white" />
                    ) : (
                      <div className="h-6 w-6 flex-shrink-0 rounded bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                        {brand.name?.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <p className="truncate font-medium">{brand.name}</p>
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
