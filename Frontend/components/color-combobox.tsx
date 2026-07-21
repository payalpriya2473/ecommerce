"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColorOption {
  id: string;
  colorName: string;
}

interface ColorComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ColorOption[];
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function ColorCombobox({
  value,
  onChange,
  options,
  isLoading = false,
  placeholder = "e.g. Black",
  className,
}: ColorComboboxProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const normalizedValue = value.trim();
  const selectedOption = useMemo(
    () =>
      options.find(
        (option) =>
          option.colorName.toLowerCase() === normalizedValue.toLowerCase(),
      ) || null,
    [options, normalizedValue],
  );

  const filteredOptions = useMemo(() => {
    const q = inputValue.toLowerCase().trim();
    if (!q) return options;
    return options.filter((option) =>
      option.colorName.toLowerCase().includes(q),
    );
  }, [options, inputValue]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [filteredOptions.length]);

  const updateDropdownPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, 220),
      zIndex: 99999,
    });
  };

  const openDropdown = () => {
    updateDropdownPosition();
    setIsOpen(true);
    setInputValue("");
  };

  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setIsOpen(false);
      setInputValue("");
    };

    const reposition = () => {
      if (isOpen) updateDropdownPosition();
    };

    document.addEventListener("mousedown", handler);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);

    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-color-idx="${highlightedIdx}"]`,
    ) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  const handleSelect = (colorName: string) => {
    onChange(colorName);
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
    setInputValue("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      openDropdown();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((idx) => Math.min(idx + 1, filteredOptions.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((idx) => Math.max(idx - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions[highlightedIdx]) {
        handleSelect(filteredOptions[highlightedIdx].colorName);
      } else {
        onChange(inputValue.trim());
        setIsOpen(false);
      }
      return;
    }

    if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue("");
    }
  };

  const displayValue = isOpen ? inputValue : selectedOption?.colorName || value;

  const dropdown = isOpen ? (
    <div
      ref={listRef}
      style={dropdownStyle}
      className="rounded-md border border-border bg-popover shadow-xl overflow-hidden"
    >
      {isLoading ? (
        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
          Loading colors...
        </div>
      ) : filteredOptions.length === 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
          No results.
        </div>
      ) : (
        <div className="max-h-52 overflow-y-auto">
          {filteredOptions.map((option, idx) => {
            const isSelected =
              option.colorName.toLowerCase() === normalizedValue.toLowerCase();
            const isHighlighted = idx === highlightedIdx;

            return (
              <div
                key={option.id}
                data-color-idx={idx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(option.colorName);
                }}
                onMouseEnter={() => setHighlightedIdx(idx)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors",
                  isHighlighted && "bg-accent text-accent-foreground",
                  !isHighlighted && isSelected && "bg-primary/5",
                )}
              >
                <Check
                  className={cn(
                    "flex-shrink-0 text-primary",
                    isSelected ? "opacity-100" : "opacity-0",
                  )}
                  style={{ width: 11, height: 11 }}
                />
                <div className="min-w-0 flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-border/70 shrink-0"
                    style={{ backgroundColor: option.colorName.toLowerCase() }}
                  />
                  <div
                    className={cn(
                      "truncate font-medium",
                      isHighlighted && "text-white",
                    )}
                  >
                    {option.colorName}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <div
        ref={triggerRef}
        className={cn(
          "flex items-center h-8 w-full rounded border border-transparent bg-transparent px-1 text-xs transition-colors cursor-text",
          isOpen && "border-border/60 bg-background ring-1 ring-ring/30",
          isLoading && "opacity-60 cursor-not-allowed",
          className,
        )}
        onClick={() => {
          if (!isLoading && !isOpen) openDropdown();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={isLoading}
          autoComplete="off"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-xs min-w-0 cursor-text"
          placeholder={selectedOption ? selectedOption.colorName : placeholder}
          value={displayValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            onChange(e.target.value);
            if (!isOpen) openDropdown();
            else updateDropdownPosition();
          }}
          onFocus={() => {
            if (!isOpen && !isLoading) openDropdown();
          }}
          onKeyDown={handleKeyDown}
        />
        {value && !isLoading && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={handleClear}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mr-0.5"
          >
            <X style={{ width: 9, height: 9 }} />
          </button>
        )}
        <ChevronDown
          className={cn(
            "text-muted-foreground flex-shrink-0 transition-transform duration-150",
            isOpen && "rotate-180",
          )}
          style={{ width: 11, height: 11 }}
        />
      </div>

      {typeof document !== "undefined" && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </>
  );
}
