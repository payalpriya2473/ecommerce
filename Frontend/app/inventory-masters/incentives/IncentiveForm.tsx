"use client";

import type React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, TrendingUp, ChevronDown, Check, X } from "lucide-react";
import { itemAPI, brandAPI, itemGroupAPI, incentiveLogAPI } from "@/lib/api";
import type { Item, Brand, ItemGroup } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface IncentiveFormValues {
  brandId: string;
  itemGroupId: string;
  itemId: string;
  effectiveDate: string;
  oldNlc: string;
  oldIncentive: string;
  oldMargin: string;
  oldOfferPrice: string;
  newNlc: string;
  newIncentive: string;
  newMargin: string;
  newOfferPrice: string;
  remarks: string;
}

export const EMPTY_INCENTIVE_FORM: IncentiveFormValues = {
  brandId: "",
  itemGroupId: "",
  itemId: "",
  effectiveDate: new Date().toISOString().split("T")[0],
  oldNlc: "",
  oldIncentive: "",
  oldMargin: "",
  oldOfferPrice: "",
  newNlc: "",
  newIncentive: "",
  newMargin: "",
  newOfferPrice: "",
  remarks: "",
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const NUMERIC_INPUT_PATTERN = /^\d*\.?\d*$/;

function isZeroLikeValue(value: string) {
  const trimmed = value.trim();
  return trimmed !== "" && NUMERIC_INPUT_PATTERN.test(trimmed) && Number(trimmed) === 0;
}

function getPricingInputDisplayValue(value: string) {
  return isZeroLikeValue(value) ? "0" : value;
}

function sanitizePricingInput(value: string) {
  if (value === "") return "";
  if (!NUMERIC_INPUT_PATTERN.test(value)) return null;
  return value.startsWith(".") ? `0${value}` : value;
}

function FL({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor} className="font-semibold text-sm text-foreground">
      {children}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );
}

// ─────────────────────────────────────────────────────────────
// InlineSelect — type-to-search dropdown
// ─────────────────────────────────────────────────────────────

interface InlineSelectOption {
  id: string;
  label: string;
}

interface InlineSelectProps {
  id?: string;
  value: string;
  options: InlineSelectOption[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}

function InlineSelect({
  id,
  value,
  options,
  disabled = false,
  onValueChange,
}: InlineSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => String(o.id) === String(value)) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = inputValue.toLowerCase().trim();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, inputValue]);

  useEffect(() => { setHighlightedIndex(0); }, [filteredOptions.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setInputValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightedIndex}"]`) as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const handleSelect = (opt: InlineSelectOption) => {
    onValueChange(opt.id);
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValueChange("");
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) { setIsOpen(true); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) handleSelect(filteredOptions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue("");
    }
  };

  const displayValue = isOpen ? inputValue : (selectedOption ? selectedOption.label : "");

  return (
    <div ref={containerRef} className="relative w-full">
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
          autoComplete="off"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          value={displayValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
          onFocus={() => { setIsOpen(true); setInputValue(""); }}
          onKeyDown={handleKeyDown}
        />
        {value && !disabled && (
          <button type="button" onClick={handleClear}
            className="mr-1 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1} title="Clear">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-150 flex-shrink-0", isOpen && "rotate-180")} />
      </div>

      {isOpen && !disabled && (
        <div ref={listRef} className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {filteredOptions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">No results found.</div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              {filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.id) === String(value);
                const isHighlighted = idx === highlightedIndex;
                return (
                  <div key={opt.id} data-idx={idx}
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 text-sm cursor-pointer transition-colors",
                      isHighlighted && "bg-accent text-accent-foreground",
                      !isHighlighted && isSelected && "bg-primary/5",
                    )}>
                    <Check className={cn("h-4 w-4 flex-shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{opt.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// DiffCell — shows ▲/▼ change inline in the table
// ─────────────────────────────────────────────────────────────

function DiffCell({ oldVal, newVal, prefix = "", suffix = "" }: {
  oldVal: string; newVal: string; prefix?: string; suffix?: string;
}) {
  const o = parseFloat(oldVal) || 0;
  const n = parseFloat(newVal) || 0;
  const diff = n - o;
  if (!newVal || Math.abs(diff) < 0.001) {
    return <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>—</span>;
  }
  const isUp = diff > 0;
  return (
    <span style={{
      fontSize: "0.72rem", fontWeight: 600,
      color: isUp ? "#16a34a" : "#dc2626",
      display: "inline-flex", alignItems: "center", gap: "2px",
    }}>
      {isUp ? "▲" : "▼"} {prefix}{Math.abs(diff).toFixed(2)}{suffix}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Pricing table row data
// ─────────────────────────────────────────────────────────────

interface PricingField {
  label: string;
  oldKey: keyof IncentiveFormValues;
  newKey: keyof IncentiveFormValues;
  prefix?: string;
  suffix?: string;
}

const PRICING_FIELDS: PricingField[] = [
  { label: "NLC",         oldKey: "oldNlc",        newKey: "newNlc",        prefix: "₹" },
  { label: "Incentive",   oldKey: "oldIncentive",  newKey: "newIncentive",  suffix: "%" },
  { label: "Margin",      oldKey: "oldMargin",     newKey: "newMargin",     suffix: "%" },
  { label: "Offer Price", oldKey: "oldOfferPrice", newKey: "newOfferPrice", prefix: "₹" },
];

// ─────────────────────────────────────────────────────────────
// Main IncentiveFormFields
// ─────────────────────────────────────────────────────────────

interface IncentiveFormFieldsProps {
  values: IncentiveFormValues;
  onChange: (updated: Partial<IncentiveFormValues>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  error: string;
  isSubmitting: boolean;
  mode: "add" | "edit";
  lockItem?: boolean;
}

export function IncentiveFormFields({
  values, onChange, onSubmit, onCancel, error, isSubmitting, mode, lockItem = false,
}: IncentiveFormFieldsProps) {
  const [brands, setBrands]               = useState<Brand[]>([]);
  const [itemGroups, setItemGroups]       = useState<ItemGroup[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems]   = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  const set = (field: keyof IncentiveFormValues, value: string) => onChange({ [field]: value });

  const handlePricingInputChange = (field: keyof IncentiveFormValues, rawValue: string) => {
    const sanitized = sanitizePricingInput(rawValue);
    if (sanitized !== null) set(field, sanitized);
  };

  const handlePricingInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    field: keyof IncentiveFormValues,
    currentValue: string
  ) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    if (!/[0-9.]/.test(e.key) || !isZeroLikeValue(currentValue)) return;

    e.preventDefault();
    set(field, e.key === "." ? "0." : e.key);
  };

  const handlePricingInputFocus = (e: React.FocusEvent<HTMLInputElement>, value: string) => {
    if (isZeroLikeValue(value)) {
      requestAnimationFrame(() => e.target.select());
    }
  };

  // Load brands & item groups on mount
  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const [bRes, gRes] = await Promise.all([
        brandAPI.getAll(token),
        itemGroupAPI.getAll(token),
      ]);
      if (bRes.success) setBrands(bRes.data);
      if (gRes.success) setItemGroups(gRes.data);
    };
    load();
  }, []);

  // When brand OR itemGroup changes, reload filtered items
  useEffect(() => {
    if (!values.brandId && !values.itemGroupId) { setFilteredItems([]); return; }
    const loadItems = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      setLoadingItems(true);
      try {
        const res = await itemAPI.getAll(token);
        if (!res.success) return;
        let items: Item[] = res.data;
        if (values.brandId)     items = items.filter((i) => i.brandId     === values.brandId);
        if (values.itemGroupId) items = items.filter((i) => i.itemGroupId === values.itemGroupId);
        setFilteredItems(items);
        if (!lockItem) {
          onChange({
            itemId: "",
            oldNlc: "", oldIncentive: "", oldMargin: "", oldOfferPrice: "",
            newNlc: "", newIncentive: "", newMargin: "", newOfferPrice: "",
          });
        }
      } finally {
        setLoadingItems(false);
      }
    };
    loadItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.brandId, values.itemGroupId]);

  // When item is selected, auto-fill OLD values from item master
  const handleItemSelect = async (itemId: string) => {
    onChange({ itemId });
    if (!itemId) return;
    setLoadingDefaults(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const res = await incentiveLogAPI.getItemDefaults(token, itemId);
      if (res.success) {
        const d = res.data;
        onChange({
          itemId,
          oldNlc:        String(d.nlc        ?? 0),
          oldIncentive:  String(d.incentive   ?? 0),
          oldMargin:     String(d.margin      ?? 0),
          oldOfferPrice: String(d.offerPrice  ?? 0),
          newNlc:        String(d.nlc        ?? 0),
          newIncentive:  String(d.incentive   ?? 0),
          newMargin:     String(d.margin      ?? 0),
          newOfferPrice: String(d.offerPrice  ?? 0),
        });
      }
    } finally {
      setLoadingDefaults(false);
    }
  };

  const selectedBrand     = brands.find((b) => b.id === values.brandId);
  const selectedItemGroup = itemGroups.find((g) => g.id === values.itemGroupId);
  const selectedItem      = filteredItems.find((i) => i.id === values.itemId);

  const showItemStep    = !!(values.brandId || values.itemGroupId);
  const showPricingStep = !!values.itemId;

  const brandOptions     = brands.map((b) => ({ id: b.id, label: b.name }));
  const itemGroupOptions = itemGroups.map((g) => ({ id: g.id, label: g.name }));
  const itemOptions      = filteredItems.map((i) => ({ id: i.id, label: i.itemName }));

  // Shared plain-input style (same pattern as PO/PI tables)
  const numInputStyle: React.CSSProperties = {
    width: "100%", height: "28px", border: "none", background: "transparent",
    outline: "none", fontSize: "0.75rem", textAlign: "right",
    padding: "0 8px", appearance: "textfield" as any,
  };

  return (
    <div className="space-y-6">

      {/* ── Step 1: Brand + Item Group ── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          Brand &amp; Item Group
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <FL required>Brand</FL>
            {lockItem ? (
              <Input value={selectedBrand?.name || values.brandId} readOnly className="bg-muted/50 cursor-not-allowed" />
            ) : (
              <InlineSelect value={values.brandId} options={brandOptions}
                onValueChange={(v) => onChange({ brandId: v })} />
            )}
          </div>
          <div className="space-y-2">
            <FL required>Item Group</FL>
            {lockItem ? (
              <Input value={selectedItemGroup?.name || values.itemGroupId} readOnly className="bg-muted/50 cursor-not-allowed" />
            ) : (
              <InlineSelect value={values.itemGroupId} options={itemGroupOptions}
                onValueChange={(v) => onChange({ itemGroupId: v })} />
            )}
          </div>
        </div>
      </div>

      {/* ── Step 2: Item + Date ── */}
      {showItemStep && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg border-b pb-2">Item &amp; Effective Date</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FL required>Item Name</FL>
              {lockItem ? (
                <Input value={selectedItem?.itemName || values.itemId} readOnly className="bg-muted/50 cursor-not-allowed" />
              ) : loadingItems ? (
                <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground animate-pulse">
                  Loading items...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
                  No items found for selected brand / group
                </div>
              ) : (
                <InlineSelect value={values.itemId} options={itemOptions}
                  onValueChange={handleItemSelect} />
              )}
              {loadingDefaults && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  Loading current values from item master...
                </p>
              )}
            </div>
            <div className="space-y-2">
              <FL htmlFor="effectiveDate" required>Effective Date</FL>
              <Input id="effectiveDate" type="date" value={values.effectiveDate}
                onChange={(e) => set("effectiveDate", e.target.value)} className="bg-background h-10" />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Price & Incentive Details — TABLE FORMAT ── */}
      {showPricingStep && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="font-semibold text-lg">Price &amp; Incentive Details</h3>
            <p className="text-xs text-muted-foreground">Old values auto-filled · Edit new values below</p>
          </div>

          {/* Table styled exactly like PO/PI item tables */}
          <style>{`
            .no-spinner-inc::-webkit-outer-spin-button,
            .no-spinner-inc::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .no-spinner-inc[type=number] { -moz-appearance: textfield; }
            .incentive-table { border-collapse: collapse; width: 100%; font-size: 0.75rem; }
            .incentive-table th {
              border: 1px solid rgba(255,255,255,0.25);
              padding: 9px 12px;
              font-size: 0.72rem;
              font-weight: 600;
              white-space: nowrap;
              background-color: #b91c1c;
              color: white;
            }
            .incentive-table td {
              border: 1px solid #d1d5db;
              padding: 0;
              vertical-align: middle;
            }
            .incentive-table td.label-cell {
              padding: 8px 14px;
              font-size: 0.75rem;
              font-weight: 600;
              color: var(--foreground);
              background-color: rgba(0,0,0,0.015);
              white-space: nowrap;
            }
            .incentive-table td.old-cell {
              padding: 8px 12px;
              font-size: 0.75rem;
              text-align: right;
              color: #6b7280;
              background-color: rgba(0,0,0,0.015);
              font-weight: 500;
            }
            .incentive-table td.arrow-cell {
              padding: 8px 10px;
              text-align: center;
              font-size: 0.9rem;
              color: #9ca3af;
              background-color: rgba(0,0,0,0.008);
              width: 36px;
            }
            .incentive-table input:focus {
              background-color: rgba(0,0,0,0.03);
              outline: none;
            }
            .incentive-table tbody tr:hover td { background-color: rgba(0,0,0,0.02); }
            .incentive-table tbody tr:hover td.label-cell,
            .incentive-table tbody tr:hover td.old-cell,
            .incentive-table tbody tr:hover td.arrow-cell { background-color: rgba(0,0,0,0.025); }
          `}</style>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="incentive-table">
              <thead>
                <tr>
                  <th style={{ width: "160px", textAlign: "left" }}>Field</th>
                  <th style={{ width: "200px", textAlign: "right" }}>Old Value</th>
                  <th style={{ width: "36px", textAlign: "center" }}></th>
                  <th style={{ width: "200px", textAlign: "right" }}>New Value <span style={{ color: "#fca5a5" }}>*</span></th>
                  <th style={{ width: "120px", textAlign: "center" }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {PRICING_FIELDS.map((field) => {
                  const oldVal = values[field.oldKey] as string;
                  const newVal = values[field.newKey] as string;
                  const displayNew = getPricingInputDisplayValue(newVal);
                  const displayOld = oldVal
                    ? `${field.prefix || ""}${parseFloat(oldVal).toFixed(2)}${field.suffix || ""}`
                    : "—";

                  return (
                    <tr key={field.label}>
                      {/* Field name */}
                      <td className="label-cell">
                        {field.label}
                        {field.prefix === "₹" && <span style={{ color: "#6b7280", fontWeight: 400 }}> (₹)</span>}
                        {field.suffix === "%" && <span style={{ color: "#6b7280", fontWeight: 400 }}> (%)</span>}
                      </td>

                      {/* Old value — read-only, muted */}
                      <td className="old-cell">
                        {displayOld}
                      </td>

                      {/* Arrow */}
                      <td className="arrow-cell">→</td>

                      {/* New value — editable plain input */}
                      <td style={{ border: "1px solid #d1d5db", padding: "0", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", paddingRight: "8px" }}>
                          {field.prefix && (
                            <span style={{ paddingLeft: "10px", paddingRight: "4px", fontSize: "0.75rem", color: "#6b7280", flexShrink: 0 }}>
                              {field.prefix}
                            </span>
                          )}
                          <input
                            type="text"
                            inputMode="decimal"
                            className="no-spinner-inc"
                            value={displayNew}
                            onChange={(e) => handlePricingInputChange(field.newKey, e.target.value)}
                            onKeyDown={(e) => handlePricingInputKeyDown(e, field.newKey, newVal)}
                            onFocus={(e) => handlePricingInputFocus(e, newVal)}
                            onWheel={(e) => e.currentTarget.blur()}
                            style={{
                              flex: 1,
                              height: "36px",
                              border: "none",
                              background: "transparent",
                              outline: "none",
                              fontSize: "0.75rem",
                              textAlign: "right",
                              padding: "0 4px",
                              fontWeight: 500,
                              appearance: "textfield" as any,
                            }}
                          />
                          {field.suffix && (
                            <span style={{ paddingLeft: "2px", fontSize: "0.72rem", color: "#6b7280", flexShrink: 0 }}>
                              {field.suffix}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Change indicator */}
                      <td style={{ border: "1px solid #d1d5db", padding: "8px 12px", textAlign: "center", verticalAlign: "middle" }}>
                        <DiffCell oldVal={oldVal} newVal={newVal} prefix={field.prefix} suffix={field.suffix} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Remarks ── */}
      <div className="space-y-2">
        <FL htmlFor="remarks">Remarks</FL>
        <Textarea id="remarks" value={values.remarks}
          onChange={(e) => set("remarks", e.target.value)}
          rows={3} className="bg-background" />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onSubmit} disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
          {isSubmitting ? "Saving..." : mode === "add" ? "Save Incentive Log" : "Update Log"}
        </Button>
        <Button type="button" variant="outline" disabled={isSubmitting}
          onClick={() => (onCancel ? onCancel() : window.history.back())}
          className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
