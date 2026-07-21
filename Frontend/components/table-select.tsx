"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TableSelectOption {
  id: string
  label: string
  sublabel?: string
}

interface TableSelectProps {
  value: string
  options: TableSelectOption[]
  placeholder?: string
  disabled?: boolean
  size?: "sm" | "md"
  onValueChange: (value: string) => void
}

// sid: always compare IDs as strings
const sid = (v: unknown) => String(v ?? "")

export function TableSelect({
  value, options, placeholder = "Select...", disabled = false, size = "sm", onValueChange,
}: TableSelectProps) {
  const [inputValue, setInputValue] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIdx, setHighlightedIdx] = useState(0)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selectedOption = useMemo(
    () => options.find((o) => sid(o.id) === sid(value)) || null,
    [options, value]
  )

  const filteredOptions = useMemo(() => {
    const q = inputValue.toLowerCase().trim()
    if (!q) return options
    return options.filter((o) =>
      o.label.toLowerCase().includes(q) ||
      (o.sublabel || "").toLowerCase().includes(q)
    )
  }, [options, inputValue])

  useEffect(() => { setHighlightedIdx(0) }, [filteredOptions.length])

  // Position the portal dropdown under the trigger
  const updateDropdownPosition = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, 200),
      zIndex: 99999,
    })
  }

  // Open/close
  const openDropdown = () => {
    updateDropdownPosition()
    setIsOpen(true)
    setInputValue("")
  }

  useEffect(() => {
    if (!isOpen) return
    // Close on outside click
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setIsOpen(false)
      setInputValue("")
    }
    document.addEventListener("mousedown", handler)
    // Reposition on scroll/resize
    const reposition = () => { if (isOpen) updateDropdownPosition() }
    window.addEventListener("scroll", reposition, true)
    window.addEventListener("resize", reposition)
    return () => {
      document.removeEventListener("mousedown", handler)
      window.removeEventListener("scroll", reposition, true)
      window.removeEventListener("resize", reposition)
    }
  }, [isOpen])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-tidx="${highlightedIdx}"]`) as HTMLElement
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [highlightedIdx])

  const handleSelect = (opt: TableSelectOption) => {
    onValueChange(opt.id)
    setInputValue("")
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onValueChange("")
    setInputValue("")
    setIsOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) { openDropdown(); return }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIdx((i) => Math.min(i + 1, filteredOptions.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredOptions[highlightedIdx]) handleSelect(filteredOptions[highlightedIdx]) }
    else if (e.key === "Escape") { setIsOpen(false); setInputValue("") }
  }

  // While open: show typed text. While closed: show selected label.
  const displayValue = isOpen ? inputValue : (selectedOption ? selectedOption.label : "")
  const isMedium = size === "md"

  const dropdown = isOpen ? (
    <div
      ref={listRef}
      style={dropdownStyle}
      className="rounded-md border border-border bg-popover shadow-xl overflow-hidden"
    >
      {filteredOptions.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground text-center">No results.</div>
      ) : (
        <div className="max-h-52 overflow-y-auto">
          {filteredOptions.map((opt, idx) => {
            const isSel = sid(opt.id) === sid(value)
            const isHi = idx === highlightedIdx
            return (
              <div
                key={opt.id}
                data-tidx={idx}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt) }}
                onMouseEnter={() => setHighlightedIdx(idx)}
                className={cn(
                  "flex items-center gap-2 px-3 cursor-pointer transition-colors",
                  isMedium ? "py-2.5 text-sm" : "py-2 text-xs",
                  isHi && "bg-accent text-accent-foreground",
                  !isHi && isSel && "bg-primary/5",
                )}
              >
                <Check
                  className={cn("flex-shrink-0 text-primary", isSel ? "opacity-100" : "opacity-0")}
                  style={{ width: isMedium ? 14 : 11, height: isMedium ? 14 : 11 }}
                />
                <div className="min-w-0">
                <div className={cn("truncate font-medium", isHi && "text-white")}>{opt.label}</div>
                 {opt.sublabel && (
                    <div className={cn("text-[10px] truncate", isHi ? "text-white/80" : "text-muted-foreground")}>{opt.sublabel}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  ) : null

  return (
    <>
      {/* Trigger input — lives in the table cell */}
      <div
        ref={triggerRef}
        className={cn(
          "flex items-center w-full rounded border border-transparent bg-transparent transition-colors cursor-text",
          isMedium ? "h-9 px-2 text-sm" : "h-7 px-1 text-xs",
          isOpen && "border-border/60 bg-background ring-1 ring-ring/30",
          disabled && "opacity-50 cursor-not-allowed",
        )}
        onClick={() => { if (!disabled && !isOpen) openDropdown() }}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          autoComplete="off"
          className={cn(
            "flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-0 cursor-text",
            isMedium ? "text-sm" : "text-xs"
          )}
          placeholder={selectedOption ? selectedOption.label : placeholder}
          value={displayValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            if (!isOpen) openDropdown()
            else updateDropdownPosition()
          }}
          onFocus={() => { if (!isOpen) openDropdown() }}
          onKeyDown={handleKeyDown}
        />
        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={handleClear}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mr-0.5"
          >
            <X style={{ width: isMedium ? 12 : 9, height: isMedium ? 12 : 9 }} />
          </button>
        )}
        <ChevronDown
          className={cn(
            "text-muted-foreground flex-shrink-0 transition-transform duration-150",
            isOpen && "rotate-180"
          )}
          style={{ width: isMedium ? 14 : 11, height: isMedium ? 14 : 11 }}
        />
      </div>

      {/* Portal dropdown — renders at document.body, escapes table overflow */}
      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </>
  )
}
