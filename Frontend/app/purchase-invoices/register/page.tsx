"use client";

import type React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText, AlertCircle, Plus, Trash2, ArrowLeft,
  ChevronUp, ChevronDown, AlignLeft, X, Barcode, Hash, Link2,
} from "lucide-react";
import {
  purchaseInvoiceAPI, supplierAPI, brandAPI, itemAPI,
  purchaseOrderAPI, branchAPI, companyAPI,
} from "@/lib/api";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SearchableSupplierSelect } from "@/components/searchable-supplier-select";
import { TableSelect } from "@/components/table-select";
import { getSupplierTaxContext } from "@/lib/gst-utils";
import { ColorCombobox, type ColorOption } from "@/components/color-combobox";
import { colorAPI } from "@/lib/api";
import {
  findItemVariant,
  getItemVariantLineKey,
  getItemVariants,
  normalizeVariantLabel,
  sid,
} from "@/lib/item-variant-utils";

interface SerialRow { id: string; color: string; srNo: string; }

interface PIItem {
  id: string;
  purchaseOrderId?: string; poNumber?: string;
  itemId?: string; brandId?: string;
  variantId?: string; variant?: string;
  brandName: string; itemName: string;
  qty: number; rate: number; discountRs: number; amount: number;
  poRate: number; aTaxPercent: number;
  sgstPercent: number; sgstAmount: number;
  cgstPercent: number; cgstAmount: number;
  igstPercent: number; igstAmount: number;
  gstPercent: number;
  description: string;          // saved as `remarks` in DB
  serialRows: SerialRow[];
  showDescription: boolean; showSerialTable: boolean;
}

interface LinkedPOItem {
  itemId: string; itemName: string; brandId: string; brandName: string;
  variantId: string; variant: string;
  qty: number; rate: number; poNumber: string; poId: string; gstPercent: number;
}

const GUJARAT_STATE = "Gujarat";
const toNumber = (value: unknown) => Number(value) || 0;
const formatMoney = (value: unknown) =>
  toNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
const emptySerialRow = (): SerialRow => ({ id: genId(), color: "", srNo: "" });

const getDebitNoteAmount = (items: PIItem[], linkedPOItems: LinkedPOItem[]) => {
  const linkedMap = new Map(
    linkedPOItems.map((item) => [
      `${getItemVariantLineKey(item.itemId, item.variantId, item.variant)}::${item.poId}`,
      item,
    ])
  );

  return items
    .filter((item) => item.itemName.trim() && toNumber(item.qty) > 0)
    .reduce((sum, item) => {
      const key = `${getItemVariantLineKey(item.itemId, item.variantId, item.variant)}::${item.purchaseOrderId || ""}`;
      const linkedItem = linkedMap.get(key);
      const poRate = toNumber(item.poRate) || toNumber(linkedItem?.rate);
      if (!poRate) return sum;
      return sum + (toNumber(item.rate) - poRate) * toNumber(item.qty);
    }, 0);
};

const emptyItem = (): PIItem => ({
  id: genId(), purchaseOrderId: "", poNumber: "", itemId: "", brandId: "",
  variantId: "", variant: "",
  brandName: "", itemName: "", qty: 0, rate: 0, discountRs: 0, amount: 0,
  poRate: 0, aTaxPercent: 0,
  sgstPercent: 0, sgstAmount: 0, cgstPercent: 0, cgstAmount: 0,
  igstPercent: 0, igstAmount: 0, gstPercent: 0,
  description: "",
  serialRows: [emptySerialRow()],
  showDescription: false, showSerialTable: false,
});

function computeGSTFromBase(baseAmount: number, gstPercent: number, isGujarat: boolean) {
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

const countSerials = (srNo: string) => srNo.split(",").map((s) => s.trim()).filter(Boolean).length;

function normalizePOItemForPopup(raw: any) {
  const qty = Number(raw.remainingQty ?? raw.pendingQty ?? raw.balanceQty ?? raw.qty) || 0;
  const originalQty = Number(raw.qty) || qty;
  const rate = Number(raw.rate ?? raw.purchaseRate ?? 0);
  const amount = Number(raw.amount ?? raw.taxableAmount ?? 0) || qty * rate;
  const gstRate =
    Number(raw.gstRate) || Number(raw.gstPercent) || Number(raw.gst) ||
    Number(raw.aTaxPercent) || Number(raw.igstPercent) ||
    (Number(raw.sgstPercent) || 0) + (Number(raw.cgstPercent) || 0) || 0;
  return {
    id: raw.id || "", itemId: raw.itemId || "", brandId: raw.brandId || "",
    variantId: raw.variantId || raw.variant || "", variant: normalizeVariantLabel(raw.variant),
    brandName: raw.brandName || raw.brand || "", itemName: raw.itemName || raw.name || "",
    qty, originalQty, remainingQty: qty, rate, amount, gstRate,
    cgstPercent: Number(raw.cgstPercent ?? 0), cgstAmount: Number(raw.cgstAmount ?? raw.cgst ?? 0),
    sgstPercent: Number(raw.sgstPercent ?? 0), sgstAmount: Number(raw.sgstAmount ?? raw.sgst ?? 0),
    igstPercent: Number(raw.igstPercent ?? 0), igstAmount: Number(raw.igstAmount ?? raw.igst ?? 0),
    total: Number(raw.total ?? raw.lineTotal ?? 0) || amount,
    remarks: raw.remarks || "",
  };
}

// ── SerialTable ───────────────────────────────────────────────────────────────
function SerialTable({
  rows, itemName, expectedQty, colorOptions, colorLoading, onRowChange, onAddRow, onRemoveRow,
}: {
  rows: SerialRow[]; itemName: string; expectedQty: number;
  colorOptions: ColorOption[]; colorLoading: boolean;
  onRowChange: (rowId: string, field: "color" | "srNo", value: string) => void;
  onAddRow: () => void; onRemoveRow: (rowId: string) => void;
}) {
  const scanRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [dupWarnings, setDupWarnings] = useState<Record<string, string[]>>({});

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

  const handleScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowId: string) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const scanned = e.currentTarget.value.trim();
    if (!scanned) return;
    const allExisting = new Set<string>();
    rows.forEach((r) => r.srNo.split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => allExisting.add(s.toLowerCase())));
    if (allExisting.has(scanned.toLowerCase())) {
      setDupWarnings((prev) => ({ ...prev, [rowId]: [...(prev[rowId] || []).filter((d) => d !== scanned), scanned] }));
      e.currentTarget.style.background = "#fef2f2";
      e.currentTarget.style.borderColor = "#ef4444";
      setTimeout(() => { if (e.currentTarget) { e.currentTarget.style.background = ""; e.currentTarget.style.borderColor = ""; e.currentTarget.value = ""; } }, 1200);
      return;
    }
    const row = rows.find((r) => r.id === rowId);
    const existing = (row?.srNo || "").trimEnd();
    const sep = existing.length > 0 && !existing.endsWith(",") ? "," : "";
    const newVal = existing + sep + scanned + ",";
    onRowChange(rowId, "srNo", newVal);
    recomputeWarnings(rowId, newVal);
    e.currentTarget.value = "";
  };

  const handleTextareaChange = (rowId: string, value: string) => {
    onRowChange(rowId, "srNo", value);
    recomputeWarnings(rowId, value);
  };

  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[2fr_2fr_3fr] bg-red-700 text-white text-xs font-semibold">
        <div className="px-3 py-2 border-r border-red-600">Item</div>
        <div className="px-3 py-2 border-r border-red-600">Color</div>
        <div className="px-3 py-2 flex items-center gap-1.5"><Barcode className="h-3.5 w-3.5" /> S.No</div>
      </div>
      {rows.map((row, idx) => {
        const sc = countSerials(row.srNo);
        const dups = dupWarnings[row.id] || [];
        return (
          <div key={row.id} className={`grid grid-cols-[2fr_2fr_3fr] border-b border-border/50 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-muted/10"}`}>
            <div className="px-3 py-2.5 text-xs text-muted-foreground border-r border-border/40 flex items-start pt-3">{itemName || `Item ${idx + 1}`}</div>
            <div className="border-r border-border/40" style={{ minHeight: "36px", display: "flex", alignItems: "center" }}>
              <ColorCombobox value={row.color} onChange={(v) => onRowChange(row.id, "color", v)} options={colorOptions} isLoading={colorLoading} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center border-b border-border/30 min-h-[30px]">
                <div className="flex items-center gap-1 bg-red-700 text-white text-[11px] px-2 py-1 shrink-0 select-none font-medium"><Barcode className="h-3 w-3" /> Scan</div>
                <input ref={(el) => { scanRefs.current[row.id] = el; }} type="text" className="flex-1 h-7 border-0 text-xs px-2 font-mono focus:outline-none focus:bg-blue-50/40 bg-transparent" onKeyDown={(e) => handleScanKeyDown(e, row.id)} autoComplete="off" placeholder="Scan & press Enter…" />
                {sc > 0 && <span className="text-[10px] text-muted-foreground px-1.5 shrink-0 whitespace-nowrap bg-orange-50 h-full flex items-center border-l border-border/30">{sc} S.No</span>}
                {rows.length > 1 && <button type="button" onClick={() => onRemoveRow(row.id)} className="h-7 w-7 flex items-center justify-center text-destructive hover:bg-red-50 shrink-0 border-l border-border/30"><X className="h-3 w-3" /></button>}
              </div>
              <Textarea className={`border-0 rounded-none text-xs font-mono min-h-[44px] resize-none bg-transparent focus:bg-white px-3 py-1.5 leading-relaxed ${dups.length > 0 ? "bg-red-50/40" : ""}`} value={row.srNo} onChange={(e) => handleTextareaChange(row.id, e.target.value)} />
              {dups.length > 0 && (
                <div className="px-3 py-1.5 bg-red-50 border-t border-red-200 flex items-start gap-1.5">
                  <AlertCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-red-600 font-medium leading-relaxed">Duplicate{dups.length > 1 ? "s" : ""}: {dups.join(", ")}</span>
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
            const total = rows.reduce((sum, r) => sum + countSerials(r.srNo), 0);
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

// ── DescriptionPanel — no image upload ───────────────────────────────────────
function DescriptionPanel({
  item, colorOptions, colorLoading,
  onDescriptionChange, onSerialRowChange, onAddSerialRow, onRemoveSerialRow, onToggleSerialTable,
}: {
  item: PIItem;
  colorOptions: ColorOption[]; colorLoading: boolean;
  onDescriptionChange: (id: string, value: string) => void;
  onSerialRowChange: (itemId: string, rowId: string, field: "color" | "srNo", value: string) => void;
  onAddSerialRow: (itemId: string) => void;
  onRemoveSerialRow: (itemId: string, rowId: string) => void;
  onToggleSerialTable: (itemId: string) => void;
}) {
  const totalSerialCount = item.serialRows.reduce((sum, r) => sum + countSerials(r.srNo), 0);
  return (
    <tr>
      <td colSpan={24} style={{ padding: 0, borderBottom: "1px solid #e5e7eb" }}>
        <div className="bg-slate-50/80 border-l-4 border-l-red-700 mx-2 my-2 rounded-lg p-3 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><AlignLeft className="h-3 w-3" /> Description</label>
            <Textarea className="text-xs min-h-[72px] resize-none bg-white" value={item.description} onChange={(e) => onDescriptionChange(item.id, e.target.value)} />
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
              />
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── PIItemRow ─────────────────────────────────────────────────────────────────
function PIItemRow({
  item, index, brands, items, isGujaratSupplier, isFirst, isLast, isSingle,
  onUpdate, onRemove, onAddRow, onMove, onToggleDescription, onDescriptionChange,
  onSerialRowChange, onAddSerialRow, onRemoveSerialRow, onToggleSerialTable,
  supplierPOs, onSelectPOForItem, allPIItems, colorOptions, colorLoading,
}: {
  item: PIItem; index: number; brands: any[]; items: any[]; isGujaratSupplier: boolean;
  isFirst: boolean; isLast: boolean; isSingle: boolean;
  onUpdate: (id: string, field: keyof PIItem | "amountInput", value: any) => void;
  onRemove: (id: string) => void; onAddRow: () => void; onMove: (id: string, dir: "up" | "down") => void;
  onToggleDescription: (id: string) => void;
  onDescriptionChange: (id: string, value: string) => void;
  onSerialRowChange: (itemId: string, rowId: string, field: "color" | "srNo", value: string) => void;
  onAddSerialRow: (itemId: string) => void; onRemoveSerialRow: (itemId: string, rowId: string) => void;
  onToggleSerialTable: (itemId: string) => void;
  supplierPOs: any[]; onSelectPOForItem: (itemId: string, poId: string) => void;
  allPIItems: PIItem[];
  colorOptions: ColorOption[]; colorLoading: boolean;
}) {
  const [amountInput, setAmountInput] = useState<string>(() => String(item.amount ?? ""));
  const [hoverDup, setHoverDup] = useState(false);
  const [hoverDel, setHoverDel] = useState(false);
  const [poDropdownOpen, setPODropdownOpen] = useState(false);

  useEffect(() => { setAmountInput(String(item.amount ?? "")); }, [item.amount]);

  const filteredItems = items.filter((i) => !item.brandId || i.brandId === item.brandId);
  const selectedMasterItem = items.find((entry) => sid(entry.id) === sid(item.itemId));
  const variantOptions = getItemVariants(selectedMasterItem).map((variant) => ({
    id: sid(variant.id || variant.variant),
    label: normalizeVariantLabel(variant.variant),
  }));
  const rowTotal = toNumber(item.qty) * toNumber(item.rate);
  const totalSerialCount = item.serialRows.reduce((sum, r) => sum + countSerials(r.srNo), 0);
  const hasDescriptionContent = item.description.trim() || item.serialRows.some((r) => r.srNo.trim() || r.color.trim());

  const numInputStyle: React.CSSProperties = {
    width: "100%", height: "28px", border: "none", background: "transparent",
    outline: "none", fontSize: "11px", textAlign: "center", padding: "0 4px",
    appearance: "textfield" as any,
  };
  const tdBorder: React.CSSProperties = { border: "1px solid #d1d5db", verticalAlign: "middle", textAlign: "center", padding: "0" };

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

        {/* PO popup */}
        <td style={{ border: "1px solid #d1d5db", padding: "4px", verticalAlign: "middle", width: "90px" }}>
          <Popover open={poDropdownOpen} onOpenChange={setPODropdownOpen}>
            <PopoverTrigger asChild>
              <button type="button" disabled={!supplierPOs.length}
                style={{ width: "100%", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", borderRadius: "5px", border: item.poNumber ? "1px solid #b91c1c" : "1px dashed #d1d5db", background: item.poNumber ? "#fef2f2" : "transparent", cursor: supplierPOs.length ? "pointer" : "default", fontSize: "11px", fontWeight: item.poNumber ? 600 : 400, color: item.poNumber ? "#b91c1c" : "#9ca3af", padding: "0 6px", overflow: "hidden", whiteSpace: "nowrap" }}
                onMouseEnter={(e) => { if (!supplierPOs.length) return; e.currentTarget.style.borderColor = "#b91c1c"; e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#b91c1c"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = item.poNumber ? "#b91c1c" : "#d1d5db"; e.currentTarget.style.background = item.poNumber ? "#fef2f2" : "transparent"; e.currentTarget.style.color = item.poNumber ? "#b91c1c" : "#9ca3af"; }}>
                <Link2 style={{ width: "11px", height: "11px", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.poNumber || "PO#"}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} style={{ width: "700px", padding: 0, overflow: "hidden", border: "1px solid #e5e7eb", borderRadius: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
              <div style={{ background: "#b91c1c", color: "white", padding: "9px 14px", display: "flex", alignItems: "center", gap: "7px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <Link2 style={{ width: "12px", height: "12px" }} /> Select Purchase Order
                {item.poNumber && <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", padding: "2px 10px", borderRadius: "4px", fontSize: "10px", fontWeight: 600 }}>LINKED: {item.poNumber}</span>}
              </div>
              <div style={{ maxHeight: "500px", overflowY: "auto" }}>
                {supplierPOs.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", fontSize: "12px", color: "#9ca3af" }}>No purchase orders found for this supplier</div>
                ) : supplierPOs.map((po) => {
                  const isActive = po.poNumber === item.poNumber;
                  const rawItems: any[] = Array.isArray(po.items) ? po.items : Array.isArray(po.orderItems) ? po.orderItems : Array.isArray(po.purchaseOrderItems) ? po.purchaseOrderItems : [];
                  const poItems = rawItems.map(normalizePOItemForPopup);
                  const otherRows = allPIItems.filter((r) => r.id !== item.id && r.purchaseOrderId === po.id);
                  const poItemsWithRemaining = poItems.map((pi) => {
                    const qtyUsed = otherRows.filter((r) => r.itemId === pi.itemId).reduce((s, r) => s + toNumber(r.qty), 0);
                    const remainingQty = Math.max(0, pi.qty - qtyUsed);
                    return { ...pi, remainingQty, fullyUsed: remainingQty <= 0 };
                  });
                  const allItemsUsed = poItemsWithRemaining.length > 0 && poItemsWithRemaining.every((p) => p.fullyUsed);
                  const isFullyUsedElsewhere = allItemsUsed && !isActive;
                  return (
                    <div key={po.id} style={{ borderBottom: "2px solid #f3f4f6", background: isActive ? "#fff8f8" : isFullyUsedElsewhere ? "#f9fafb" : "white", opacity: isFullyUsedElsewhere ? 0.65 : 1 }}>
                      {poItemsWithRemaining.length > 0 ? (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "11px" }}>
                            <thead>
                              <tr style={{ background: "#b91c1c" }}>
                                <th style={{ border: "1px solid rgba(255,255,255,0.2)", padding: "7px 10px", color: "white", fontWeight: 700, fontSize: "10px", whiteSpace: "nowrap", textAlign: "left", width: "140px" }}>PO Number</th>
                                <th style={{ border: "1px solid rgba(255,255,255,0.2)", padding: "7px 10px", color: "white", fontWeight: 700, fontSize: "10px", whiteSpace: "nowrap", textAlign: "left" }}>Item Name</th>
                                <th style={{ border: "1px solid rgba(255,255,255,0.2)", padding: "7px 10px", color: "white", fontWeight: 700, fontSize: "10px", whiteSpace: "nowrap", textAlign: "right", width: "80px" }}>PO Qty</th>
                                <th style={{ border: "1px solid rgba(255,255,255,0.2)", padding: "7px 10px", color: "white", fontWeight: 700, fontSize: "10px", whiteSpace: "nowrap", textAlign: "right", width: "90px" }}>Pending Qty</th>
                                <th style={{ border: "1px solid rgba(255,255,255,0.2)", padding: "7px 10px", color: "white", fontWeight: 700, fontSize: "10px", whiteSpace: "nowrap", textAlign: "right", width: "90px" }}>Rate</th>
                                <th style={{ border: "1px solid rgba(255,255,255,0.2)", padding: "7px 10px", color: "white", fontWeight: 700, fontSize: "10px", whiteSpace: "nowrap", textAlign: "center", width: "80px" }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {poItemsWithRemaining.map((pi, idx) => (
                                <tr key={pi.id || idx}
                                  style={{ background: pi.fullyUsed ? "#fef2f2" : idx % 2 !== 0 ? "#fafafa" : "white", opacity: pi.fullyUsed ? 0.6 : 1, cursor: isFullyUsedElsewhere || pi.fullyUsed ? "not-allowed" : "pointer" }}
                                  onClick={() => { if (!isFullyUsedElsewhere && !pi.fullyUsed) { onSelectPOForItem(item.id, po.id); setPODropdownOpen(false); } }}
                                  onMouseEnter={(e) => { if (!pi.fullyUsed && !isFullyUsedElsewhere) (e.currentTarget as HTMLTableRowElement).style.background = "#fff0f0"; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = pi.fullyUsed ? "#fef2f2" : idx % 2 !== 0 ? "#fafafa" : "white"; }}>
                                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px" }}>
                                    <div style={{ fontWeight: 700, color: isActive ? "#b91c1c" : "#111827", fontSize: "11px" }}>{po.poNumber}{isActive && <span style={{ marginLeft: 5, fontSize: "9px", background: "#fecaca", color: "#b91c1c", padding: "1px 5px", borderRadius: "8px", fontWeight: 700 }}>LINKED</span>}</div>
                                    {po.poDate && <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "2px" }}>{new Date(po.poDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>}
                                  </td>
                                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px", fontWeight: 600, color: pi.fullyUsed ? "#9ca3af" : "#111827", fontSize: "11px" }}>{pi.itemName || "—"}{pi.fullyUsed && <span style={{ marginLeft: 4, fontSize: "9px", background: "#fecaca", color: "#b91c1c", padding: "1px 5px", borderRadius: "8px", fontWeight: 700 }}>USED</span>}</td>
                                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "#374151", fontSize: "11px" }}>{pi.originalQty}</td>
                                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px", textAlign: "right", fontWeight: 700, fontSize: "11px", color: pi.fullyUsed ? "#ef4444" : pi.remainingQty <= 5 ? "#d97706" : "#166534" }}>{pi.remainingQty}{pi.fullyUsed && <div style={{ fontSize: "9px", color: "#ef4444", fontWeight: 600 }}>Fully Used</div>}</td>
                                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px", textAlign: "right", fontWeight: 600, color: "#374151", fontSize: "11px" }}>₹{pi.rate.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td style={{ border: "1px solid #e5e7eb", padding: "6px 10px", textAlign: "center" }}>
                                    {pi.fullyUsed ? <span style={{ fontSize: "9px", background: "#fee2e2", color: "#b91c1c", padding: "2px 7px", borderRadius: "8px", fontWeight: 700 }}>✗ Used</span>
                                      : isActive ? <span style={{ fontSize: "9px", background: "#fecaca", color: "#b91c1c", padding: "2px 7px", borderRadius: "8px", fontWeight: 700 }}>✓ Linked</span>
                                      : <span style={{ fontSize: "9px", background: "#dcfce7", color: "#166534", padding: "2px 7px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}>Select →</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: "#fef2f2" }}>
                                <td colSpan={2} style={{ border: "1px solid #e5e7eb", padding: "5px 10px", fontWeight: 700, color: "#b91c1c", fontSize: "10px" }}>{poItemsWithRemaining.filter((p) => !p.fullyUsed).length}/{poItems.length} items remaining{isFullyUsedElsewhere && <span style={{ marginLeft: 8, color: "#ef4444" }}>— All items used</span>}</td>
                                <td colSpan={4} style={{ border: "1px solid #e5e7eb", padding: "5px 10px", textAlign: "right", fontWeight: 700, color: "#b91c1c", fontSize: "10px" }}>Net: ₹{(Number(po.netAmount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div style={{ padding: "10px 14px", color: "#9ca3af", fontSize: "11px", fontStyle: "italic" }}>No item details available for {po.poNumber}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
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
        {/* Qty */}
        <td style={{ ...tdBorder, width: "72px" }}><input type="number" className="no-spinner" value={item.qty || ""} min={0} onChange={(e) => onUpdate(item.id, "qty", parseFloat(e.target.value) || 0)} style={numInputStyle} /></td>
        {/* Rate */}
        <td style={{ ...tdBorder, width: "95px" }}><input type="number" className="no-spinner" value={item.rate || ""} min={0} onChange={(e) => onUpdate(item.id, "rate", parseFloat(e.target.value) || 0)} style={numInputStyle} /></td>
        {/* Disc.Rs */}
        <td style={{ ...tdBorder, width: "85px" }}><input type="number" className="no-spinner" value={item.discountRs || ""} min={0} onChange={(e) => onUpdate(item.id, "discountRs", parseFloat(e.target.value) || 0)} style={numInputStyle} /></td>
        {/* Amount */}
        <td style={{ ...tdBorder, width: "100px" }}><input type="number" className="no-spinner" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} onBlur={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) onUpdate(item.id, "amountInput", val); }} style={{ ...numInputStyle, fontWeight: 600 }} /></td>
        {/* P.O.Rate readOnly */}
        <td style={{ ...tdBorder, width: "90px" }}><input type="number" className="no-spinner" value={item.poRate || ""} readOnly style={{ ...numInputStyle, color: "#9ca3af", cursor: "default" }} /></td>
        {/* A.Tax% */}
        <td style={{ ...tdBorder, width: "70px" }}><input type="number" className="no-spinner" value={item.aTaxPercent || ""} min={0} onChange={(e) => onUpdate(item.id, "aTaxPercent", parseFloat(e.target.value) || 0)} style={numInputStyle} /></td>

        {isGujaratSupplier && <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "85px" }}><div style={{ fontSize: "11px", color: "#6b7280" }}>{item.sgstPercent}%</div><div style={{ fontSize: "11px", fontWeight: 500 }}>₹{Number(item.sgstAmount || 0).toFixed(2)}</div></td>}
        {isGujaratSupplier && <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "85px" }}><div style={{ fontSize: "11px", color: "#6b7280" }}>{item.cgstPercent}%</div><div style={{ fontSize: "11px", fontWeight: 500 }}>₹{Number(item.cgstAmount || 0).toFixed(2)}</div></td>}
        {!isGujaratSupplier && <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "85px" }}><div style={{ fontSize: "11px", color: "#6b7280" }}>{item.igstPercent}%</div><div style={{ fontSize: "11px", fontWeight: 500 }}>₹{Number(item.igstAmount || 0).toFixed(2)}</div></td>}

        {/* Total */}
        <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 6px", verticalAlign: "middle", width: "100px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600 }}>₹{rowTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </td>
        {/* Actions */}
        <td style={{ border: "1px solid #d1d5db", textAlign: "center", padding: "4px 2px", verticalAlign: "middle", width: "60px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
            <button type="button" onClick={onAddRow} onMouseEnter={() => setHoverDup(true)} onMouseLeave={() => setHoverDup(false)} style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: hoverDup ? "#f3f4f6" : "none", cursor: "pointer", color: "#dc2626" }}><Plus className="h-3.5 w-3.5" /></button>
            <button type="button" disabled={isSingle} onClick={() => onRemove(item.id)} onMouseEnter={() => setHoverDel(true)} onMouseLeave={() => setHoverDel(false)} style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: hoverDel && !isSingle ? "#fef2f2" : "none", cursor: isSingle ? "not-allowed" : "pointer", color: "#dc2626", opacity: isSingle ? 0.3 : 1 }}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </td>
      </tr>

      {/* Action strip — image button removed */}
      <tr style={{ borderBottom: "1px solid #f3f4f6", backgroundColor: "white" }}>
        <td colSpan={24} style={{ padding: "4px 12px" }}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onToggleDescription(item.id)}
              className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors", item.showDescription ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <AlignLeft className="h-3.5 w-3.5" />{item.showDescription ? "Hide Description" : "+ Add Description"}
              {item.description.trim() && !item.showDescription && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />}
            </button>
            <button type="button" onClick={() => { if (!item.showDescription) onToggleDescription(item.id); if (!item.showSerialTable) onToggleSerialTable(item.id); }}
              className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors", totalSerialCount > 0 ? "bg-orange-100 text-orange-700 hover:bg-orange-200" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Barcode className="h-3.5 w-3.5" />+ Serial / Barcode *
              {totalSerialCount > 0 && <span className="text-orange-600 font-semibold">({totalSerialCount})</span>}
            </button>
            {hasDescriptionContent && (
              <span className="text-xs text-muted-foreground ml-auto italic">
                {[item.description.trim() && "Description", totalSerialCount > 0 && `${totalSerialCount} S.No`].filter(Boolean).join(" · ")}
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
        />
      )}
    </>
  );
}

function SRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-red-600">{value}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PurchaseInvoiceRegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [supplierPOs, setSupplierPOs] = useState<any[]>([]);
  const [piItems, setPIItems] = useState<PIItem[]>([emptyItem()]);
  const [isGujaratSupplier, setIsGujaratSupplier] = useState(true);
  const [linkedPOItemsMap, setLinkedPOItemsMap] = useState<Record<string, LinkedPOItem[]>>({});
  const [colorsByBrand, setColorsByBrand] = useState<Record<string, ColorOption[]>>({});
  const [colorLoadingByBrand, setColorLoadingByBrand] = useState<Record<string, boolean>>({});

  const [formData, setFormData] = useState({
    companyId: "", billNumber: "", billDate: new Date().toISOString().split("T")[0],
    supplierId: "", purchaseOrderId: "", branchId: "",
    transporterId: "", lrNumber: "", lrDate: "", remarks: "",
    discountPercent: 0, freightAmount: 0, tcsPercent: 0, otherAmount: 0,
  });

  const grossAmount        = piItems.reduce((sum, i) => sum + toNumber(i.qty) * toNumber(i.rate), 0);
  const totalItemDiscountRs = piItems.reduce((sum, i) => sum + toNumber(i.discountRs), 0);
  const totalAmount        = piItems.reduce((sum, i) => sum + toNumber(i.amount), 0);
  const discountAmount     = (totalAmount * toNumber(formData.discountPercent)) / 100;
  const totalSGST          = piItems.reduce((sum, i) => sum + toNumber(i.sgstAmount), 0);
  const totalCGST          = piItems.reduce((sum, i) => sum + toNumber(i.cgstAmount), 0);
  const totalIGST          = piItems.reduce((sum, i) => sum + toNumber(i.igstAmount), 0);
  const tcsAmount          = ((grossAmount - totalItemDiscountRs - discountAmount) * toNumber(formData.tcsPercent)) / 100;
  const netAmount          = grossAmount - totalItemDiscountRs - discountAmount + toNumber(formData.freightAmount) + tcsAmount + toNumber(formData.otherAmount);
  const totalQty           = piItems.reduce((sum, i) => sum + toNumber(i.qty), 0);
  const selectedSupplier   = suppliers.find((s) => s.id === formData.supplierId);
  const supplierTaxContext = getSupplierTaxContext(selectedSupplier, GUJARAT_STATE);
  const allLinkedPOItems: LinkedPOItem[] = Object.values(linkedPOItemsMap).flat();

  const debitNoteAmount = getDebitNoteAmount(piItems, allLinkedPOItems);

  const getPOLinkedItem = useCallback(
    (itemId?: string, poId?: string, variantId?: string, variant?: string) =>
      allLinkedPOItems.find((p) => getItemVariantLineKey(p.itemId, p.variantId, p.variant) === getItemVariantLineKey(itemId || "", variantId, variant) && p.poId === (poId || "")),
    [allLinkedPOItems]
  );

  useEffect(() => { loadMasterData(); }, []);

  const loadMasterData = async () => {
    const token = sessionStorage.getItem("authToken") || "";
    const storedCompanyId = sessionStorage.getItem("companyId") || "";
    const [suppRes, brandRes, itemRes, branchRes, compRes] = await Promise.all([
      supplierAPI.getAll(token), brandAPI.getAll(token, storedCompanyId),
      itemAPI.getAll(token, storedCompanyId),
      branchAPI.getAll(token, storedCompanyId), companyAPI.getAll(token),
    ]);
    if (suppRes.success)  setSuppliers(suppRes.data);
    if (brandRes.success) setBrands(brandRes.data);
    if (itemRes.success)  setItemsList(itemRes.data);
    if (branchRes.success) setBranches(branchRes.data);
    if (compRes.success)  {
      setCompanies(compRes.data);
      if (storedCompanyId) setFormData((prev) => ({ ...prev, companyId: storedCompanyId }));
    }
  };

  const loadColorsForBrand = useCallback(async (brandId?: string) => {
    if (!brandId || colorsByBrand[brandId] || colorLoadingByBrand[brandId]) return;
    setColorLoadingByBrand((prev) => ({ ...prev, [brandId]: true }));
    try {
      const token = sessionStorage.getItem("authToken") || "";
      const result = await colorAPI.getByBrand(token, brandId);
      const options = Array.isArray(result?.data)
        ? result.data.map((c: { id: string; colorName: string }) => ({ id: c.id, colorName: c.colorName }))
        : [];
      setColorsByBrand((prev) => ({ ...prev, [brandId]: options }));
    } catch {
      setColorsByBrand((prev) => ({ ...prev, [brandId]: [] }));
    } finally {
      setColorLoadingByBrand((prev) => ({ ...prev, [brandId]: false }));
    }
  }, [colorLoadingByBrand, colorsByBrand]);

  useEffect(() => {
    const brandIds = [...new Set(piItems.map((i) => i.brandId).filter(Boolean))] as string[];
    brandIds.forEach((id) => { void loadColorsForBrand(id); });
  }, [piItems, loadColorsForBrand]);

  const handleChange = (field: string, value: any) => { setFormData((prev) => ({ ...prev, [field]: value })); setError(""); };

  const handleSupplierChange = async (supplierId: string) => {
    handleChange("supplierId", supplierId);
    handleChange("purchaseOrderId", "");
    setLinkedPOItemsMap({});
    setSupplierPOs([]);
    const supplier = suppliers.find((s) => s.id === supplierId);
    const isGuj = getSupplierTaxContext(supplier, GUJARAT_STATE).isIntraState;
    setIsGujaratSupplier(isGuj);
    setPIItems((prev) => prev.map((item) => {
      if (item.amount <= 0 || item.gstPercent <= 0) return item;
      return { ...item, ...computeGSTFromBase(item.amount, item.gstPercent, isGuj) };
    }));
    const token = sessionStorage.getItem("authToken") || "";
    const listRes = await purchaseInvoiceAPI.getPOsBySupplier(token, supplierId);
    if (listRes.success && listRes.data?.length) setSupplierPOs(listRes.data);
  };

  const handleSelectPOForItem = async (rowItemId: string, poId: string) => {
    if (!poId) return;
    const token = sessionStorage.getItem("authToken") || "";
    const cachedPO = supplierPOs.find((p) => p.id === poId);
    const cachedItems: any[] = Array.isArray(cachedPO?.items) ? cachedPO.items : Array.isArray(cachedPO?.orderItems) ? cachedPO.orderItems : Array.isArray(cachedPO?.purchaseOrderItems) ? cachedPO.purchaseOrderItems : [];
    let poData = cachedPO; let rawItems = cachedItems;
    if (!rawItems.length) {
      const res = await purchaseOrderAPI.getById(token, poId);
      if (res.success && res.data) { poData = res.data; rawItems = Array.isArray(poData.items) ? poData.items : Array.isArray(poData.orderItems) ? poData.orderItems : Array.isArray(poData.purchaseOrderItems) ? poData.purchaseOrderItems : []; }
    }
    if (!rawItems.length) return;
    const poNumber = poData?.poNumber || cachedPO?.poNumber || "";
    const normRaw = (raw: any) => {
      const gstPct = Number(raw.gstRate) || Number(raw.gstPercent) || Number(raw.gst) || Number(raw.aTaxPercent) || Number(raw.igstPercent) || (Number(raw.sgstPercent) || 0) + (Number(raw.cgstPercent) || 0) || 0;
      const qty = Number(raw.remainingQty) || Number(raw.pendingQty) || Number(raw.balanceQty) || Number(raw.qty) || 0;
      return { itemId: raw.itemId || "", itemName: raw.itemName || "", brandId: raw.brandId || "", brandName: raw.brandName || raw.brand || "", variantId: raw.variantId || raw.variant || "", variant: normalizeVariantLabel(raw.variant), qty, rate: Number(raw.rate) || 0, gstPercent: gstPct, poNumber, poId };
    };
    const mappedPOItems: LinkedPOItem[] = rawItems.map(normRaw);
    setLinkedPOItemsMap((prev) => ({ ...prev, [poId]: mappedPOItems }));
    const fillRow = (existingRow: PIItem, poItem: ReturnType<typeof normRaw>): PIItem => {
      const baseAmt = poItem.qty * poItem.rate;
      return { ...existingRow, purchaseOrderId: poId, poNumber, itemId: poItem.itemId || existingRow.itemId, itemName: poItem.itemName || existingRow.itemName, brandId: poItem.brandId || existingRow.brandId, brandName: poItem.brandName || existingRow.brandName, variantId: poItem.variantId || existingRow.variantId, variant: poItem.variant || existingRow.variant, qty: poItem.qty || existingRow.qty, rate: poItem.rate || existingRow.rate, poRate: poItem.rate || existingRow.poRate, aTaxPercent: poItem.gstPercent || existingRow.aTaxPercent, gstPercent: poItem.gstPercent || existingRow.gstPercent, amount: baseAmt || existingRow.amount, ...computeGSTFromBase(baseAmt || existingRow.amount, poItem.gstPercent || existingRow.gstPercent, isGujaratSupplier) };
    };
    setPIItems((prev) => {
      const alreadyUsedItemIds = new Set(prev.filter((r) => r.id !== rowItemId && r.purchaseOrderId === poId && r.itemId).map((r) => getItemVariantLineKey(r.itemId, r.variantId, r.variant)));
      const clickedRow = prev.find((r) => r.id === rowItemId);
      if (!clickedRow) return prev;
      let poItemForClickedRow: ReturnType<typeof normRaw> | null = null;
      if (clickedRow.itemId) { const match = mappedPOItems.find((p) => getItemVariantLineKey(p.itemId, p.variantId, p.variant) === getItemVariantLineKey(clickedRow.itemId, clickedRow.variantId, clickedRow.variant)); poItemForClickedRow = match || mappedPOItems.find((p) => !alreadyUsedItemIds.has(getItemVariantLineKey(p.itemId, p.variantId, p.variant))) || mappedPOItems[0]; }
      else { poItemForClickedRow = mappedPOItems.find((p) => !alreadyUsedItemIds.has(getItemVariantLineKey(p.itemId, p.variantId, p.variant))) || mappedPOItems[0]; }
      if (poItemForClickedRow) alreadyUsedItemIds.add(getItemVariantLineKey(poItemForClickedRow.itemId, poItemForClickedRow.variantId, poItemForClickedRow.variant));
      const remainingPOItems = mappedPOItems.filter((p) => !alreadyUsedItemIds.has(getItemVariantLineKey(p.itemId, p.variantId, p.variant)));
      const updatedRows = prev.map((row) => { if (row.id !== rowItemId) return row; return poItemForClickedRow ? fillRow(row, poItemForClickedRow) : { ...row, purchaseOrderId: poId, poNumber }; });
      const newRows: PIItem[] = remainingPOItems.map((poItem) => fillRow({ ...emptyItem(), id: genId() }, poItem));
      return [...updatedRows, ...newRows];
    });
  };

  const updateItem = useCallback((id: string, field: keyof PIItem | "amountInput", value: any) => {
    setPIItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      if (field === "poRate") return item;
      const updated = { ...item, [field]: value };
      if (field === "brandId") { const brand = brands.find((b) => b.id === value); updated.brandName = brand?.name || ""; updated.variantId = ""; updated.variant = ""; }
      if (field === "itemId") {
        const foundItem = itemsList.find((i) => i.id === value);
        updated.variantId = "";
        updated.variant = "";
        if (foundItem) {
          updated.itemName = foundItem.itemName;
          updated.gstPercent = foundItem.gst || 0;
          const brand = brands.find((b) => b.id === foundItem.brandId);
          if (brand) { updated.brandId = foundItem.brandId; updated.brandName = brand.name; }
          const variants = getItemVariants(foundItem);
          if (variants.length === 1) {
            updated.variantId = sid(variants[0].id || variants[0].variant);
            updated.variant = normalizeVariantLabel(variants[0].variant);
          }
          updated.amount = Math.max(0, updated.qty * updated.rate - updated.discountRs);
          if (updated.gstPercent > 0) Object.assign(updated, computeGSTFromBase(updated.amount, updated.gstPercent, isGujaratSupplier));
        }
        const linkedItem = getPOLinkedItem(updated.itemId, updated.purchaseOrderId, updated.variantId, updated.variant);
        if (updated.purchaseOrderId && linkedItem) { updated.brandId = linkedItem.brandId || updated.brandId; updated.brandName = linkedItem.brandName || updated.brandName; updated.itemName = linkedItem.itemName || updated.itemName; updated.variantId = linkedItem.variantId || updated.variantId; updated.variant = linkedItem.variant || updated.variant; updated.poNumber = linkedItem.poNumber || updated.poNumber; updated.poRate = linkedItem.rate; updated.rate = linkedItem.rate; if (updated.qty === 0 || updated.qty === item.qty) updated.qty = linkedItem.qty; updated.amount = Math.max(0, updated.qty * updated.rate - updated.discountRs); updated.gstPercent = linkedItem.gstPercent || updated.gstPercent; updated.aTaxPercent = linkedItem.gstPercent || updated.aTaxPercent; if (updated.gstPercent > 0) Object.assign(updated, computeGSTFromBase(updated.amount, updated.gstPercent, isGujaratSupplier)); }
      }
      if (field === "variantId") {
        const foundItem = itemsList.find((i) => sid(i.id) === sid(updated.itemId));
        const variant = findItemVariant(foundItem, value);
        updated.variantId = sid(variant?.id || value);
        updated.variant = normalizeVariantLabel(variant?.variant);
        const linkedItem = getPOLinkedItem(updated.itemId, updated.purchaseOrderId, updated.variantId, updated.variant);
        if (updated.purchaseOrderId && linkedItem) {
          updated.variantId = linkedItem.variantId || updated.variantId;
          updated.variant = linkedItem.variant || updated.variant;
          updated.poNumber = linkedItem.poNumber || updated.poNumber;
          updated.poRate = linkedItem.rate;
          updated.rate = linkedItem.rate;
          if (updated.qty === 0 || updated.qty === item.qty) updated.qty = linkedItem.qty;
          updated.gstPercent = linkedItem.gstPercent || updated.gstPercent;
          updated.aTaxPercent = linkedItem.gstPercent || updated.aTaxPercent;
        }
        updated.amount = Math.max(0, updated.qty * updated.rate - updated.discountRs);
        if (updated.gstPercent > 0) Object.assign(updated, computeGSTFromBase(updated.amount, updated.gstPercent, isGujaratSupplier));
      }
      if (field === "qty" || field === "rate" || field === "discountRs") {
        let qty = field === "qty" ? Number(value) : updated.qty;
        const rate = field === "rate" ? Number(value) : updated.rate;
        const disc = field === "discountRs" ? Number(value) : updated.discountRs;
        const linkedItem = getPOLinkedItem(updated.itemId, updated.purchaseOrderId, updated.variantId, updated.variant);
        if (updated.purchaseOrderId && linkedItem && qty > linkedItem.qty) { qty = linkedItem.qty; updated.qty = linkedItem.qty; setError(`Qty cannot exceed remaining PO qty (${linkedItem.qty}) for ${updated.itemName || "selected item"}.`); }
        updated.amount = Math.max(0, qty * rate - disc);
        if (updated.gstPercent > 0) Object.assign(updated, computeGSTFromBase(updated.amount, updated.gstPercent, isGujaratSupplier));
      }
      if (field === "amountInput") { const newAmt = Math.max(0, Number(value)); updated.amount = newAmt; if (updated.qty > 0) updated.rate = parseFloat(((newAmt + updated.discountRs) / updated.qty).toFixed(4)); if (updated.gstPercent > 0) Object.assign(updated, computeGSTFromBase(newAmt, updated.gstPercent, isGujaratSupplier)); }
      return updated;
    }));
  }, [brands, itemsList, isGujaratSupplier, getPOLinkedItem]);

  const toggleDescription    = (id: string) => setPIItems((prev) => prev.map((item) => item.id === id ? { ...item, showDescription: !item.showDescription } : item));
  const handleDescriptionChange = (id: string, value: string) => setPIItems((prev) => prev.map((item) => item.id === id ? { ...item, description: value } : item));
  const handleSerialRowChange   = (itemId: string, rowId: string, field: "color" | "srNo", value: string) => setPIItems((prev) => prev.map((item) => { if (item.id !== itemId) return item; if (field === "srNo") return { ...item, serialRows: item.serialRows.map((row) => row.id === rowId ? { ...row, srNo: String(value || "") } : row) }; return { ...item, serialRows: item.serialRows.map((row) => row.id === rowId ? { ...row, [field]: value } : row) }; }));
  const handleAddSerialRow      = (itemId: string) => setPIItems((prev) => prev.map((item) => { if (item.id !== itemId) return item; return { ...item, serialRows: [...item.serialRows, emptySerialRow()] }; }));
  const handleRemoveSerialRow   = (itemId: string, rowId: string) => setPIItems((prev) => prev.map((item) => { if (item.id !== itemId) return item; if (item.serialRows.length <= 1) return item; return { ...item, serialRows: item.serialRows.filter((r) => r.id !== rowId) }; }));
  const handleToggleSerialTable = (itemId: string) => setPIItems((prev) => prev.map((item) => item.id === itemId ? { ...item, showSerialTable: !item.showSerialTable } : item));
  const addItem    = () => setPIItems((prev) => [...prev, emptyItem()]);
  const removeItem = (id: string) => { if (piItems.length === 1) return; setPIItems((prev) => prev.filter((i) => i.id !== id)); };
  const moveItem   = (id: string, dir: "up" | "down") => {
    setPIItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (dir === "up" && idx === 0) return prev;
      if (dir === "down" && idx === prev.length - 1) return prev;
      const next = [...prev]; const swap = dir === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]]; return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!formData.companyId)      { setError("Please select a company"); return; }
    if (!formData.billNumber.trim()) { setError("Bill number is required"); return; }
    if (!formData.branchId)       { setError("Branch is required"); return; }
    if (!formData.supplierId)     { setError("Please select a supplier"); return; }
    const validItems = piItems.filter((i) => i.itemName.trim() && i.qty > 0);
    if (validItems.length === 0)  { setError("Please add at least one item with name and quantity"); return; }

    for (const row of validItems) {
      const totalSerials = row.serialRows.reduce((sum, r) => sum + countSerials(r.srNo), 0);
      if (totalSerials === 0) {
        setPIItems((prev) => prev.map((item) => item.id === row.id ? { ...item, showDescription: true, showSerialTable: true } : item));
        setError(`Serial / Barcode is required for "${row.itemName}".`); return;
      }
      if (totalSerials !== row.qty) {
        setPIItems((prev) => prev.map((item) => item.id === row.id ? { ...item, showDescription: true, showSerialTable: true } : item));
        setError(`Serial count mismatch for "${row.itemName}": ${totalSerials} serials entered but qty is ${row.qty}.`); return;
      }
    }
    for (const row of validItems) {
      const allSerials: string[] = [];
      for (const serialRow of row.serialRows) {
        for (const serial of serialRow.srNo.split(",").map((s) => s.trim()).filter(Boolean)) {
          const key = serial.toLowerCase();
          if (allSerials.includes(key)) { setError(`Duplicate serial "${serial}" found in "${row.itemName}".`); return; }
          allSerials.push(key);
        }
      }
    }

    setIsLoading(true);
    try {
      const token = sessionStorage.getItem("authToken") || "";
      const itemsPayload = validItems.map((i) => ({
        purchaseOrderId: i.purchaseOrderId || null,
        itemId:          i.itemId          || null,
        brandId:         i.brandId         || null,
        variantId:       i.variantId       || null,
        variant:         normalizeVariantLabel(i.variant) || null,
        itemName:        i.itemName,
        brandName:       i.brandName || null,
        remarks:         i.description     || null,
        qty: i.qty, rate: i.rate, discountRs: i.discountRs, amount: i.amount,
        poRate: i.poRate, aTaxPercent: i.aTaxPercent,
        sgstPercent: i.sgstPercent, sgstAmount: i.sgstAmount,
        cgstPercent: i.cgstPercent, cgstAmount: i.cgstAmount,
        igstPercent: i.igstPercent, igstAmount: i.igstAmount,
        serialRows: i.serialRows.filter((r) => r.srNo.trim()).map((r) => ({
          color: r.color || null, srNo: r.srNo.trim(),
        })),
      }));

      const firstLinkedPOId = validItems.find((i) => i.purchaseOrderId)?.purchaseOrderId || formData.purchaseOrderId || null;
      const result = await purchaseInvoiceAPI.create({
        ...formData,
        purchaseOrderId: firstLinkedPOId,
        companyId: formData.companyId || sessionStorage.getItem("companyId") || "",
        discountAmount, tcsAmount, totalAmount,
        sgst: totalSGST, cgst: totalCGST, igst: totalIGST,
        debitNoteAmount, netAmount,
        items: itemsPayload,
      } as any, token);

      if (result.success) { router.push("/purchase-invoices/list"); }
      else setError(result.message || "Failed to create purchase invoice");
    } catch { setError("Failed to create purchase invoice. Please try again."); }
    finally { setIsLoading(false); }
  };

  return (
    <AuthGuard><AuthenticatedLayout>
      <div className="py-8 px-4">
        <div className="w-full">
          <Button variant="ghost" onClick={() => router.push("/purchase-invoices/list")} className="mb-4 bg-red-700 text-white hover:bg-red-800"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0"><FileText className="h-6 w-6 text-white" /></div>
                <div><CardTitle className="text-2xl">New Purchase Invoice</CardTitle><CardDescription>Create a purchase invoice against a supplier</CardDescription></div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Company */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Company</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyId">Select Company <span className="text-destructive">*</span></Label>
                      <Select value={formData.companyId ? String(formData.companyId) : ""} onValueChange={(v) => handleChange("companyId", v)}>
                        <SelectTrigger id="companyId" className="h-10 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{companies.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Invoice Details */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Invoice Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2"><Label htmlFor="billNumber">Bill No. <span className="text-destructive">*</span></Label><Input id="billNumber" className="h-10 w-full" value={formData.billNumber} onChange={(e) => handleChange("billNumber", e.target.value)} /></div>
                    <div className="space-y-2"><Label htmlFor="billDate">Date <span className="text-destructive">*</span></Label><Input id="billDate" type="date" className="h-10 w-full" value={formData.billDate} onChange={(e) => handleChange("billDate", e.target.value)} required /></div>
                    <div className="space-y-2">
                      <Label htmlFor="branchId">Branch <span className="text-destructive">*</span></Label>
                      <Select value={formData.branchId ? String(formData.branchId) : "none"} onValueChange={(v) => handleChange("branchId", v === "none" ? "" : v)}>
                        <SelectTrigger id="branchId" className="h-10 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="none">None</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="supplierId">Party / Supplier <span className="text-destructive">*</span></Label>
                      <SearchableSupplierSelect id="supplierId" value={formData.supplierId} suppliers={suppliers} onValueChange={handleSupplierChange} />
                      <div className="min-h-5">
                        {formData.supplierId ? (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Tax mode: <span className={`font-semibold ${isGujaratSupplier ? "text-blue-600" : "text-orange-600"}`}>{supplierTaxContext.taxModeLabel}</span></p>
                            <p>Supplier state: <span className="font-medium">{supplierTaxContext.selectedStateName || "-"}</span></p>
                          </div>
                        ) : <p className="text-xs invisible">Tax mode</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-lg">Items</h3>
                      <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full flex items-center gap-1"><Link2 className="h-3 w-3" />Click <strong className="text-red-700 mx-0.5">PO#</strong> to link a Purchase Order</span>
                    </div>
                    <Button type="button" size="sm" onClick={addItem} className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent"><Plus className="h-4 w-4 mr-1" />Add Item</Button>
                  </div>
                  <style>{`.no-spinner::-webkit-outer-spin-button,.no-spinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.no-spinner[type=number]{-moz-appearance:textfield}.pi-table{border-collapse:collapse;width:100%;font-size:.875rem}.pi-table th{border:1px solid rgba(255,255,255,.25);padding:8px 10px;font-size:11px;font-weight:600;white-space:nowrap}.pi-table td{border:1px solid #d1d5db}.pi-table input[type=number]:focus{background-color:rgba(0,0,0,.03);outline:none}`}</style>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="pi-table">
                      <thead>
                        <tr className="bg-red-700 text-white">
                          <th style={{ width: "50px" }}>#</th>
                          <th style={{ width: "90px" }}>P.O.No</th>
                          <th style={{ width: "150px" }}>Brand</th>
                          <th style={{ width: "160px" }}>Item <span style={{ color: "#fca5a5" }}>*</span></th>
                          <th style={{ width: "140px" }}>Variant</th>
                          <th style={{ width: "72px" }}>Qty <span style={{ color: "#fca5a5" }}>*</span></th>
                          <th style={{ width: "95px" }}>Rate</th>
                          <th style={{ width: "85px" }}>Disc.Rs</th>
                          <th style={{ width: "100px" }}>Amount</th>
                          <th style={{ width: "90px" }}>P.O.Rate</th>
                          <th style={{ width: "70px" }}>A.Tax%</th>
                          {isGujaratSupplier && <><th style={{ width: "85px" }}>SGST</th><th style={{ width: "85px" }}>CGST</th></>}
                          {!isGujaratSupplier && <th style={{ width: "85px" }}>IGST</th>}
                          <th style={{ width: "100px" }}>Total</th>
                          <th style={{ width: "60px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {piItems.map((item, index) => (
                          <PIItemRow key={item.id} item={item} index={index} brands={brands} items={itemsList}
                            isGujaratSupplier={isGujaratSupplier} isFirst={index === 0} isLast={index === piItems.length - 1} isSingle={piItems.length === 1}
                            onUpdate={updateItem} onRemove={removeItem} onAddRow={addItem} onMove={moveItem}
                            onToggleDescription={toggleDescription} onDescriptionChange={handleDescriptionChange}
                            onSerialRowChange={handleSerialRowChange} onAddSerialRow={handleAddSerialRow}
                            onRemoveSerialRow={handleRemoveSerialRow} onToggleSerialTable={handleToggleSerialTable}
                            supplierPOs={supplierPOs} onSelectPOForItem={handleSelectPOForItem} allPIItems={piItems}
                            colorOptions={item.brandId ? (colorsByBrand[item.brandId] || []) : []}
                            colorLoading={item.brandId ? Boolean(colorLoadingByBrand[item.brandId]) : false}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Adjustments + Summary */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold border-b pb-2">Adjustments</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2"><Label>Disc. [%]</Label><Input type="number" min={0} max={100} className="no-spinner" value={formData.discountPercent || ""} onChange={(e) => handleChange("discountPercent", parseFloat(e.target.value) || 0)} /></div>
                      <div className="space-y-2"><Label>Freight ₹</Label><Input type="number" min={0} className="no-spinner" value={formData.freightAmount || ""} onChange={(e) => handleChange("freightAmount", parseFloat(e.target.value) || 0)} /></div>
                      <div className="space-y-2"><Label>TCS [%]</Label><Input type="number" min={0} className="no-spinner" value={formData.tcsPercent || ""} onChange={(e) => handleChange("tcsPercent", parseFloat(e.target.value) || 0)} /></div>
                      <div className="space-y-2"><Label>Other ₹</Label><Input type="number" className="no-spinner" value={formData.otherAmount || ""} onChange={(e) => handleChange("otherAmount", parseFloat(e.target.value) || 0)} /></div>
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2.5 border border-border/40">
                    <SRow label="Qty Total"       value={totalQty.toString()} />
                    <SRow label="Gross Amount"    value={`₹ ${formatMoney(grossAmount)}`} />
                    {totalItemDiscountRs > 0 && (<div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Item Disc. (₹)</span><span className="font-medium text-green-600">- ₹ {formatMoney(totalItemDiscountRs)}</span></div>)}
                    <SRow label="Taxable Amount"  value={`₹ ${formatMoney(totalAmount)}`} />
                    <div className="flex justify-between items-center text-sm gap-2">
                      <span className="text-muted-foreground shrink-0">Disc. ({formData.discountPercent}%)</span>
                      <div className="flex items-center gap-2 ml-auto">
                        <Input type="number" className="h-6 w-14 text-xs text-right no-spinner border-border/60 px-1" value={formData.discountPercent || ""} min={0} max={100} onChange={(e) => handleChange("discountPercent", parseFloat(e.target.value) || 0)} />
                        <span className="font-medium text-red-600 whitespace-nowrap text-xs">- ₹ {formatMoney(discountAmount)}</span>
                      </div>
                    </div>
                    <SRow label="Freight" value={`₹ ${formatMoney(formData.freightAmount)}`} />
                    <div className="flex justify-between items-center text-sm gap-2"><span className="text-muted-foreground shrink-0">TCS ({formData.tcsPercent}%)</span><span className="font-medium text-red-600">₹ {formatMoney(tcsAmount)}</span></div>
                    <SRow label="Other" value={`₹ ${formatMoney(formData.otherAmount)}`} />
                    {isGujaratSupplier ? (<><SRow label="SGST" value={`₹ ${formatMoney(totalSGST)}`} /><SRow label="CGST" value={`₹ ${formatMoney(totalCGST)}`} /></>) : (<SRow label="IGST" value={`₹ ${formatMoney(totalIGST)}`} />)}
                    {allLinkedPOItems.length > 0 && (<div className="flex justify-between items-center text-sm border-t pt-2"><span className="text-muted-foreground font-medium">Debit Note Amt.</span><span className={`font-semibold ${debitNoteAmount >= 0 ? "text-orange-600" : "text-green-600"}`}>₹ {formatMoney(debitNoteAmount)}</span></div>)}
                    <div className="flex justify-between items-center text-base font-bold border-t pt-2 mt-1"><span>Net Amount</span><span className="text-primary">₹ {formatMoney(netAmount)}</span></div>
                  </div>
                </div>

                {/* Transport */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Transport</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Transporter</Label><Input value={formData.transporterId} onChange={(e) => handleChange("transporterId", e.target.value)} /></div>
                    <div className="space-y-2"><Label>L.R. No.</Label><Input value={formData.lrNumber} onChange={(e) => handleChange("lrNumber", e.target.value)} /></div>
                    <div className="space-y-2"><Label>L.R. Date</Label><Input type="date" value={formData.lrDate} onChange={(e) => handleChange("lrDate", e.target.value)} /></div>
                  </div>
                  <div className="space-y-2"><Label>Remarks</Label><Textarea value={formData.remarks} onChange={(e) => handleChange("remarks", e.target.value)} rows={2} /></div>
                </div>

                {error && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>)}

                <div className="flex gap-4 pt-4">
                  <Button type="submit" className="flex-1 bg-gradient-to-r from-accent to-accent-secondary" disabled={isLoading}>{isLoading ? "Saving..." : "Save Purchase Invoice"}</Button>
                  <Link href="/purchase-invoices/list" className="flex-1"><Button type="button" variant="outline" className="w-full bg-transparent">Cancel</Button></Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout></AuthGuard>
  );
}
