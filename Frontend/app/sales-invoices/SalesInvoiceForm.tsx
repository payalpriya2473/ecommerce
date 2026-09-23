"use client";

import type React from "react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertCircle, Check, Plus, Trash2, ChevronUp, ChevronDown,
  AlignLeft, X, Barcode, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorCombobox, type ColorOption } from "@/components/color-combobox";
import { TableSelect } from "@/components/table-select";
import { useToast } from "@/hooks/use-toast";
import {
  brandAPI, itemAPI,
  salesInvoiceAPI, type FinanceCompany, type PartyLookupResult,
  // Temporarily disabled: Colour Master and Finance Companies API imports.
  // colorAPI, financeCompanyAPI,
} from "@/lib/api";
import {
  findItemVariant,
  getItemVariants,
  normalizeVariantLabel,
  sid,
} from "@/lib/item-variant-utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SerialRow { id: string; color: string; srNo: string; }

export interface SIItem {
  id: string;
  itemId?: string;
  brandId?: string;
  variantId?: string;
  variant?: string;
  brandName: string;
  itemName: string;
  remarks: string;
  qty: number;
  rate: number;
  amount: number;
  scheme: number;
  discountPercent: number;
  discountRs: number;
  sgstPercent: number; sgstAmount: number;
  cgstPercent: number; cgstAmount: number;
  igstPercent: number; igstAmount: number;
  gstPercent: number;
  incPercent: number;
  incentive: number;
  buyBack: number;
  installation: number;
  bookingAmount: number;
  demo: boolean;
  selfDelivery: boolean;
  serialRows: SerialRow[];
  showDescription: boolean;
  showSerialTable: boolean;
}

export interface SalesInvoiceFormValues {
  billNumber: string;
  billDate: string;
  customerId: string;
  partyName: string;
  address: string;
  partyCityVillage: string;
  mobileNo: string;
  adharNo: string;
  otpVerified: boolean;
  reference1: string;
  reference2: string;
  reference1Address: string;
  reference1City: string;
  reference1Mobile: string;
  reference2Address: string;
  reference2City: string;
  reference2Mobile: string;
  items: SIItem[];
  discountPercent: number;
  freightAmount: number;
  scheme: number;
  otherCharges: number;
  processingFees1: number;
  processingFees2: number;
  installationAmt: number;
  mop: string;
  booking: number;
  buyBack: number;
  fAmt1: number; fComp1: string;
  fAmt2: number; fComp2: string;
  dbd1: number; dbd2: number;
  fileNo1: string; fileNo2: string;
  salesmanId: string;
  installments: Installment[];
  paymentAtDelivery: boolean;
  remarks: string;
  margin: number;
  cashMargin: number;
  onlineMargin: number;
  balance: number;
  cashbookId: string;
  bankBookId: string;
  utrNumber: string;
}

export interface Installment {
  id: string;
  instAmt: number;
  noOfInst: number;
  totalAmt: number;
  stDate: string;
  days: number;
}

// ── Constants / helpers ───────────────────────────────────────────────────────

const toNumber = (v: unknown) => Number(v) || 0;
const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
const countSerials = (srNo: string) =>
  srNo.split(",").map((s) => s.trim()).filter(Boolean).length;
const emptySerialRow = (): SerialRow => ({ id: genId(), color: "", srNo: "" });

const emptyItem = (): SIItem => ({
  id: genId(), itemId: "", brandId: "", brandName: "", itemName: "", remarks: "",
  variantId: "", variant: "",
  qty: 0, rate: 0, amount: 0, scheme: 0, discountPercent: 0, discountRs: 0,
  sgstPercent: 0, sgstAmount: 0, cgstPercent: 0, cgstAmount: 0,
  igstPercent: 0, igstAmount: 0, gstPercent: 0, incPercent: 0,
  incentive: 0, buyBack: 0, installation: 0, bookingAmount: 0, demo: false, selfDelivery: false,
  serialRows: [emptySerialRow()],
  showDescription: false, showSerialTable: false,
});

const emptyInstallment = (): Installment => ({
  id: genId(), instAmt: 0, noOfInst: 0, totalAmt: 0, stDate: "", days: 0,
});

export const EMPTY_SI_FORM: SalesInvoiceFormValues = {
  billNumber: "",
  billDate: new Date().toISOString().split("T")[0],
  customerId: "", partyName: "", address: "", mobileNo: "",
  partyCityVillage: "",
  adharNo: "", reference1: "", reference2: "",
  otpVerified: false,
  reference1Address: "", reference1City: "", reference1Mobile: "",
  reference2Address: "", reference2City: "", reference2Mobile: "",
  items: [emptyItem()],
  discountPercent: 0, freightAmount: 0, scheme: 0, otherCharges: 0,
  processingFees1: 0, processingFees2: 0, installationAmt: 0,
  mop: "", booking: 0, buyBack: 0,
  fAmt1: 0, fComp1: "", fAmt2: 0, fComp2: "",
  dbd1: 0, dbd2: 0, fileNo1: "", fileNo2: "",
  salesmanId: "",
  installments: [emptyInstallment(), emptyInstallment(), emptyInstallment(), emptyInstallment(), emptyInstallment()],
  paymentAtDelivery: false,
  remarks: "",
  margin: 0, cashMargin: 0, onlineMargin: 0, balance: 0,
  cashbookId: "", bankBookId: "", utrNumber: "",
};

function computeGST(baseAmount: number, gstPercent: number, isGujarat: boolean) {
  if (baseAmount <= 0 || gstPercent <= 0)
    return { sgstPercent: 0, sgstAmount: 0, cgstPercent: 0, cgstAmount: 0, igstPercent: 0, igstAmount: 0 };
  if (isGujarat) {
    const half = gstPercent / 2;
    const halfAmt = parseFloat(((baseAmount * half) / 100).toFixed(3));
    return { sgstPercent: half, sgstAmount: halfAmt, cgstPercent: half, cgstAmount: halfAmt, igstPercent: 0, igstAmount: 0 };
  }
  const igstAmt = parseFloat(((baseAmount * gstPercent) / 100).toFixed(3));
  return { sgstPercent: 0, sgstAmount: 0, cgstPercent: 0, cgstAmount: 0, igstPercent: gstPercent, igstAmount: igstAmt };
}

const formatMoney = (v: unknown) =>
  toNumber(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeMobile = (value: string) => value.replace(/\D/g, "");
const isLookupReady = (value: string) => normalizeMobile(value).length >= 10;

type LookupState = { loading: boolean; message: string; found: boolean; };
const idleLookupState = (): LookupState => ({ loading: false, message: "", found: false });

// ── recalculate a single item row ─────────────────────────────────────────────
function recalculateSIItem(item: SIItem, isGujaratCustomer: boolean): SIItem {
  const qty            = toNumber(item.qty);
  const rate           = toNumber(item.rate);
  const scheme         = toNumber(item.scheme);
  const discountPercent = toNumber(item.discountPercent);
  const baseAmount      = qty * rate - scheme;
  const discountRs      = parseFloat(((baseAmount * discountPercent) / 100).toFixed(2));
  const amount          = Math.max(0, baseAmount - discountRs);
  const taxParts = item.gstPercent > 0
    ? computeGST(amount, item.gstPercent, isGujaratCustomer)
    : { sgstPercent: 0, sgstAmount: 0, cgstPercent: 0, cgstAmount: 0, igstPercent: 0, igstAmount: 0 };

  return { ...item, discountRs, amount, ...taxParts };
}

// ── InlineSelect ──────────────────────────────────────────────────────────────

interface InlineSelectOption { id: string; label: string; }
interface InlineSelectProps {
  id?: string;
  value: string;
  options: InlineSelectOption[];
  disabled?: boolean;
  onValueChange: (value: string) => void;
}

function InlineSelect({ id, value, options, disabled = false, onValueChange }: InlineSelectProps) {
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
        setIsOpen(false); setInputValue("");
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
    onValueChange(opt.id); setInputValue(""); setIsOpen(false); inputRef.current?.blur();
  };
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation(); onValueChange(""); setInputValue(""); setIsOpen(false); inputRef.current?.focus();
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) { setIsOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, filteredOptions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (filteredOptions[highlightedIndex]) handleSelect(filteredOptions[highlightedIndex]); }
    else if (e.key === "Escape") { setIsOpen(false); setInputValue(""); }
  };

  const displayValue = isOpen ? inputValue : (selectedOption ? selectedOption.label : "");

  return (
    <div ref={containerRef} className="relative w-full">
      <div className={cn(
        "flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors",
        isOpen && "ring-2 ring-ring ring-offset-2",
        disabled && "cursor-not-allowed opacity-50",
      )}>
        <input ref={inputRef} id={id} type="text" disabled={disabled} autoComplete="off"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          value={displayValue}
          onChange={(e) => { setInputValue(e.target.value); setIsOpen(true); }}
          onFocus={() => { setIsOpen(true); setInputValue(""); }}
          onKeyDown={handleKeyDown}
        />
        {value && !disabled && (
          <button type="button" onClick={handleClear} className="mr-1 text-muted-foreground hover:text-foreground transition-colors" tabIndex={-1}>
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

// ── SerialTable ───────────────────────────────────────────────────────────────

function SerialTable({
  rows, itemName, expectedQty, colorOptions, colorLoading, onRowChange, onAddRow, onRemoveRow, onScanSerial, autoFocusToken,
}: {
  rows: SerialRow[]; itemName: string; expectedQty: number;
  colorOptions: ColorOption[]; colorLoading: boolean;
  onRowChange: (rowId: string, field: "color" | "srNo", value: string) => void;
  onAddRow: () => void; onRemoveRow: (rowId: string) => void;
  onScanSerial: (rowId: string, serialNo: string) => Promise<string | null>;
  autoFocusToken?: number;
}) {
  const scanRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [dupWarnings, setDupWarnings] = useState<Record<string, string[]>>({});
  const [scanMessages, setScanMessages] = useState<Record<string, string>>({});

  const getOtherSerials = (excludeRowId: string) => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.id === excludeRowId) return;
      r.srNo.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => set.add(s.toLowerCase()));
    });
    return set;
  };
  const findInternalDups = (srNo: string) => {
    const parts = srNo.split(",").map((s) => s.trim()).filter(Boolean);
    const seen = new Set<string>(); const dups: string[] = [];
    parts.forEach((p) => { const k = p.toLowerCase(); if (seen.has(k)) dups.push(p); else seen.add(k); });
    return dups;
  };
  const findCrossRowDups = (rowId: string, srNo: string) => {
    const others = getOtherSerials(rowId);
    return srNo.split(",").map((s) => s.trim()).filter(Boolean).filter((s) => others.has(s.toLowerCase()));
  };
  const recomputeWarnings = (rowId: string, srNo: string) => {
    const all = [...new Set([...findInternalDups(srNo), ...findCrossRowDups(rowId, srNo)])];
    setDupWarnings((prev) => ({ ...prev, [rowId]: all }));
  };

  useEffect(() => {
    if (!autoFocusToken || rows.length === 0) return;
    const firstRowId = rows[0]?.id;
    if (!firstRowId) return;
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      scanRefs.current[firstRowId]?.focus();
      scanRefs.current[firstRowId]?.select();
    });
  }, [autoFocusToken, rows]);

  const handleScanKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>, rowId: string) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const scanned = e.currentTarget.value.trim();
    if (!scanned) return;
    const allExisting = new Set<string>();
    rows.forEach((r) => r.srNo.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => allExisting.add(s.toLowerCase())));
    if (allExisting.has(scanned.toLowerCase())) {
      setDupWarnings((prev) => ({ ...prev, [rowId]: [...(prev[rowId] || []).filter((d) => d !== scanned), scanned] }));
      setScanMessages((prev) => ({ ...prev, [rowId]: "" }));
      e.currentTarget.style.background = "#fef2f2";
      setTimeout(() => { if (e.currentTarget) { e.currentTarget.style.background = ""; e.currentTarget.value = ""; } }, 1200);
      return;
    }
    const error = await onScanSerial(rowId, scanned);
    if (error) {
      setScanMessages((prev) => ({ ...prev, [rowId]: error }));
      e.currentTarget.style.background = "#fef2f2";
      setTimeout(() => { if (e.currentTarget) { e.currentTarget.style.background = ""; e.currentTarget.select(); } }, 1200);
      return;
    }
    setScanMessages((prev) => ({ ...prev, [rowId]: "" }));
    e.currentTarget.value = "";
  };

  return (
    <div ref={tableRef} className="mt-3 rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[2fr_2fr_3fr] bg-red-700 text-white text-xs font-semibold">
        <div className="px-3 py-2 border-r border-red-600">Item</div>
        <div className="px-3 py-2 border-r border-red-600">Color</div>
        <div className="px-3 py-2 flex items-center gap-1.5"><Barcode className="h-3.5 w-3.5" /> S.No</div>
      </div>
      {rows.map((row, idx) => {
        const sc = countSerials(row.srNo);
        const dups = dupWarnings[row.id] || [];
        const scanMessage = scanMessages[row.id] || "";
        return (
          <div key={row.id} className={`grid grid-cols-[2fr_2fr_3fr] border-b border-border/50 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-muted/10"}`}>
            <div className="px-3 py-2.5 text-xs text-muted-foreground border-r border-border/40 flex items-start pt-3">{itemName || `Item ${idx + 1}`}</div>
            <div className="border-r border-border/40" style={{ minHeight: "36px", display: "flex", alignItems: "center" }}>
              <ColorCombobox value={row.color} onChange={(v) => onRowChange(row.id, "color", v)} options={colorOptions} isLoading={colorLoading} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center border-b border-border/30 min-h-[30px]">
                <div className="flex items-center gap-1 bg-red-700 text-white text-[11px] px-2 py-1 shrink-0 select-none font-medium"><Barcode className="h-3 w-3" /> Scan</div>
                <input ref={(el) => { scanRefs.current[row.id] = el; }} type="text"
                  className="flex-1 h-7 border-0 text-xs px-2 font-mono focus:outline-none focus:bg-blue-50/40 bg-transparent"
                  onKeyDown={(e) => handleScanKeyDown(e, row.id)} autoComplete="off" />
                {sc > 0 && <span className="text-[10px] text-muted-foreground px-1.5 shrink-0 whitespace-nowrap bg-orange-50 h-full flex items-center border-l border-border/30">{sc} S.No</span>}
                {rows.length > 1 && <button type="button" onClick={() => onRemoveRow(row.id)} className="h-7 w-7 flex items-center justify-center text-destructive hover:bg-red-50 shrink-0 border-l border-border/30"><X className="h-3 w-3" /></button>}
              </div>
              <Textarea className={`border-0 rounded-none text-xs font-mono min-h-[44px] resize-none bg-transparent focus:bg-white px-3 py-1.5 leading-relaxed ${dups.length > 0 ? "bg-red-50/40" : ""}`}
                value={row.srNo} onChange={(e) => { onRowChange(row.id, "srNo", e.target.value); recomputeWarnings(row.id, e.target.value); }} />
              {(dups.length > 0 || scanMessage) && (
                <div className="px-3 py-1.5 bg-red-50 border-t border-red-200 flex items-start gap-1.5">
                  <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-red-600 font-medium">
                    {scanMessage || `Duplicate${dups.length > 1 ? "s" : ""}: ${dups.join(", ")}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="px-3 py-2 bg-muted/10 border-t border-border/40 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          {rows.length} row{rows.length !== 1 ? "s" : ""} · <kbd className="px-1 py-0.5 text-xs bg-muted rounded border">Enter</kbd> after scan → auto-appends
          {(() => {
            const total = rows.reduce((s, r) => s + countSerials(r.srNo), 0);
            if (expectedQty > 0 && total !== expectedQty) return <span className="text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-200">⚠ {total}/{expectedQty} serials</span>;
            if (expectedQty > 0 && total === expectedQty) return <span className="text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded border border-green-200">✓ All {expectedQty} serials</span>;
            return null;
          })()}
        </span>
        <button type="button" onClick={onAddRow} className="flex items-center gap-1 text-xs bg-red-700 text-white px-2.5 py-1 rounded hover:bg-red-800 shrink-0"><Plus className="h-3 w-3" /> Add Row</button>
      </div>
    </div>
  );
}

// ── DescriptionPanel ──────────────────────────────────────────────────────────

function DescriptionPanel({
  item, colorOptions, colorLoading,
  onDescriptionChange, onSerialRowChange, onAddSerialRow, onRemoveSerialRow, onToggleSerialTable, onScanSerial, autoFocusToken,
}: {
  item: SIItem; colorOptions: ColorOption[]; colorLoading: boolean;
  onDescriptionChange: (id: string, v: string) => void;
  onSerialRowChange: (itemId: string, rowId: string, field: "color" | "srNo", v: string) => void;
  onAddSerialRow: (itemId: string) => void;
  onRemoveSerialRow: (itemId: string, rowId: string) => void;
  onToggleSerialTable: (itemId: string) => void;
  onScanSerial: (itemId: string, rowId: string, serialNo: string) => Promise<string | null>;
  autoFocusToken?: number;
}) {
  const totalSerialCount = item.serialRows.reduce((s, r) => s + countSerials(r.srNo), 0);
  return (
    <tr>
      <td colSpan={25} style={{ padding: 0, borderBottom: "1px solid #e5e7eb" }}>
        <div className="bg-slate-50/80 border-l-4 border-l-red-700 mx-2 my-2 rounded-lg p-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Remarks / Description</label>
            <Textarea className="text-xs min-h-[72px] resize-none bg-white" value={item.remarks} onChange={(e) => onDescriptionChange(item.id, e.target.value)} />
          </div>
          <div>
            <button type="button" onClick={() => onToggleSerialTable(item.id)} className="flex items-center gap-2 text-xs font-medium text-primary hover:underline">
              <Hash className="h-3.5 w-3.5" />
              {item.showSerialTable ? "Hide" : "Show"} Serial Numbers / Barcode Table
              <span className="text-muted-foreground font-normal">({totalSerialCount} serial{totalSerialCount !== 1 ? "s" : ""} across {item.serialRows.length} row{item.serialRows.length !== 1 ? "s" : ""})</span>
            </button>
            {item.showSerialTable && (
              <SerialTable
                rows={item.serialRows} itemName={item.itemName} expectedQty={item.qty}
                colorOptions={colorOptions} colorLoading={colorLoading}
                onRowChange={(rowId, field, value) => onSerialRowChange(item.id, rowId, field, value)}
                onAddRow={() => onAddSerialRow(item.id)} onRemoveRow={(rowId) => onRemoveSerialRow(item.id, rowId)}
                onScanSerial={(rowId, serialNo) => onScanSerial(item.id, rowId, serialNo)}
                autoFocusToken={autoFocusToken}
              />
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── SIItemRow ─────────────────────────────────────────────────────────────────

function SIItemRow({
  item, index, brands, items, isGujaratCustomer, isFirst, isLast, isSingle,
  onUpdate, onRemove, onAddRow, onMove,
  onToggleDescription, onDescriptionChange,
  onSerialRowChange, onAddSerialRow, onRemoveSerialRow, onToggleSerialTable, onRequestSerialFocus, onScanSerial, autoFocusToken,
  colorOptions, colorLoading, invoiceMargin,
}: {
  item: SIItem; index: number; brands: any[]; items: any[];
  isGujaratCustomer: boolean;
  isFirst: boolean; isLast: boolean; isSingle: boolean;
  onUpdate: (id: string, field: keyof SIItem | "amountInput", value: any) => void;
  onRemove: (id: string) => void; onAddRow: () => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onToggleDescription: (id: string) => void;
  onDescriptionChange: (id: string, v: string) => void;
  onSerialRowChange: (itemId: string, rowId: string, field: "color" | "srNo", v: string) => void;
  onAddSerialRow: (itemId: string) => void;
  onRemoveSerialRow: (itemId: string, rowId: string) => void;
  onToggleSerialTable: (itemId: string) => void;
  onRequestSerialFocus: (itemId: string) => void;
  onScanSerial: (itemId: string, rowId: string, serialNo: string) => Promise<string | null>;
  autoFocusToken?: number;
  colorOptions: ColorOption[]; colorLoading: boolean;
  invoiceMargin: number;
}) {
  const [amountInput, setAmountInput] = useState<string>(() => String(item.amount ?? ""));
  const [hoverDup, setHoverDup] = useState(false);
  const [hoverDel, setHoverDel] = useState(false);

  useEffect(() => { setAmountInput(String(item.amount ?? "")); }, [item.amount]);

  const filteredItems = items.filter((i) => !item.brandId || String(i.brandId) === String(item.brandId));
  const selectedMasterItem = items.find((entry) => sid(entry.id) === sid(item.itemId));
  const variantOptions = getItemVariants(selectedMasterItem).map((variant) => ({
    id: sid(variant.id || variant.variant),
    label: normalizeVariantLabel(variant.variant),
  }));
  const totalSerialCount = item.serialRows.reduce((s, r) => s + countSerials(r.srNo), 0);
  const hasDescriptionContent = item.remarks.trim() || item.serialRows.some((r) => r.srNo.trim() || r.color.trim());
  const incentivePercent = toNumber(item.incPercent);
  // FIX: incentive is calculated from the item's own amount, not invoiceMargin
  const incentiveAmount = parseFloat(((toNumber(item.amount) * incentivePercent) / 100).toFixed(2));

  const numInputStyle: React.CSSProperties = {
    width: "100%", height: "28px", border: "none", background: "transparent",
    outline: "none", fontSize: "11px", textAlign: "center", padding: "0 4px",
    appearance: "textfield" as any,
  };
  const tdBorder: React.CSSProperties = {
    border: "1px solid #d1d5db", verticalAlign: "middle", textAlign: "center", padding: "0",
  };

  return (
    <>
      <tr style={{ backgroundColor: "white" }}>
        {/* # + move */}
        <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 2px", verticalAlign: "middle", width: "50px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
            <span style={{ fontSize: "11px", fontWeight: 500, color: "#6b7280" }}>{index + 1}.</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <button type="button" disabled={isFirst} onClick={() => onMove(item.id, "up")} style={{ height: "14px", width: "14px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", opacity: isFirst ? 0.3 : 1 }}><ChevronUp className="h-3 w-3" /></button>
              <button type="button" disabled={isLast} onClick={() => onMove(item.id, "down")} style={{ height: "14px", width: "14px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", opacity: isLast ? 0.3 : 1 }}><ChevronDown className="h-3 w-3" /></button>
            </div>
          </div>
        </td>

        {/* Sr.No count badge */}
        <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", verticalAlign: "middle", width: "72px", textAlign: "center" }}>
          <button type="button"
            onClick={() => onRequestSerialFocus(item.id)}
            className={cn(
              "inline-flex items-center gap-1 text-[10px] px-1.5 py-1 rounded font-semibold border transition-colors shadow-sm",
              totalSerialCount > 0
                ? "bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200"
                : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
            )}>
            <Plus className="h-2.5 w-2.5" />
            <Barcode className="h-2.5 w-2.5" />
            <span>{totalSerialCount > 0 ? `${totalSerialCount}` : "S.No"}</span>
          </button>
        </td>

        {/* Brand */}
        <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", verticalAlign: "middle", width: "150px" }}>
          <TableSelect value={String(item.brandId || "")} options={brands.map((b) => ({ id: String(b.id), label: b.name }))} onValueChange={(v) => onUpdate(item.id, "brandId", v)} />
        </td>

        {/* Item */}
        <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", verticalAlign: "middle", width: "160px" }}>
          <TableSelect value={String(item.itemId || "")} options={filteredItems.map((i) => ({ id: String(i.id), label: i.itemName, sublabel: i.itemGroupName || "" }))} onValueChange={(v) => onUpdate(item.id, "itemId", v)} />
        </td>

        {/* Variant */}
        <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", verticalAlign: "middle", width: "140px" }}>
          <TableSelect
            value={String(item.variantId || item.variant || "")}
            options={variantOptions}
            placeholder="Variant"
            disabled={!item.itemId || variantOptions.length === 0}
            onValueChange={(v) => onUpdate(item.id, "variantId", v)}
          />
        </td>

        {/* Remarks */}
        <td style={{ border: "1px solid #d1d5db", padding: "4px 6px", verticalAlign: "middle", width: "120px" }}>
          <input type="text" value={item.remarks} onChange={(e) => onDescriptionChange(item.id, e.target.value)}
            style={{ ...numInputStyle, textAlign: "left" }} placeholder="Remarks…" />
        </td>

        {/* Qty */}
        <td style={{ ...tdBorder, width: "72px" }}>
          <input type="number" className="no-spinner" value={item.qty || ""}
            min={0} onChange={(e) => onUpdate(item.id, "qty", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>

        {/* Rate */}
        <td style={{ ...tdBorder, width: "90px" }}>
          <input type="number" className="no-spinner" value={item.rate || ""}
            min={0} onChange={(e) => onUpdate(item.id, "rate", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>

        {/* Amount */}
        <td style={{ ...tdBorder, width: "100px" }}>
          <input type="number" className="no-spinner" value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            onBlur={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) onUpdate(item.id, "amountInput", val); }}
            style={{ ...numInputStyle, fontWeight: 600 }} />
        </td>

        {/* Scheme */}
        <td style={{ ...tdBorder, width: "85px" }}>
          <input type="number" className="no-spinner" value={item.scheme || ""}
            min={0} onChange={(e) => onUpdate(item.id, "scheme", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>

        {/* Disc % */}
        <td style={{ ...tdBorder, width: "72px" }}>
          <input type="number" className="no-spinner" value={item.discountPercent || ""}
            min={0} max={100} onChange={(e) => onUpdate(item.id, "discountPercent", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>

        {/* Disc Rs — computed, read-only */}
        <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "85px" }}>
          <span style={{ fontSize: "11px", fontWeight: 500, color: "#374151" }}>₹{toNumber(item.discountRs).toFixed(2)}</span>
        </td>

        {/* GST columns */}
        {isGujaratCustomer && (
          <>
            <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "85px" }}>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>{item.sgstPercent}%</div>
              <div style={{ fontSize: "11px", fontWeight: 500 }}>₹{Number(item.sgstAmount || 0).toFixed(2)}</div>
            </td>
            <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "85px" }}>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>{item.cgstPercent}%</div>
              <div style={{ fontSize: "11px", fontWeight: 500 }}>₹{Number(item.cgstAmount || 0).toFixed(2)}</div>
            </td>
          </>
        )}
        {!isGujaratCustomer && (
          <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "85px" }}>
            <div style={{ fontSize: "11px", color: "#6b7280" }}>{item.igstPercent}%</div>
            <div style={{ fontSize: "11px", fontWeight: 500 }}>₹{Number(item.igstAmount || 0).toFixed(2)}</div>
          </td>
        )}

        {/* Incentive — % of item amount (not invoice margin) */}
        <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "90px" }}>
          <div style={{ fontSize: "11px", color: "#6b7280" }}>{incentivePercent}%</div>
          <div style={{ fontSize: "11px", fontWeight: 500 }}>₹{incentiveAmount.toFixed(2)}</div>
        </td>

        {/* Buyback */}
        <td style={{ ...tdBorder, width: "90px" }}>
          <input type="number" className="no-spinner" value={item.buyBack || ""}
            min={0} onChange={(e) => onUpdate(item.id, "buyBack", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>

        {/* Installation */}
        <td style={{ ...tdBorder, width: "95px" }}>
          <input type="number" className="no-spinner" value={item.installation || ""}
            min={0} onChange={(e) => onUpdate(item.id, "installation", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>

        {/* Booking Amount */}
        <td style={{ ...tdBorder, width: "110px" }}>
          <input type="number" className="no-spinner" value={item.bookingAmount || ""}
            min={0} onChange={(e) => onUpdate(item.id, "bookingAmount", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>

        {/* Demo */}
        <td style={{ ...tdBorder, width: "80px" }}>
          <input type="checkbox" checked={item.demo} onChange={(e) => onUpdate(item.id, "demo", e.target.checked)} className="h-4 w-4 rounded" />
        </td>

        {/* Self Delivery */}
        <td style={{ ...tdBorder, width: "90px" }}>
          <input type="checkbox" checked={item.selfDelivery} onChange={(e) => onUpdate(item.id, "selfDelivery", e.target.checked)} className="h-4 w-4 rounded" />
        </td>

        {/* Actions */}
        <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 2px", verticalAlign: "middle", width: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
            <button type="button" onClick={onAddRow}
              onMouseEnter={() => setHoverDup(true)} onMouseLeave={() => setHoverDup(false)}
              style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: hoverDup ? "#f3f4f6" : "none", cursor: "pointer", color: "#dc2626" }}>
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button type="button" disabled={isSingle} onClick={() => onRemove(item.id)}
              onMouseEnter={() => setHoverDel(true)} onMouseLeave={() => setHoverDel(false)}
              style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: hoverDel && !isSingle ? "#fef2f2" : "none", cursor: isSingle ? "not-allowed" : "pointer", color: "#dc2626", opacity: isSingle ? 0.3 : 1 }}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* Action strip */}
      <tr style={{ borderBottom: "1px solid #f3f4f6", backgroundColor: "white" }}>
        <td colSpan={25} style={{ padding: "4px 12px" }}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onToggleDescription(item.id)}
              className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors",
                item.showDescription
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <AlignLeft className="h-3.5 w-3.5" />
              {item.showDescription ? "Hide Description" : "+ Add Description"}
              {item.remarks.trim() && !item.showDescription && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
            </button>
            <button type="button"
              onClick={() => onRequestSerialFocus(item.id)}
              className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors",
                totalSerialCount > 0
                  ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Barcode className="h-3.5 w-3.5" />+ Serial / Barcode *
              {totalSerialCount > 0 && <span className="text-orange-600 font-semibold">({totalSerialCount})</span>}
            </button>
            {hasDescriptionContent && (
              <span className="text-xs text-muted-foreground ml-auto italic">
                {[item.remarks.trim() && "Remarks", totalSerialCount > 0 && `${totalSerialCount} S.No`].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        </td>
      </tr>

      {item.showDescription && (
        <DescriptionPanel
          item={item} colorOptions={colorOptions} colorLoading={colorLoading}
          onDescriptionChange={onDescriptionChange}
          onSerialRowChange={onSerialRowChange} onAddSerialRow={onAddSerialRow}
          onRemoveSerialRow={onRemoveSerialRow} onToggleSerialTable={onToggleSerialTable}
          onScanSerial={onScanSerial}
          autoFocusToken={autoFocusToken}
        />
      )}
    </>
  );
}

// ── Summary Row helpers ───────────────────────────────────────────────────────

function SRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground leading-none">{label}</span>
      <span className={`font-medium ${highlight ? "text-primary" : "text-red-600"}`}>{value}</span>
    </div>
  );
}

// ── Main SalesInvoiceFormFields ───────────────────────────────────────────────

export interface SalesInvoiceFormFieldsProps {
  values: SalesInvoiceFormValues;
  onChange: (updated: Partial<SalesInvoiceFormValues>) => void;
  onItemsChange: (items: SIItem[]) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  error: string;
  isSubmitting: boolean;
  mode: "add" | "edit";
  billLoading?: boolean;
}

export function SalesInvoiceFormFields({
  values, onChange, onItemsChange, onSubmit, onCancel, error, isSubmitting, mode,
  billLoading = false,
}: SalesInvoiceFormFieldsProps) {
  const { toast } = useToast();
  const [financeCompanies, setFinanceCompanies] = useState<FinanceCompany[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [salesmen, setSalesmen] = useState<any[]>([]);
  const [cashbooks, setCashbooks] = useState<any[]>([]);
  const [bankBooks, setBankBooks] = useState<any[]>([]);
  const [colorsByBrand, setColorsByBrand] = useState<Record<string, ColorOption[]>>({});
  const [colorLoadingByBrand, setColorLoadingByBrand] = useState<Record<string, boolean>>({});
  const [isGujaratCustomer, setIsGujaratCustomer] = useState(true);
  const [serialFocusRequest, setSerialFocusRequest] = useState<{ itemId: string; token: number } | null>(null);
  const [partyLookupState, setPartyLookupState] = useState<LookupState>(idleLookupState);
  const [referenceLookupState, setReferenceLookupState] = useState<Record<"reference1" | "reference2", LookupState>>({
    reference1: idleLookupState(),
    reference2: idleLookupState(),
  });
  const lookupRequestRef = useRef({ party: 0, reference1: 0, reference2: 0 });
  const lastLookupToastRef = useRef("");
  const lookupPartyRouteAvailableRef = useRef(true);
  const invoiceLookupCacheRef = useRef<any[] | null>(null);

  const set = (field: keyof SalesInvoiceFormValues, value: any) => onChange({ [field]: value });

  const applyPartyLookupData = useCallback((data?: PartyLookupResult | null) => {
    onChange({
      customerId: data?.customerId ? String(data.customerId) : "",
      partyName: data?.partyName || data?.name || "",
      address: data?.address || "",
      partyCityVillage: data?.partyCityVillage || data?.city || "",
      mobileNo: data?.mobileNo || data?.mobile || values.mobileNo,
      adharNo: data?.adharNo || "",
    });
  }, [onChange, values.mobileNo]);

  const clearPartyLookupData = useCallback(() => {
    onChange({ customerId: "", partyName: "", address: "", partyCityVillage: "", adharNo: "" });
  }, [onChange]);

  const applyReferenceLookupData = useCallback((key: "reference1" | "reference2", data?: PartyLookupResult | null) => {
    onChange(
      key === "reference1"
        ? { reference1: data?.partyName || data?.name || "", reference1Address: data?.address || "", reference1City: data?.partyCityVillage || data?.city || "", reference1Mobile: data?.mobileNo || data?.mobile || values.reference1Mobile }
        : { reference2: data?.partyName || data?.name || "", reference2Address: data?.address || "", reference2City: data?.partyCityVillage || data?.city || "", reference2Mobile: data?.mobileNo || data?.mobile || values.reference2Mobile }
    );
  }, [onChange, values.reference1Mobile, values.reference2Mobile]);

  const clearReferenceLookupData = useCallback((key: "reference1" | "reference2") => {
    onChange(
      key === "reference1"
        ? { reference1: "", reference1Address: "", reference1City: "" }
        : { reference2: "", reference2Address: "", reference2City: "" }
    );
  }, [onChange]);

  const showLookupToast = useCallback((type: "success" | "error", kind: "party" | "reference1" | "reference2", message: string) => {
    const label = kind === "party" ? "Party / Customer" : kind === "reference1" ? "Reference 1" : "Reference 2";
    const key = `${type}:${kind}:${message}`;
    if (lastLookupToastRef.current === key) return;
    lastLookupToastRef.current = key;
    toast({ title: type === "success" ? `${label} Found` : `${label} Not Found`, description: message, variant: type === "error" ? "destructive" : "default", className: type === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : undefined });
    window.setTimeout(() => { if (lastLookupToastRef.current === key) lastLookupToastRef.current = ""; }, 1200);
  }, [toast]);

  const getInvoicesForLookup = useCallback(async () => {
    const token = sessionStorage.getItem("authToken") || "";
    if (!token) return [];
    if (invoiceLookupCacheRef.current) return invoiceLookupCacheRef.current;
    const result = await salesInvoiceAPI.getAll(token);
    const invoices = Array.isArray(result?.data) ? result.data : [];
    invoiceLookupCacheRef.current = invoices;
    return invoices;
  }, []);

  const fallbackLookupFromInvoices = useCallback(async (kind: "party" | "reference1" | "reference2", mobileNo: string) => {
    const invoices = await getInvoicesForLookup();
    const matchedInvoice = invoices.find((invoice: any) => {
      const partyMobile = normalizeMobile(invoice.mobileNo || "");
      const ref1Mobile = normalizeMobile(invoice.reference1Mobile || "");
      const ref2Mobile = normalizeMobile(invoice.reference2Mobile || "");
      if (kind === "party") return partyMobile === mobileNo;
      if (kind === "reference1") return ref1Mobile === mobileNo;
      return ref2Mobile === mobileNo;
    });
    if (!matchedInvoice) return null;
    if (kind === "party") return { customerId: matchedInvoice.customerId || null, partyName: matchedInvoice.partyName || "", address: matchedInvoice.address || "", partyCityVillage: matchedInvoice.partyCityVillage || "", mobileNo: matchedInvoice.mobileNo || mobileNo, adharNo: matchedInvoice.adharNo || "" } satisfies PartyLookupResult;
    if (kind === "reference1") return { name: matchedInvoice.reference1 || "", address: matchedInvoice.reference1Address || "", city: matchedInvoice.reference1City || "", mobile: matchedInvoice.reference1Mobile || mobileNo } satisfies PartyLookupResult;
    return { name: matchedInvoice.reference2 || "", address: matchedInvoice.reference2Address || "", city: matchedInvoice.reference2City || "", mobile: matchedInvoice.reference2Mobile || mobileNo } satisfies PartyLookupResult;
  }, [getInvoicesForLookup]);

  const performPartyLookup = useCallback(async (kind: "party" | "reference1" | "reference2", rawMobile: string) => {
    const mobileNo = normalizeMobile(rawMobile);
    if (!isLookupReady(mobileNo)) {
      if (kind === "party") setPartyLookupState(idleLookupState());
      else setReferenceLookupState((prev) => ({ ...prev, [kind]: idleLookupState() }));
      return;
    }
    const token = sessionStorage.getItem("authToken") || "";
    if (!token) return;
    const requestId = ++lookupRequestRef.current[kind];
    if (kind === "party") setPartyLookupState({ loading: true, message: "Fetching customer details...", found: false });
    else setReferenceLookupState((prev) => ({ ...prev, [kind]: { loading: true, message: "Fetching customer details...", found: false } }));
    try {
      let lookupData: PartyLookupResult | null = null;
      if (lookupPartyRouteAvailableRef.current) {
        const result = await salesInvoiceAPI.lookupPartyByMobile(token, mobileNo);
        const routeMissing = !result?.success && typeof result?.message === "string" && result.message.toLowerCase().includes("route not found");
        if (routeMissing) { lookupPartyRouteAvailableRef.current = false; }
        else if (result?.success && result?.data) { lookupData = result.data; }
      }
      if (!lookupData) { const fallbackData = await fallbackLookupFromInvoices(kind, mobileNo); if (fallbackData) lookupData = fallbackData; }
      if (lookupRequestRef.current[kind] !== requestId) return;
      const found = Boolean(lookupData);
      if (found) {
        if (kind === "party") { applyPartyLookupData(lookupData); setPartyLookupState({ loading: false, message: "Customer details auto-filled.", found: true }); }
        else { applyReferenceLookupData(kind, lookupData); setReferenceLookupState((prev) => ({ ...prev, [kind]: { loading: false, message: "Customer details auto-filled.", found: true } })); }
        showLookupToast("success", kind, "Customer details auto-filled successfully.");
        return;
      }
      if (kind === "party") { clearPartyLookupData(); setPartyLookupState({ loading: false, message: "No customer data found.", found: false }); }
      else { clearReferenceLookupData(kind); setReferenceLookupState((prev) => ({ ...prev, [kind]: { loading: false, message: "No customer data found.", found: false } })); }
      showLookupToast("error", kind, "No customer data found.");
    } catch {
      if (lookupRequestRef.current[kind] !== requestId) return;
      const fallbackState = { loading: false, message: "Customer lookup failed.", found: false };
      if (kind === "party") setPartyLookupState(fallbackState);
      else setReferenceLookupState((prev) => ({ ...prev, [kind]: fallbackState }));
      showLookupToast("error", kind, "Customer lookup failed.");
    }
  }, [applyPartyLookupData, applyReferenceLookupData, clearPartyLookupData, clearReferenceLookupData, fallbackLookupFromInvoices, showLookupToast]);

  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("authToken") || "";
      const [brandRes, itemRes] = await Promise.all([
        brandAPI.getAll(token),
        itemAPI.getAll(token),
        // Temporarily disabled: Finance Companies API call.
        // financeCompanyAPI.getAll(token),
      ]);
      if (brandRes.success)       setBrands(brandRes.data);
      if (itemRes.success)        setItemsList(itemRes.data);
      // Temporarily disabled: Finance Companies data remains empty.
      // if (financeCompRes.success) setFinanceCompanies(financeCompRes.data);
    };
    load();
  }, []);

  const loadColorsForBrand = useCallback(async (brandId?: string) => {
    if (!brandId || colorsByBrand[brandId] || colorLoadingByBrand[brandId]) return;
    setColorLoadingByBrand((prev) => ({ ...prev, [brandId]: true }));
    try {
      // Temporarily disabled: Colour Master API call.
      // const token = sessionStorage.getItem("authToken") || "";
      // const result = await colorAPI.getByBrand(token, brandId);
      const result = { data: [] };
      const options = Array.isArray(result?.data) ? result.data.map((c: { id: string; colorName: string }) => ({ id: c.id, colorName: c.colorName })) : [];
      setColorsByBrand((prev) => ({ ...prev, [brandId]: options }));
    } catch {
      setColorsByBrand((prev) => ({ ...prev, [brandId]: [] }));
    } finally {
      setColorLoadingByBrand((prev) => ({ ...prev, [brandId]: false }));
    }
  }, [colorLoadingByBrand, colorsByBrand]);

  useEffect(() => {
    const brandIds = [...new Set(values.items.map((i) => i.brandId).filter(Boolean))] as string[];
    brandIds.forEach((id) => { void loadColorsForBrand(id); });
  }, [values.items, loadColorsForBrand]);

  // ── Computed summary values ───────────────────────────────────────────────
  // Per-item totals (from the item rows in the table)
  const totalQty        = values.items.reduce((s, i) => s + toNumber(i.qty), 0);
  const grossAmount     = values.items.reduce((s, i) => s + toNumber(i.qty) * toNumber(i.rate), 0);
  // FIX: totalScheme comes from per-item scheme, not a top-level field
  const totalScheme     = values.items.reduce((s, i) => s + toNumber(i.scheme), 0);
  const totalDiscountRs = values.items.reduce((s, i) => s + toNumber(i.discountRs), 0);
  // taxableAmount = (qty * rate) - scheme - discountRs  (i.e. item.amount)
  const taxableAmount   = values.items.reduce((s, i) => s + toNumber(i.amount), 0);
  // Invoice-level discount follows the purchase-invoice pattern and applies on the taxable subtotal.
  const discountAmount  = (taxableAmount * toNumber(values.discountPercent)) / 100;
  const totalSGST       = values.items.reduce((s, i) => s + toNumber(i.sgstAmount), 0);
  const totalCGST       = values.items.reduce((s, i) => s + toNumber(i.cgstAmount), 0);
  const totalIGST       = values.items.reduce((s, i) => s + toNumber(i.igstAmount), 0);
  // Installation from per-item installation values
  const totalInstallation = values.items.reduce((s, i) => s + toNumber(i.installation), 0);
  const totalBookingItems = values.items.reduce((s, i) => s + toNumber(i.bookingAmount), 0);
  // Buyback total from items
  const totalBuyBackItems = values.items.reduce((s, i) => s + toNumber(i.buyBack), 0);

  // Keep sales net-amount math aligned with purchase invoices:
  // base less discounts/scheme, then add invoice-level charges and installation amounts.
  const netAmount =
    grossAmount
    - totalScheme
    - totalDiscountRs
    - discountAmount
    + toNumber(values.freightAmount)
    + toNumber(values.otherCharges)
    + toNumber(values.processingFees1)
    + toNumber(values.processingFees2)
    + toNumber(values.installationAmt)
    + totalInstallation;

  const roundOff = parseFloat((Math.round(netAmount) - netAmount).toFixed(2));
  const roundedNetAmount = Math.round(netAmount);
  const marginValue = toNumber(values.margin);
  const mopValue = parseFloat(String(values.mop).replace(/[^0-9.-]/g, "")) || 0;
  const bookingValue = toNumber(values.booking);
  const buyBackValue = toNumber(values.buyBack);
  const mopOutputValue = mopValue > 0 ? parseFloat((marginValue - mopValue).toFixed(2)) : 0;
  const bookingOutputValue = bookingValue > 0 ? parseFloat((marginValue - bookingValue).toFixed(2)) : 0;
  const buyBackOutputValue = buyBackValue > 0 ? parseFloat((marginValue - buyBackValue).toFixed(2)) : 0;

  // ── Detect Gujarat vs inter-state from item GST data ─────────────────────
  useEffect(() => {
    const hasInterstateTax = values.items.some((item) => toNumber(item.igstPercent) > 0 || toNumber(item.igstAmount) > 0);
    const hasIntrastateTax = values.items.some((item) => toNumber(item.sgstPercent) > 0 || toNumber(item.sgstAmount) > 0 || toNumber(item.cgstPercent) > 0 || toNumber(item.cgstAmount) > 0);
    if (!hasInterstateTax && !hasIntrastateTax) return;
    const inferredIsGujaratCustomer = !hasInterstateTax;
    setIsGujaratCustomer((prev) => prev === inferredIsGujaratCustomer ? prev : inferredIsGujaratCustomer);
  }, [values.items]);

  // ── Re-apply GST when Gujarat toggle changes ──────────────────────────────
  useEffect(() => {
    if (values.items.length === 0) return;
    let changed = false;
    const normalizedItems = values.items.map((item) => {
      const masterItem = itemsList.find((entry) => String(entry.id) === String(item.itemId || ""));
      const resolvedGstPercent = toNumber(item.gstPercent) || toNumber(item.sgstPercent) + toNumber(item.cgstPercent) + toNumber(item.igstPercent) || toNumber(masterItem?.gst);
      const resolvedIncPercent = toNumber(item.incPercent) || toNumber(masterItem?.incentive);
      if (resolvedGstPercent <= 0 && resolvedIncPercent <= 0) return item;
      const taxParts = resolvedGstPercent > 0
        ? computeGST(toNumber(item.amount), resolvedGstPercent, isGujaratCustomer)
        : { sgstPercent: toNumber(item.sgstPercent), sgstAmount: toNumber(item.sgstAmount), cgstPercent: toNumber(item.cgstPercent), cgstAmount: toNumber(item.cgstAmount), igstPercent: toNumber(item.igstPercent), igstAmount: toNumber(item.igstAmount) };
      const needsUpdate =
        Math.abs(toNumber(item.gstPercent) - resolvedGstPercent) > 0.001 ||
        Math.abs(toNumber(item.incPercent) - resolvedIncPercent) > 0.001 ||
        Math.abs(toNumber(item.sgstPercent) - taxParts.sgstPercent) > 0.001 ||
        Math.abs(toNumber(item.sgstAmount) - taxParts.sgstAmount) > 0.001 ||
        Math.abs(toNumber(item.cgstPercent) - taxParts.cgstPercent) > 0.001 ||
        Math.abs(toNumber(item.cgstAmount) - taxParts.cgstAmount) > 0.001 ||
        Math.abs(toNumber(item.igstPercent) - taxParts.igstPercent) > 0.001 ||
        Math.abs(toNumber(item.igstAmount) - taxParts.igstAmount) > 0.001;
      if (!needsUpdate) return item;
      changed = true;
      return { ...item, gstPercent: resolvedGstPercent, incPercent: resolvedIncPercent, ...taxParts };
    });
    if (changed) onItemsChange(normalizedItems);
  }, [isGujaratCustomer, itemsList, onItemsChange, values.items]);

  useEffect(() => {
    const nextBooking = parseFloat(totalBookingItems.toFixed(2));
    const nextBuyBack = parseFloat(totalBuyBackItems.toFixed(2));

    if (
      Math.abs(toNumber(values.booking) - nextBooking) < 0.001 &&
      Math.abs(toNumber(values.buyBack) - nextBuyBack) < 0.001
    ) {
      return;
    }

    onChange({
      booking: nextBooking,
      buyBack: nextBuyBack,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalBookingItems, totalBuyBackItems]);

  // ── Auto-calculate Margin and Balance ────────────────────────────────────
  useEffect(() => {
    const totalInstallmentAmt = values.installments.reduce((s, i) => s + toNumber(i.totalAmt), 0);
    const autoMargin =
      roundedNetAmount
      - toNumber(values.fAmt1)
      - toNumber(values.fAmt2)
      - totalInstallmentAmt;
    const nextMargin = parseFloat(autoMargin.toFixed(2));
    const autoBalance = parseFloat((roundedNetAmount - nextMargin).toFixed(2));
    onChange({
      margin: nextMargin,
      balance: autoBalance,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedNetAmount, values.fAmt1, values.fAmt2, values.installments]);

  const updateItem = useCallback((id: string, field: keyof SIItem | "amountInput", value: any) => {
    const updated = values.items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, [field]: value };
      if (field === "brandId") {
        const brand = brands.find((b) => String(b.id) === String(value));
        next.brandName = brand?.name || "";
        next.variantId = "";
        next.variant = "";
      }
      if (field === "itemId") {
        const foundItem = itemsList.find((i) => String(i.id) === String(value));
        if (foundItem) {
          next.itemName    = foundItem.itemName;
          next.gstPercent  = foundItem.gst || 0;
          next.incPercent  = toNumber(foundItem.incentive);
          next.variantId   = "";
          next.variant     = "";
          const variants = getItemVariants(foundItem);
          if (variants.length === 1) {
            next.variantId = sid(variants[0].id || variants[0].variant);
            next.variant = normalizeVariantLabel(variants[0].variant);
          }
          const brand = brands.find((b) => String(b.id) === String(foundItem.brandId));
          if (brand) { next.brandId = String(foundItem.brandId); next.brandName = brand.name; }
        }
      }
      if (field === "variantId") {
        const foundItem = itemsList.find((i) => String(i.id) === String(next.itemId || ""));
        const variant = findItemVariant(foundItem, value);
        next.variantId = sid(variant?.id || value);
        next.variant = normalizeVariantLabel(variant?.variant);
      }
      if (["qty", "rate", "scheme", "discountPercent", "itemId"].includes(field as string)) {
        Object.assign(next, recalculateSIItem(next, isGujaratCustomer));
      }
      if (field === "amountInput") {
        const newAmt = Math.max(0, Number(value));
        next.amount = newAmt;
        if (next.qty > 0) next.rate = parseFloat(((newAmt + next.discountRs) / next.qty).toFixed(4));
        if (next.gstPercent > 0) Object.assign(next, computeGST(newAmt, next.gstPercent, isGujaratCustomer));
      }
      return next;
    });
    onItemsChange(updated);
  }, [brands, itemsList, isGujaratCustomer, values.items, onItemsChange]);

  const toggleDescription     = (id: string) => onItemsChange(values.items.map((i) => i.id === id ? { ...i, showDescription: !i.showDescription } : i));
  const handleDescriptionChange   = (id: string, v: string) => onItemsChange(values.items.map((i) => i.id === id ? { ...i, remarks: v } : i));
  const handleSerialRowChange     = (itemId: string, rowId: string, field: "color" | "srNo", v: string) =>
    onItemsChange(values.items.map((i) => i.id !== itemId ? i : { ...i, serialRows: i.serialRows.map((r) => r.id === rowId ? { ...r, [field]: v } : r) }));
  const handleAddSerialRow        = (itemId: string) => onItemsChange(values.items.map((i) => i.id !== itemId ? i : { ...i, serialRows: [...i.serialRows, emptySerialRow()] }));
  const handleRemoveSerialRow     = (itemId: string, rowId: string) => onItemsChange(values.items.map((i) => {
    if (i.id !== itemId) return i;
    if (i.serialRows.length <= 1) return i;
    return { ...i, serialRows: i.serialRows.filter((r) => r.id !== rowId) };
  }));
  const handleToggleSerialTable   = (itemId: string) => onItemsChange(values.items.map((i) => i.id === itemId ? { ...i, showSerialTable: !i.showSerialTable } : i));
  const handleRequestSerialFocus  = (itemId: string) => {
    onItemsChange(values.items.map((i) => i.id === itemId ? { ...i, showDescription: true, showSerialTable: true } : i));
    setSerialFocusRequest({ itemId, token: Date.now() });
  };

  const handleSerialScan = useCallback(async (itemId: string, rowId: string, serialNo: string) => {
    const token = sessionStorage.getItem("authToken") || "";
    if (!token) return "Authentication required to lookup serial.";
    const result = await salesInvoiceAPI.lookupSerial(token, serialNo);
    if (!result.success || !result.data) return result.message || "Serial lookup failed.";
    const serial = result.data;
    let lookupError: string | null = null;
    onItemsChange(values.items.map((item) => {
      if (item.id !== itemId) return item;
      const existingItemId = String(item.itemId || "");
      const lookupItemId = String(serial.itemId || "");
      if (existingItemId && lookupItemId && existingItemId !== lookupItemId) {
        lookupError = `Serial ${serial.serialNo} belongs to ${serial.itemName || "another item"}.`;
        return item;
      }
      let nextRows = item.serialRows.map((row) => ({ ...row }));
      let targetIndex = Math.max(0, nextRows.findIndex((row) => row.id === rowId));
      const lookupColor = (serial.color || "").trim();
      if (lookupColor) {
        const currentColor = (nextRows[targetIndex]?.color || "").trim().toLowerCase();
        if (!currentColor) { nextRows[targetIndex] = { ...nextRows[targetIndex], color: lookupColor }; }
        else if (currentColor !== lookupColor.toLowerCase()) {
          const existingColorIndex = nextRows.findIndex((row) => row.color.trim().toLowerCase() === lookupColor.toLowerCase());
          if (existingColorIndex >= 0) { targetIndex = existingColorIndex; }
          else { nextRows = [...nextRows, { id: genId(), color: lookupColor, srNo: "" }]; targetIndex = nextRows.length - 1; }
        }
      }
      const existing = (nextRows[targetIndex]?.srNo || "").trimEnd();
      const separator = existing.length > 0 && !existing.endsWith(",") ? "," : "";
      nextRows[targetIndex] = { ...nextRows[targetIndex], srNo: `${existing}${separator}${serial.serialNo},` };
      const nextQty = nextRows.reduce((sum, row) => sum + countSerials(row.srNo), 0);
      const nextRate = toNumber(serial.purchaseRate ?? serial.rate);
      const nextItem: SIItem = {
        ...item, itemId: serial.itemId ? String(serial.itemId) : item.itemId,
        brandId: serial.brandId ? String(serial.brandId) : item.brandId,
        variantId: (serial as any).variantId ? String((serial as any).variantId) : item.variantId,
        variant: normalizeVariantLabel((serial as any).variant) || item.variant,
        itemName: serial.itemName || item.itemName, brandName: serial.brandName || item.brandName,
        gstPercent: toNumber(serial.gstPercent), qty: nextQty, rate: nextRate, serialRows: nextRows,
        showDescription: true, showSerialTable: true,
      };
      const masterItem = itemsList.find((entry) => String(entry.id) === String(nextItem.itemId || ""));
      if (masterItem) nextItem.incPercent = toNumber(masterItem.incentive);
      return recalculateSIItem(nextItem, isGujaratCustomer);
    }));
    return lookupError;
  }, [isGujaratCustomer, itemsList, onItemsChange, values.items]);

  const addItem    = () => onItemsChange([...values.items, emptyItem()]);
  const removeItem = (id: string) => { if (values.items.length === 1) return; onItemsChange(values.items.filter((i) => i.id !== id)); };
  const moveItem   = (id: string, dir: "up" | "down") => {
    const arr = [...values.items];
    const idx = arr.findIndex((i) => i.id === id);
    if (dir === "up" && idx === 0) return;
    if (dir === "down" && idx === arr.length - 1) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    onItemsChange(arr);
  };

  const updateInstallment = (idx: number, field: keyof Installment, value: any) => {
    const arr = [...values.installments];
    arr[idx] = { ...arr[idx], [field]: value };
    set("installments", arr);
  };

  const financeCompanyOptions = financeCompanies.map((f) => ({ id: String(f.id), label: f.name }));
  const getFinanceCompanySelectValue = useCallback((value: string) => {
    if (!value) return "";
    const normalizedValue = String(value).trim().toLowerCase();
    const match = financeCompanyOptions.find((o) => o.id === String(value) || o.label.trim().toLowerCase() === normalizedValue);
    return match?.id || "";
  }, [financeCompanyOptions]);

  const financialRows = [
    { id: "1", fAmt: values.fAmt1, fComp: values.fComp1, dbd: values.dbd1, processingFees: values.processingFees1, fileNo: values.fileNo1, onFAmtChange: (v: number) => set("fAmt1", v), onFCompChange: (v: string) => set("fComp1", v), onDbdChange: (v: number) => set("dbd1", v), onProcessingFeesChange: (v: number) => set("processingFees1", v), onFileNoChange: (v: string) => set("fileNo1", v) },
    { id: "2", fAmt: values.fAmt2, fComp: values.fComp2, dbd: values.dbd2, processingFees: values.processingFees2, fileNo: values.fileNo2, onFAmtChange: (v: number) => set("fAmt2", v), onFCompChange: (v: string) => set("fComp2", v), onDbdChange: (v: number) => set("dbd2", v), onProcessingFeesChange: (v: number) => set("processingFees2", v), onFileNoChange: (v: string) => set("fileNo2", v) },
  ];

  const tblInput: React.CSSProperties = { width: "100%", height: "34px", border: "none", background: "transparent", outline: "none", fontSize: "12px", padding: "0 10px", textAlign: "center", appearance: "textfield" as any };

  return (
    <div className="space-y-6">
      <style>{`
        .no-spinner::-webkit-outer-spin-button,
        .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinner[type=number] { -moz-appearance: textfield; }
        .si-table { border-collapse: collapse; width: 100%; font-size: .875rem; }
        .si-table th { border: 1px solid rgba(255,255,255,.25); padding: 8px 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .si-table td { border: 1px solid #d1d5db; vertical-align: middle; }
        .si-table input[type=number]:focus,
        .si-table input[type=text]:focus,
        .si-table input[type=date]:focus { background-color: rgba(0,0,0,.03); outline: none; }
        .inst-table { border-collapse: collapse; width: 100%; font-size: .875rem; }
        .inst-table th { border: 1px solid rgba(255,255,255,.25); padding: 8px 10px; font-size: 11px; font-weight: 600; white-space: nowrap; text-align: center; }
        .inst-table td { border: 1px solid #d1d5db; vertical-align: middle; }
      `}</style>

      {/* ── Invoice Details ── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Invoice Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Bill No.</Label>
            <div className={cn("h-10 w-full flex items-center px-3 rounded-lg border font-mono text-sm font-semibold tracking-wide select-all", billLoading ? "bg-muted text-muted-foreground border-border animate-pulse" : "bg-red-50 text-red-700 border-red-200")}>
              {billLoading ? "Generating…" : (values.billNumber || "—")}
            </div>
            <p className="text-[11px] text-muted-foreground">Auto-generated · cannot be edited</p>
          </div>
          <div className="space-y-2">
            <Label>Date <span className="text-destructive">*</span></Label>
            <Input className="h-10 w-full" type="date" value={values.billDate} onChange={(e) => set("billDate", e.target.value)} required />
          </div>
        </div>
      </div>

      {/* ── Party / Customer ── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Party / Customer</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Mobile No.</Label>
            <Input className="h-10 w-full" value={values.mobileNo}
              onChange={(e) => { set("mobileNo", e.target.value); if (!normalizeMobile(e.target.value)) { clearPartyLookupData(); setPartyLookupState(idleLookupState()); } }}
              onBlur={(e) => void performPartyLookup("party", e.target.value)} />
            {partyLookupState.message && (
              <p className={cn("text-xs", partyLookupState.found ? "text-emerald-600" : partyLookupState.loading ? "text-muted-foreground" : "text-red-600")}>{partyLookupState.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Party <span className="text-destructive">*</span></Label>
            <Input className="h-10 w-full" value={values.partyName} onChange={(e) => set("partyName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Adhar No.</Label>
            <Input className="h-10 w-full" value={values.adharNo} onChange={(e) => set("adharNo", e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Address</Label>
            <Textarea className="min-h-[80px] bg-white" value={values.address} onChange={(e) => set("address", e.target.value)} rows={3} />
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label>Village / City</Label>
            <Input className="h-10 w-full" value={values.partyCityVillage} onChange={(e) => set("partyCityVillage", e.target.value)} />
          </div>
        </div>

        {/* References */}
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { key: "reference1" as const, title: "Reference 1", name: values.reference1, mobile: values.reference1Mobile, address: values.reference1Address, city: values.reference1City, setName: (v: string) => set("reference1", v), setMobile: (v: string) => set("reference1Mobile", v), setAddress: (v: string) => set("reference1Address", v), setCity: (v: string) => set("reference1City", v) },
            { key: "reference2" as const, title: "Reference 2", name: values.reference2, mobile: values.reference2Mobile, address: values.reference2Address, city: values.reference2City, setName: (v: string) => set("reference2", v), setMobile: (v: string) => set("reference2Mobile", v), setAddress: (v: string) => set("reference2Address", v), setCity: (v: string) => set("reference2City", v) },
          ].map((ref) => (
            <div key={ref.title} className="rounded-xl border border-border/70 bg-white p-4 shadow-sm space-y-3">
              <h4 className="font-semibold text-lg">{ref.title}</h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mobile</Label>
                  <Input className="h-9" value={ref.mobile}
                    onChange={(e) => { ref.setMobile(e.target.value); if (!normalizeMobile(e.target.value)) { clearReferenceLookupData(ref.key); setReferenceLookupState((prev) => ({ ...prev, [ref.key]: idleLookupState() })); } }}
                    onBlur={(e) => void performPartyLookup(ref.key, e.target.value)} />
                  {referenceLookupState[ref.key].message && (
                    <p className={cn("text-[11px]", referenceLookupState[ref.key].found ? "text-emerald-600" : referenceLookupState[ref.key].loading ? "text-muted-foreground" : "text-red-600")}>{referenceLookupState[ref.key].message}</p>
                  )}
                </div>
                <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input className="h-9" value={ref.name} onChange={(e) => ref.setName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Address</Label><Input className="h-9" value={ref.address} onChange={(e) => ref.setAddress(e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Village / City</Label><Input className="h-9" value={ref.city} onChange={(e) => ref.setCity(e.target.value)} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Items Table ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Items</h3>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="si-table">
            <thead>
              <tr className="bg-red-700 text-white">
                <th style={{ width: "50px" }}>#</th>
                <th style={{ width: "72px" }}>Sr.No.</th>
                <th style={{ width: "150px" }}>Brand</th>
                <th style={{ width: "160px" }}>Item <span style={{ color: "#fca5a5" }}>*</span></th>
                <th style={{ width: "140px" }}>Variant</th>
                <th style={{ width: "120px" }}>Remarks</th>
                <th style={{ width: "72px" }}>Qty <span style={{ color: "#fca5a5" }}>*</span></th>
                <th style={{ width: "95px" }}>Rate</th>
                <th style={{ width: "100px" }}>Amount</th>
                <th style={{ width: "85px" }}>Scheme</th>
                <th style={{ width: "72px" }}>Disc %</th>
                <th style={{ width: "85px" }}>Disc Rs</th>
                {isGujaratCustomer && (<><th style={{ width: "85px" }}>S.GST</th><th style={{ width: "85px" }}>C.GST</th></>)}
                {!isGujaratCustomer && <th style={{ width: "85px" }}>I.GST</th>}
                <th style={{ width: "90px" }}>Incentive</th>
                <th style={{ width: "90px" }}>Buyback</th>
                <th style={{ width: "95px" }}>Installation</th>
                <th style={{ width: "110px" }}>Booking Amt</th>
                <th style={{ width: "80px" }}>Demo</th>
                <th style={{ width: "90px" }}>Self Delivery</th>
                <th style={{ width: "60px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {values.items.map((item, index) => (
                <SIItemRow key={item.id} item={item} index={index} brands={brands} items={itemsList}
                  isGujaratCustomer={isGujaratCustomer}
                  isFirst={index === 0} isLast={index === values.items.length - 1} isSingle={values.items.length === 1}
                  onUpdate={updateItem} onRemove={removeItem} onAddRow={addItem} onMove={moveItem}
                  onToggleDescription={toggleDescription} onDescriptionChange={handleDescriptionChange}
                  onSerialRowChange={handleSerialRowChange} onAddSerialRow={handleAddSerialRow}
                  onRemoveSerialRow={handleRemoveSerialRow} onToggleSerialTable={handleToggleSerialTable}
                  onRequestSerialFocus={handleRequestSerialFocus}
                  onScanSerial={handleSerialScan}
                  autoFocusToken={serialFocusRequest?.itemId === item.id ? serialFocusRequest.token : undefined}
                  colorOptions={item.brandId ? (colorsByBrand[item.brandId] || []) : []}
                  colorLoading={item.brandId ? Boolean(colorLoadingByBrand[item.brandId]) : false}
                  invoiceMargin={values.margin}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Installments + Summary ── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Installments */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg border-b pb-2">Installments</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="inst-table">
              <thead>
                <tr className="bg-red-700 text-white">
                  <th style={{ width: "40px" }}>#</th>
                  <th>Inst. Amt.</th>
                  <th>No. Of Inst.</th>
                  <th>Total Amt.</th>
                  <th>St. Date</th>
                  <th>Days</th>
                </tr>
              </thead>
              <tbody>
                {values.installments.flatMap((inst, index) => {
                  const installmentRow = (
                    <tr key={inst.id} style={{ backgroundColor: index % 2 === 0 ? "white" : "#f9fafb" }}>
                      <td style={{ textAlign: "center", fontSize: "11px", fontWeight: 600, color: "#6b7280", padding: "4px" }}>{index + 1}</td>
                      <td style={{ padding: 0 }}><input type="number" className="no-spinner" value={inst.instAmt || ""} onChange={(e) => updateInstallment(index, "instAmt", parseFloat(e.target.value) || 0)} style={tblInput} /></td>
                      <td style={{ padding: 0 }}><input type="number" className="no-spinner" value={inst.noOfInst || ""} onChange={(e) => updateInstallment(index, "noOfInst", parseFloat(e.target.value) || 0)} style={tblInput} /></td>
                      <td style={{ padding: 0 }}><input type="number" className="no-spinner" value={inst.totalAmt || ""} onChange={(e) => updateInstallment(index, "totalAmt", parseFloat(e.target.value) || 0)} style={tblInput} /></td>
                      <td style={{ padding: 0 }}><input type="date" value={inst.stDate} onChange={(e) => updateInstallment(index, "stDate", e.target.value)} style={{ ...tblInput, textAlign: "left", padding: "0 8px" }} /></td>
                      <td style={{ padding: 0 }}><input type="number" className="no-spinner" value={inst.days || ""} onChange={(e) => updateInstallment(index, "days", parseFloat(e.target.value) || 0)} style={tblInput} /></td>
                    </tr>
                  );
                  if (index !== 0) return [installmentRow];
                  const paymentAtDeliveryRow = (
                    <tr key={`${inst.id}-payment-at-delivery`} style={{ backgroundColor: "#f9fafb" }}>
                      <td colSpan={6} style={{ padding: "8px 12px" }}>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" id="payAtDelivery" checked={values.paymentAtDelivery} onChange={(e) => set("paymentAtDelivery", e.target.checked)} className="rounded" />
                          <Label htmlFor="payAtDelivery" className="cursor-pointer">Payment At Delivery</Label>
                          {values.paymentAtDelivery && <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Active</span>}
                        </div>
                      </td>
                    </tr>
                  );
                  return [installmentRow, paymentAtDeliveryRow];
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Summary ── */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-2.5 border border-border/40">
          <SRow label="Qty Total"    value={totalQty.toString()} />
          <SRow label="Gross Amount" value={`₹ ${formatMoney(grossAmount)}`} />

          {/* Per-item scheme total */}
          {totalScheme > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Scheme (items)</span>
              <span className="font-medium text-green-600">- ₹ {formatMoney(totalScheme)}</span>
            </div>
          )}
          {/* Per-item discount total */}
          {totalDiscountRs > 0 && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Item Disc. (₹)</span>
              <span className="font-medium text-green-600">- ₹ {formatMoney(totalDiscountRs)}</span>
            </div>
          )}

          {/* Invoice-level discount */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground shrink-0">Discount ({values.discountPercent}%)</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" className="h-6 w-12 text-xs text-right no-spinner border-border/60 px-1"
                value={values.discountPercent || ""} min={0} max={100}
                onChange={(e) => set("discountPercent", parseFloat(e.target.value) || 0)} />
              <span className="font-medium text-red-600 whitespace-nowrap text-xs">- ₹ {formatMoney(discountAmount)}</span>
            </div>
          </div>

          {isGujaratCustomer ? (
            <>
              <SRow label="S.GST" value={`₹ ${formatMoney(totalSGST)}`} />
              <SRow label="C.GST" value={`₹ ${formatMoney(totalCGST)}`} />
            </>
          ) : (
            <SRow label="I.GST" value={`₹ ${formatMoney(totalIGST)}`} />
          )}

          {/* Freight */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Freight</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" className="h-6 w-20 text-xs text-right no-spinner border-border/60 px-1"
                value={values.freightAmount || ""} onChange={(e) => set("freightAmount", parseFloat(e.target.value) || 0)} />
              <span className="font-medium text-red-600 whitespace-nowrap text-xs">₹ {formatMoney(values.freightAmount)}</span>
            </div>
          </div>

          {/* Other Charges */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Other Charges</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" className="h-6 w-20 text-xs text-right no-spinner border-border/60 px-1"
                value={values.otherCharges || ""} onChange={(e) => set("otherCharges", parseFloat(e.target.value) || 0)} />
              <span className="font-medium text-red-600 whitespace-nowrap text-xs">₹ {formatMoney(values.otherCharges)}</span>
            </div>
          </div>

          {/* Item-level installation total (read-only, from items) */}
          {totalInstallation > 0 && (
            <SRow label="Installation (items)" value={`₹ ${formatMoney(totalInstallation)}`} />
          )}

          {/* Invoice-level installation (e.g. delivery charge) */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Installation Amt.</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <Input type="number" className="h-6 w-20 text-xs text-right no-spinner border-border/60 px-1"
                value={values.installationAmt || ""} onChange={(e) => set("installationAmt", parseFloat(e.target.value) || 0)} />
              <span className="font-medium text-red-600 whitespace-nowrap text-xs">₹ {formatMoney(values.installationAmt)}</span>
            </div>
          </div>

          {/* Round Off */}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground italic">Round Off</span>
            <span className={`font-medium text-xs ${roundOff >= 0 ? "text-green-600" : "text-red-600"}`}>
              {roundOff >= 0 ? "+ " : ""}₹ {formatMoney(roundOff)}
            </span>
          </div>

          {/* Net Amount */}
          <div className="flex justify-between items-center text-base font-bold border-t pt-2 mt-1">
            <span>Net Amount</span>
            <span className="text-primary">₹ {formatMoney(roundedNetAmount)}</span>
          </div>

          {/* Payment breakdown */}
          <div className="border-t pt-2 mt-1 space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Margin</span>
              <span className="font-semibold text-blue-600">₹ {formatMoney(values.margin)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground shrink-0">MOP</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <Input className="h-6 w-20 text-xs text-right border-border/60 px-1 no-spinner" value={values.mop} onChange={(e) => set("mop", e.target.value)} placeholder="0" />
                <span className={`font-medium whitespace-nowrap text-xs ${mopOutputValue < 0 ? "text-red-600" : "text-green-600"}`}>₹ {formatMoney(mopOutputValue)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground shrink-0">Booking</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <Input type="number" readOnly className="h-6 w-20 text-xs text-right no-spinner border-border/60 px-1 bg-muted/40" value={values.booking || ""} />
                <span className={`font-medium whitespace-nowrap text-xs ${bookingOutputValue < 0 ? "text-red-600" : "text-green-600"}`}>₹ {formatMoney(bookingOutputValue)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground shrink-0">Buy Back</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <Input type="number" readOnly className="h-6 w-20 text-xs text-right no-spinner border-border/60 px-1 bg-muted/40" value={values.buyBack || ""} />
                <span className={`font-medium whitespace-nowrap text-xs ${buyBackOutputValue < 0 ? "text-red-600" : "text-green-600"}`}>₹ {formatMoney(buyBackOutputValue)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-semibold text-orange-600">₹ {formatMoney(values.balance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Financial Details Table ── */}
      <div className="space-y-3">
        <h3 className="font-semibold text-lg border-b pb-2">Financial Details</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="inst-table">
            <thead>
              <tr className="bg-red-700 text-white">
                <th style={{ width: "40px" }}>#</th>
                <th>F.Comp</th>
                <th>F.Amt</th>
                <th>DBD</th>
                <th>Processing Fees</th>
                <th>File #</th>
              </tr>
            </thead>
            <tbody>
              {financialRows.map((row, idx) => (
                <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? "white" : "#f9fafb" }}>
                  <td style={{ textAlign: "center", color: "#6b7280", fontSize: "11px", fontWeight: 600, padding: "4px" }}>{idx + 1}</td>
                  <td style={{ padding: "0" }}>
                    <TableSelect value={getFinanceCompanySelectValue(row.fComp)} options={financeCompanyOptions} placeholder="Select company" size="md" onValueChange={(v) => row.onFCompChange(v)} />
                  </td>
                  <td style={{ padding: "0" }}><input type="number" className="no-spinner" value={row.fAmt || ""} onChange={(e) => row.onFAmtChange(parseFloat(e.target.value) || 0)} style={tblInput} /></td>
                  <td style={{ padding: "0" }}><input type="number" className="no-spinner" value={row.dbd || ""} onChange={(e) => row.onDbdChange(parseFloat(e.target.value) || 0)} style={tblInput} /></td>
                  <td style={{ padding: 0 }}><input type="number" className="no-spinner" value={row.processingFees || ""} onChange={(e) => row.onProcessingFeesChange(parseFloat(e.target.value) || 0)} style={tblInput} /></td>
                  <td style={{ padding: "0" }}><input type="text" value={row.fileNo} onChange={(e) => row.onFileNoChange(e.target.value)} style={{ ...tblInput, textAlign: "left" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Payment ── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Payment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Cash Margin</Label><Input type="number" className="h-10 w-full no-spinner" value={values.cashMargin || ""} onChange={(e) => set("cashMargin", parseFloat(e.target.value) || 0)} /></div>
          <div className="space-y-2">
            <Label>Cashbook</Label>
            <Select value={values.cashbookId || "none"} onValueChange={(v) => set("cashbookId", v === "none" ? "" : v)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{cashbooks.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Online Margin</Label><Input type="number" className="h-10 w-full no-spinner" value={values.onlineMargin || ""} onChange={(e) => set("onlineMargin", parseFloat(e.target.value) || 0)} /></div>
          <div className="space-y-2">
            <Label>Bank Book</Label>
            <Select value={values.bankBookId || "none"} onValueChange={(v) => set("bankBookId", v === "none" ? "" : v)}>
              <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{bankBooks.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2"><Label>UTR #</Label><Input className="h-10 w-full" value={values.utrNumber} onChange={(e) => set("utrNumber", e.target.value)} /></div>
        </div>
      </div>

      {/* ── Salesman + Remarks ── */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg border-b pb-2">Salesman</h3>
          <Label>Salesman</Label>
          <Select value={values.salesmanId || "none"} onValueChange={(v) => set("salesmanId", v === "none" ? "" : v)}>
            <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">None</SelectItem>{salesmen.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg border-b pb-2">Remarks</h3>
          <Textarea value={values.remarks} onChange={(e) => set("remarks", e.target.value)} rows={3} className="min-h-[80px]" />
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-4 pt-4">
        <Button type="button" onClick={onSubmit} disabled={isSubmitting} className="flex-1 bg-gradient-to-r from-accent to-accent-secondary">
          {isSubmitting ? "Saving..." : mode === "add" ? "Save Sale Invoice" : "Update Sale Invoice"}
        </Button>
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => (onCancel ? onCancel() : window.history.back())} className="flex-1 bg-transparent">
          Cancel
        </Button>
      </div>
    </div>
  );
}
