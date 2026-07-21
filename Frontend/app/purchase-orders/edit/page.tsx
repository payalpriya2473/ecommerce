"use client"
import type React from "react"
import { useState, useEffect, useCallback, Suspense, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
  ShoppingCart, AlertCircle, CheckCircle2, Trash2,
  ArrowLeft, ChevronUp, ChevronDown, AlertTriangle, XCircle, MessageSquare, Plus,
} from "lucide-react"
import { purchaseOrderAPI, supplierAPI, brandAPI, itemAPI, itemGroupAPI, companyAPI } from "@/lib/api"
import Link from "next/link"
import { usePermissions } from "@/hooks/usePermissions"
import { SearchableSupplierSelect } from "@/components/searchable-supplier-select"
import { TableSelect, type TableSelectOption } from "@/components/table-select"
import { getSupplierTaxContext } from "@/lib/gst-utils"
import {
  findItemVariant,
  getItemVariantLineKey,
  getItemVariants,
  hasItemVariants,
  normalizeVariantLabel,
  sid,
} from "@/lib/item-variant-utils"

interface POItem {
  id: string; itemId?: string; brandId?: string; brandName: string; itemName: string;
  variantId?: string; variant?: string;
  uom: string; hsnCode: string; gstRate: number; qty: number; rate: number; amount: number;
  cgstPercent: number; cgstAmount: number; sgstPercent: number; sgstAmount: number;
  igstPercent: number; igstAmount: number; total: number; marginPercent: number; incPercent: number;
  remarks: string; itemGroupId?: string; itemGroupName?: string;
  maxStock?: number; currentStock?: number; pendingPOQty?: number;
  originalQty?: number;
  cancelRemark?: string;
}

interface StockWarning {
  itemRowId: string; itemName: string; groupName: string;
  maxStock: number; currentStock: number; pendingPOQty: number;
  remainingQty: number; enteredQty: number;
}

interface CancelQtyState {
  itemId: string
  itemName: string
  currentQty: number
  remark: string
}

const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`

const emptyItem = (): POItem => ({
  id: genId(), itemId: "", brandId: "", brandName: "", itemName: "",
  variantId: "", variant: "",
  uom: "", hsnCode: "", gstRate: 0, qty: 0, rate: 0, amount: 0,
  cgstPercent: 0, cgstAmount: 0, sgstPercent: 0, sgstAmount: 0,
  igstPercent: 0, igstAmount: 0, total: 0, marginPercent: 0, incPercent: 0,
  remarks: "", itemGroupId: "", itemGroupName: "", maxStock: 0, currentStock: 0, pendingPOQty: 0,
  originalQty: 0, cancelRemark: "",
})

const computeFromInclusiveRate = (rate: number, qty: number, gst: number, isGuj: boolean) => {
  const total = rate * qty; const div = 1 + gst / 100; const amount = total / div
  const cp = isGuj ? gst / 2 : 0; const sp = isGuj ? gst / 2 : 0; const ip = isGuj ? 0 : gst
  return { amount, total, cgstPercent: cp, cgstAmount: amount * cp / 100, sgstPercent: sp, sgstAmount: amount * sp / 100, igstPercent: ip, igstAmount: amount * ip / 100 }
}

const computeFromTotal = (total: number, qty: number, gst: number, isGuj: boolean) => {
  const div = 1 + gst / 100; const amount = total / div; const rate = qty > 0 ? total / qty : 0
  const cp = isGuj ? gst / 2 : 0; const sp = isGuj ? gst / 2 : 0; const ip = isGuj ? 0 : gst
  return { amount, rate, total, cgstPercent: cp, cgstAmount: amount * cp / 100, sgstPercent: sp, sgstAmount: amount * sp / 100, igstPercent: ip, igstAmount: amount * ip / 100 }
}

const toNum = (v: unknown) => Number(v) || 0
const fmt = (v: unknown) => toNum(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const pickNum = (obj: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) { const v = obj[k]; if (v !== undefined && v !== null && v !== "") { const n = Number(v); if (!Number.isNaN(n)) return n; } }
  return 0
}

const resolveGst = (item: Record<string, unknown>) => {
  const d = pickNum(item, ["gstRate", "gstPercent", "gst"])
  if (d > 0) return d
  const ig = pickNum(item, ["igstPercent"]); const sg = pickNum(item, ["sgstPercent"]); const cg = pickNum(item, ["cgstPercent"])
  if (ig > 0 || sg > 0 || cg > 0) return ig > 0 ? ig : sg + cg
  const amt = pickNum(item, ["amount"]); const igAmt = pickNum(item, ["igstAmount", "igst"]); const cgAmt = pickNum(item, ["cgstAmount", "cgst"]); const sgAmt = pickNum(item, ["sgstAmount", "sgst"])
  if (amt > 0) { if (igAmt > 0) return (igAmt * 100) / amt; if (cgAmt > 0 || sgAmt > 0) return ((cgAmt + sgAmt) * 100) / amt; }
  return 0
}

const parseCancelRemark = (remarks: string): { baseRemarks: string; cancelRemark: string } => {
  if (!remarks) return { baseRemarks: "", cancelRemark: "" }
  const match = remarks.match(/^(.*?)\s*\|\s*\[Cancel Note:\s*(.*?)\]\s*$/)
  if (match) return { baseRemarks: match[1].trim(), cancelRemark: match[2].trim() }
  const matchOnly = remarks.match(/^\[Cancel Note:\s*(.*?)\]\s*$/)
  if (matchOnly) return { baseRemarks: "", cancelRemark: matchOnly[1].trim() }
  return { baseRemarks: remarks, cancelRemark: "" }
}

const normForDisplay = (
  item: Record<string, unknown>, isGuj: boolean,
  itemsMap: Record<string, any>, groupsMap: Record<string, any>,
  pendingMap: Record<string, number>,
): POItem => {
  const qty = pickNum(item, ["qty", "quantity"])
  const gstRate = resolveGst(item)
  const apiTotal = pickNum(item, ["total", "lineTotal"])
  const apiRate = pickNum(item, ["rate", "purchaseRate"])
  const itemId = sid(item.itemId || item.item_id)
  const master = itemsMap[itemId]
  const brandId = sid(item.brandId || item.brand_id || master?.brandId)
  const groupId = sid(item.itemGroupId || item.item_group_id || master?.itemGroupId)
  const group = groupsMap[groupId]
  let rate: number; let computed: ReturnType<typeof computeFromInclusiveRate>
  if (apiTotal > 0) { rate = qty > 0 ? apiTotal / qty : apiRate; computed = computeFromInclusiveRate(rate, qty, gstRate, isGuj); computed.total = apiTotal; }
  else if (apiRate > 0) { rate = apiRate; computed = computeFromInclusiveRate(rate, qty, gstRate, isGuj); }
  else { rate = 0; computed = computeFromInclusiveRate(0, qty, gstRate, isGuj); }

  const rawRemarks = String(item.remarks || "")
  const { baseRemarks, cancelRemark } = parseCancelRemark(rawRemarks)

  return {
    id: sid(item.id) || genId(), itemId, brandId,
    variantId: sid(item.variantId || item.variant_id || item.variant || ""),
    variant: normalizeVariantLabel(item.variant),
    brandName: String(item.brandName || item.brand || master?.brandName || ""),
    itemName: String(item.itemName || item.name || master?.itemName || ""),
    uom: String(item.uom || master?.uom || ""),
    hsnCode: String(item.hsnCode || item.hsn || master?.hsnCode || ""),
    qty, rate, amount: computed.amount,
    marginPercent: pickNum(item, ["marginPercent", "margin_percent"]),
    incPercent: pickNum(item, ["incPercent", "inc_percent", "incentive"]),
    gstRate,
    cgstPercent: computed.cgstPercent, cgstAmount: computed.cgstAmount,
    sgstPercent: computed.sgstPercent, sgstAmount: computed.sgstAmount,
    igstPercent: computed.igstPercent, igstAmount: computed.igstAmount,
    total: computed.total,
    remarks: baseRemarks,
    itemGroupId: groupId,
    itemGroupName: group?.name || String(item.itemGroupName || ""),
    maxStock: Number(group?.maxQty ?? 0),
    currentStock: pickNum(item, ["openingStock", "currentStock"]) || pickNum(master || {}, ["openingStock", "currentStock"]),
    pendingPOQty: Number(pendingMap[groupId] ?? 0),
    originalQty: qty,
    cancelRemark,
  }
}

const normForApi = (item: POItem) => {
  const gr = toNum(item.gstRate)
  const baseRemarks = (item.remarks || "").trim()
  const cancelNote = (item.cancelRemark || "").trim()
  const finalRemarks = cancelNote
    ? (baseRemarks ? `${baseRemarks} | [Cancel Note: ${cancelNote}]` : `[Cancel Note: ${cancelNote}]`)
    : baseRemarks

  return {
    itemId: item.itemId || undefined, brandId: item.brandId || undefined,
    variantId: item.variantId || undefined, variant: normalizeVariantLabel(item.variant) || undefined,
    itemName: item.itemName,
    qty: toNum(item.qty),
    rate: toNum(item.rate), amount: toNum(item.amount),
    marginPercent: toNum(item.marginPercent), incPercent: toNum(item.incPercent),
    cgstPercent: toNum(item.cgstPercent), cgstAmount: toNum(item.cgstAmount),
    sgstPercent: toNum(item.sgstPercent), sgstAmount: toNum(item.sgstAmount),
    igstPercent: toNum(item.igstPercent), igstAmount: toNum(item.igstAmount),
    total: toNum(item.total), gstRate: gr, gstPercent: gr,
    remarks: finalRemarks,
  }
}

// ─── Stock Warning Modal ────────────────────────────────────────────────────

function StockWarningModal({ warning, onClose }: { warning: StockWarning | null; onClose: () => void }) {
  if (!warning) return null
  return (
    <Dialog open={!!warning} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
            <span className="text-amber-700">Stock Limit Exceeded</span>
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-foreground pt-1">Quantity exceeds allowed limit.{" "}
              <span className="font-semibold text-red-600">Only {warning.remainingQty} item{warning.remainingQty !== 1 ? "s" : ""} can be ordered</span>{" "}
              based on current stock and pending PO.
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 overflow-hidden text-sm">
          <div className="bg-muted/50 px-4 py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide">{warning.groupName} — Stock Breakdown</div>
          <div className="divide-y divide-border/40">
            <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Group Max Stock</span><span className="font-semibold">{warning.maxStock.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Current Stock</span><span className="font-semibold text-blue-600">− {warning.currentStock.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Pending PO Qty</span><span className="font-semibold text-orange-600">− {warning.pendingPOQty.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between px-4 py-2.5 bg-green-50"><span className="font-semibold text-green-800">Remaining Allowed</span><span className="font-bold text-green-700">{warning.remainingQty.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between px-4 py-2.5 bg-red-50"><span className="font-semibold text-red-700">You Entered</span><span className="font-bold text-red-600">{warning.enteredQty.toLocaleString("en-IN")}</span></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Item: <span className="font-medium">{warning.itemName}</span></p>
        <DialogFooter><Button onClick={onClose} className="w-full bg-red-700 hover:bg-red-800 text-white">OK, I'll Adjust the Quantity</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Cancel-Qty Modal ───────────────────────────────────────────────────────

interface CancelQtyModalProps {
  state: CancelQtyState | null
  onClose: () => void
  onConfirm: (rowId: string, newQty: number, remark: string) => void
}

function CancelQtyModal({ state, onClose, onConfirm }: CancelQtyModalProps) {
  const [newQty, setNewQty] = useState(0)
  const [remark, setRemark] = useState("")
  const [qtyError, setQtyError] = useState("")

  useEffect(() => {
    if (state) { setNewQty(state.currentQty); setRemark(state.remark || ""); setQtyError("") }
  }, [state])

  if (!state) return null
  const cancelledQty = state.currentQty - newQty

  const handleConfirm = () => {
    if (newQty < 0) { setQtyError("Quantity cannot be negative."); return }
    if (newQty > state.currentQty) { setQtyError(`Cannot exceed original quantity of ${state.currentQty}.`); return }
    if (!remark.trim()) { setQtyError("Please enter a remark explaining the reason."); return }
    onConfirm(state.itemId, newQty, remark.trim())
  }

  return (
    <Dialog open={!!state} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><XCircle className="h-5 w-5 text-red-600" /></div>
            <span className="text-red-700">Cancel / Adjust Quantity</span>
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-foreground pt-1">
              Update the quantity for <span className="font-semibold">{state.itemName}</span>.
              The new quantity must be ≤ the current ordered quantity.
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 overflow-hidden text-sm">
          <div className="bg-muted/50 px-4 py-2 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Quantity Adjustment</div>
          <div className="divide-y divide-border/40">
            <div className="flex justify-between px-4 py-2.5"><span className="text-muted-foreground">Original (PO) Qty</span><span className="font-semibold">{state.currentQty.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between px-4 py-2.5 bg-amber-50"><span className="font-semibold text-amber-800">Cancelled Qty</span><span className="font-bold text-amber-700">{cancelledQty > 0 ? cancelledQty.toLocaleString("en-IN") : "—"}</span></div>
            <div className="flex justify-between px-4 py-2.5 bg-green-50"><span className="font-semibold text-green-800">New (Updated) Qty</span><span className="font-bold text-green-700">{newQty.toLocaleString("en-IN")}</span></div>
          </div>
        </div>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-qty" className="text-sm font-medium">New Quantity <span className="text-destructive">*</span></Label>
            <Input id="cancel-qty" type="number" min={0} max={state.currentQty} value={newQty}
              onChange={(e) => { const raw = e.target.value; if (raw === "") { setNewQty(0); setQtyError(""); return }; const norm = raw.replace(/^0+(?=\d)/, ""); setNewQty(parseFloat(norm) || 0); setQtyError("") }}
              onFocus={(e) => e.target.select()} className="h-10" />
            <p className="text-xs text-muted-foreground">Max allowed: <span className="font-medium">{state.currentQty}</span></p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-remark" className="text-sm font-medium flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />Reason / Remark <span className="text-destructive">*</span>
            </Label>
            <Textarea id="cancel-remark" value={remark} onChange={(e) => { setRemark(e.target.value); setQtyError("") }} rows={3} className="resize-none" />
          </div>
          {qtyError && <Alert variant="destructive" className="py-2"><AlertCircle className="h-4 w-4" /><AlertDescription>{qtyError}</AlertDescription></Alert>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent">Cancel</Button>
          <Button onClick={handleConfirm} className="flex-1 bg-red-700 hover:bg-red-800 text-white">Confirm Update</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Item Row ───────────────────────────────────────────────────────────────

interface EditPOItemRowProps {
  item: POItem; index: number;
  brandOptions: TableSelectOption[]; itemOptions: TableSelectOption[];
  allItems: any[]; selectedLineKeys: string[];
  isGujaratSupplier: boolean; isFirst: boolean; isLast: boolean; isSingle: boolean; allPoItems: POItem[];
  onUpdate: (id: string, field: any, value: any) => void;
  onRemove: (id: string) => void;
  onOpenCancelModal: (item: POItem) => void;
  onMove: (id: string, dir: "up" | "down") => void;
}

function EditPOItemRow({
  item, index, brandOptions, itemOptions, allItems, selectedLineKeys,
  isGujaratSupplier, isFirst, isLast, isSingle, allPoItems,
  onUpdate, onRemove, onOpenCancelModal, onMove,
}: EditPOItemRowProps) {
  const [totalInput, setTotalInput] = useState(() => item.total ? item.total.toFixed(2) : "")
  useEffect(() => { setTotalInput(item.total ? item.total.toFixed(2) : "") }, [item.total])

  const selectedMasterItem = useMemo(
    () => allItems.find((entry) => sid(entry.id) === sid(item.itemId)),
    [allItems, item.itemId]
  )

  const filteredItemOptions = useMemo(() => {
    return itemOptions.filter((opt) => {
      const master = allItems.find((i) => sid(i.id) === sid(opt.id))
      if (item.brandId && master && sid(master.brandId) !== sid(item.brandId)) return false
      if (sid(opt.id) !== sid(item.itemId) && !hasItemVariants(master)) {
        const itemKey = getItemVariantLineKey(opt.id)
        if (selectedLineKeys.includes(itemKey)) return false
      }
      return true
    })
  }, [itemOptions, allItems, item.brandId, item.itemId, selectedLineKeys])

  const variantOptions = useMemo(() => {
    const variants = getItemVariants(selectedMasterItem)
    return variants
      .filter((variant) => {
        const lineKey = getItemVariantLineKey(item.itemId, variant.id, variant.variant)
        const currentKey = getItemVariantLineKey(item.itemId, item.variantId, item.variant)
        return lineKey === currentKey || !selectedLineKeys.includes(lineKey)
      })
      .map((variant) => ({
        id: sid(variant.id || variant.variant),
        label: normalizeVariantLabel(variant.variant),
        sublabel: `NLC: ${fmt(variant.nlc ?? 0)}`,
      }))
  }, [selectedMasterItem, item.itemId, item.variantId, item.variant, selectedLineKeys])

  const hasLimit = !!(item.itemGroupId && item.maxStock && item.maxStock > 0)
  const siblingQty = hasLimit ? allPoItems.filter((r) => r.id !== item.id && sid(r.itemGroupId) === sid(item.itemGroupId)).reduce((s, r) => s + r.qty, 0) : 0
  const remainingQty = hasLimit ? Math.max(0, (item.maxStock ?? 0) - (item.currentStock ?? 0) - (item.pendingPOQty ?? 0) - siblingQty) : null
  const isOverLimit = remainingQty !== null && item.qty > remainingQty
  const isQtyReduced = !!(item.originalQty && item.qty < item.originalQty)

  const numInputStyle: React.CSSProperties = {
    width: "100%", height: "28px", border: "none", background: "transparent",
    outline: "none", fontSize: "0.75rem", textAlign: "center", padding: "0 4px", appearance: "textfield" as any,
  }

  return (
    <>
      <tr className={isOverLimit ? "over-limit" : ""}>
        <td style={{ textAlign: "center", padding: "4px 2px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
            <span style={{ fontSize: "0.7rem", color: "#6b7280", fontWeight: 500 }}>{index + 1}.</span>
            <button type="button" disabled={isFirst} onClick={() => onMove(item.id, "up")}
              style={{ height: "14px", width: "14px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", opacity: isFirst ? 0.3 : 1 }}>
              <ChevronUp style={{ width: "10px", height: "10px" }} />
            </button>
            <button type="button" disabled={isLast} onClick={() => onMove(item.id, "down")}
              style={{ height: "14px", width: "14px", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", opacity: isLast ? 0.3 : 1 }}>
              <ChevronDown style={{ width: "10px", height: "10px" }} />
            </button>
          </div>
        </td>
        <td style={{ padding: "2px 3px" }}>
          <TableSelect value={sid(item.brandId)} options={brandOptions} onValueChange={(v) => onUpdate(item.id, "brandId", v)} />
        </td>
      <td style={{ padding: "2px 3px" }}>
        <TableSelect value={sid(item.itemId)} options={filteredItemOptions} onValueChange={(v) => onUpdate(item.id, "itemId", v)} />
      </td>
      <td style={{ padding: "2px 3px" }}>
        <TableSelect
          value={sid(item.variantId || item.variant)}
          options={variantOptions}
          placeholder="Variant"
          disabled={!item.itemId || variantOptions.length === 0}
          onValueChange={(v) => onUpdate(item.id, "variantId", v)}
        />
      </td>
      <td style={{ padding: "3px 4px" }}>
        <Input className="h-7 text-xs border-0 bg-transparent focus:bg-background focus:border focus:border-border/60 rounded px-1 w-full"
          value={item.remarks || ""} onChange={(e) => onUpdate(item.id, "remarks", e.target.value)} />
        </td>
        <td style={{ textAlign: "center" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "#374151" }}>{item.gstRate}%</span>
        </td>
        <td style={{ padding: "0", position: "relative", cursor: "pointer" }} onClick={() => onOpenCancelModal(item)} title="Click to cancel / adjust quantity" className="qty-clickable">
          <div style={{ width: "100%", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", padding: "0 4px", color: isOverLimit ? "#dc2626" : isQtyReduced ? "#d97706" : "#111827", fontWeight: isOverLimit || isQtyReduced ? 600 : 400, userSelect: "none" }}>
            {item.qty || 0}
          </div>
          {isQtyReduced && (
            <span style={{ position: "absolute", top: 1, right: 2, fontSize: "0.55rem", color: "#d97706", fontWeight: 700, lineHeight: 1, pointerEvents: "none" }}>
              ↓{item.originalQty}
            </span>
          )}
        </td>
        <td style={{ padding: "0" }}>
          <input type="number" className="no-spinner" value={item.rate || ""} min={0}
            onChange={(e) => onUpdate(item.id, "rate", parseFloat(e.target.value) || 0)} style={numInputStyle} />
        </td>
        <td style={{ textAlign: "right", padding: "4px 8px" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>{fmt(item.amount)}</span>
        </td>
        {isGujaratSupplier ? (
          <>
            <td style={{ textAlign: "center", padding: "4px 6px" }}>
              <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{item.cgstPercent}%</div>
              <div style={{ fontSize: "0.72rem", fontWeight: 500 }}>₹{fmt(item.cgstAmount)}</div>
            </td>
            <td style={{ textAlign: "center", padding: "4px 6px" }}>
              <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{item.sgstPercent}%</div>
              <div style={{ fontSize: "0.72rem", fontWeight: 500 }}>₹{fmt(item.sgstAmount)}</div>
            </td>
          </>
        ) : (
          <td style={{ textAlign: "center", padding: "4px 6px" }}>
            <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{item.igstPercent}%</div>
            <div style={{ fontSize: "0.72rem", fontWeight: 500 }}>₹{fmt(item.igstAmount)}</div>
          </td>
        )}
        <td style={{ textAlign: "center", padding: "4px 6px" }}>
          {item.marginPercent > 0 ? <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>{item.marginPercent}%</span> : <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>—</span>}
        </td>
        <td style={{ textAlign: "center", padding: "4px 6px" }}>
          {item.incPercent > 0 ? <span style={{ fontSize: "0.72rem", fontWeight: 500 }}>{item.incPercent}%</span> : <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>—</span>}
        </td>
        <td style={{ padding: "0" }}>
          <input type="number" className="no-spinner" value={totalInput}
            onChange={(e) => setTotalInput(e.target.value)}
            onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onUpdate(item.id, "totalInput", v) }}
            style={{ ...numInputStyle, fontWeight: 600 }} />
        </td>
        <td style={{ textAlign: "center", padding: "4px 2px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
            <button type="button" onClick={() => onOpenCancelModal(item)} title="Cancel / Adjust quantity"
              style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: item.cancelRemark ? "#fef3c7" : "none", cursor: "pointer", color: item.cancelRemark ? "#d97706" : "#dc2626" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#fef2f2" }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = item.cancelRemark ? "#fef3c7" : "transparent" }}>
              <XCircle style={{ width: "13px", height: "13px" }} />
            </button>
            <button type="button" disabled={isSingle} onClick={() => onRemove(item.id)} title="Remove row"
              style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: "none", cursor: isSingle ? "not-allowed" : "pointer", color: "#dc2626", opacity: isSingle ? 0.3 : 1 }}
              onMouseEnter={e => { if (!isSingle) e.currentTarget.style.backgroundColor = "#fef2f2" }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
              <Trash2 style={{ width: "13px", height: "13px" }} />
            </button>
          </div>
        </td>
      </tr>
      {item.cancelRemark && (
        <tr>
          <td colSpan={isGujaratSupplier ? 14 : 13} style={{ padding: "3px 12px 5px 52px", background: "rgba(251,191,36,0.07)", borderBottom: "1px solid #fde68a" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.7rem", color: "#92400e", fontStyle: "italic" }}>
              <MessageSquare style={{ width: "10px", height: "10px", flexShrink: 0 }} />
              <strong style={{ fontStyle: "normal" }}>Cancel note:</strong> {item.cancelRemark}
              {item.originalQty !== undefined && item.originalQty !== item.qty && (
                <span style={{ marginLeft: "8px", fontStyle: "normal", fontWeight: 600, color: "#b45309", background: "#fef3c7", borderRadius: "4px", padding: "1px 6px", fontSize: "0.68rem" }}>
                  {item.originalQty} → {item.qty}
                </span>
              )}
            </span>
          </td>
        </tr>
      )}
    </>
  )
}

function SRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-red-600">{value}</span>
    </div>
  )
}

// ─── Main Page Content ──────────────────────────────────────────────────────

function PurchaseOrderEditContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const poId = searchParams.get("id") || ""

  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [companies, setCompanies] = useState<any[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState("")
  const [userRole, setUserRole] = useState("")
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [brands, setBrands] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [itemGroups, setItemGroups] = useState<any[]>([])
  const [pendingPOQtyByGroup, setPendingPOQtyByGroup] = useState<Record<string, number>>({})
  const [pendingLoaded, setPendingLoaded] = useState(false)
  const [masterLoaded, setMasterLoaded] = useState(false)
  const [poItems, setPOItems] = useState<POItem[]>([emptyItem()])
  const [isGujaratSupplier, setIsGujaratSupplier] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState("")
  const [stockWarning, setStockWarning] = useState<StockWarning | null>(null)
  const [cancelQtyState, setCancelQtyState] = useState<CancelQtyState | null>(null)
  const [formData, setFormData] = useState({
    supplierId: "", poDate: new Date().toISOString().split("T")[0],
    paymentTerms: "", deliverySchedule: "", transportation: "",
    remarks: "", discountPercent: 0, otherCharges: 0,
  })
  const { canEdit } = usePermissions()

  const totalTaxable = poItems.reduce((s, i) => s + i.amount, 0)
  const discountAmt = (totalTaxable * formData.discountPercent) / 100
  const totalCGST = poItems.reduce((s, i) => s + i.cgstAmount, 0)
  const totalSGST = poItems.reduce((s, i) => s + i.sgstAmount, 0)
  const totalIGST = poItems.reduce((s, i) => s + i.igstAmount, 0)
  const totalQty = poItems.reduce((s, i) => s + i.qty, 0)
  const subTotal = poItems.reduce((s, i) => s + i.total, 0)
  const netAmount = subTotal - discountAmt + Number(formData.otherCharges)

  const brandOptions: TableSelectOption[] = useMemo(() => brands.map((b) => ({ id: sid(b.id), label: b.name })), [brands])
  const itemOptions: TableSelectOption[] = useMemo(() => items.map((i) => ({ id: sid(i.id), label: i.itemName, sublabel: i.itemGroupName || "" })), [items])
  const selectedLineKeys = useMemo(() => poItems.map((i) => getItemVariantLineKey(i.itemId, i.variantId, i.variant)).filter(Boolean), [poItems])

  useEffect(() => {
    if (!poId) return
    const load = async () => {
      const token = sessionStorage.getItem("authToken") || ""
      const sessionCompanyId = sessionStorage.getItem("companyId") || ""
      const role = sessionStorage.getItem("userRole") || ""
      setUserRole(role)
      const poRes = await purchaseOrderAPI.getById(token, poId)
      const resolvedCompanyId = sid(poRes?.data?.companyId || sessionCompanyId)
      setSelectedCompanyId(resolvedCompanyId)
      if (role === "super_admin") { const cr = await companyAPI.getAll(token); if (cr.success) setCompanies(cr.data) }
      const [bR, iR, sR, gR] = await Promise.all([
        brandAPI.getAll(token, resolvedCompanyId), itemAPI.getAll(token, resolvedCompanyId),
        supplierAPI.getAll(token), itemGroupAPI.getAll(token, resolvedCompanyId),
      ])
      if (bR.success) setBrands(bR.data)
      if (iR.success) setItems(iR.data)
      if (sR.success) setSuppliers(sR.data)
      if (gR.success) setItemGroups(gR.data)
      try {
        const pR = await purchaseOrderAPI.getPendingQtyByGroup(token, resolvedCompanyId, poId)
        if (pR?.success) setPendingPOQtyByGroup(pR.data || {})
      } catch { setPendingPOQtyByGroup({}) }
      setPendingLoaded(true); setMasterLoaded(true)
    }
    load()
  }, [poId])

  const handleCompanyChange = async (newCompanyId: string) => {
    setSelectedCompanyId(newCompanyId)
    const token = sessionStorage.getItem("authToken") || ""
    const [bR, iR, gR] = await Promise.all([brandAPI.getAll(token, newCompanyId), itemAPI.getAll(token, newCompanyId), itemGroupAPI.getAll(token, newCompanyId)])
    if (bR.success) setBrands(bR.data); if (iR.success) setItems(iR.data); if (gR.success) setItemGroups(gR.data)
    setPOItems([emptyItem()])
  }

  useEffect(() => {
    if (!poId || !masterLoaded || !pendingLoaded || suppliers.length === 0 || items.length === 0 || itemGroups.length === 0) return
    fetchPO()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId, masterLoaded, pendingLoaded, suppliers, items, itemGroups])

  const fetchPO = async () => {
    try {
      const token = sessionStorage.getItem("authToken") || ""
      const result = await purchaseOrderAPI.getById(token, poId)
      if (result.success) {
        const po = result.data
        setFormData({
          supplierId: po.supplierId || "", poDate: po.poDate ? po.poDate.split("T")[0] : new Date().toISOString().split("T")[0],
          paymentTerms: po.paymentTerms || "", deliverySchedule: po.deliverySchedule || "",
          transportation: po.transportation || "", remarks: po.remarks || "",
          discountPercent: po.discountPercent || 0, otherCharges: po.otherCharges || 0,
        })
        const supplier = suppliers.find((s) => s.id === po.supplierId)
        const isGuj = getSupplierTaxContext(supplier).isIntraState
        setIsGujaratSupplier(isGuj)
        const groupsMap = Object.fromEntries(itemGroups.map((g: any) => [sid(g.id), g]))
        const itemsMap = Object.fromEntries(items.map((i: any) => [sid(i.id), i]))
        const src = Array.isArray(po.items) ? po.items : Array.isArray(po.orderItems) ? po.orderItems : Array.isArray(po.purchaseOrderItems) ? po.purchaseOrderItems : []
        if (src.length > 0) {
          setPOItems(src.map((item: any) => normForDisplay(item, isGuj, itemsMap, groupsMap, pendingPOQtyByGroup)))
          const missingBrands: any[] = []
          src.forEach((item: any) => {
            const bId = sid(item.brandId || item.brand_id); const bName = String(item.brandName || item.brand || "")
            if (bId && bName && !brands.find((b) => sid(b.id) === bId)) missingBrands.push({ id: bId, name: bName })
          })
          if (missingBrands.length > 0) setBrands((prev) => [...prev, ...missingBrands])
        }
      }
    } catch { setError("Failed to load purchase order") }
    finally { setIsLoading(false) }
  }

  const handleChange = (field: string, value: any) => { setFormData((p) => ({ ...p, [field]: value })); setError("") }

  const handleSupplierChange = (supplierId: string) => {
    handleChange("supplierId", supplierId)
    const s = suppliers.find((s) => s.id === supplierId)
    const isGuj = getSupplierTaxContext(s).isIntraState
    setIsGujaratSupplier(isGuj)
    setPOItems((prev) => prev.map((item) => {
      if (item.gstRate === 0 || item.rate === 0) return item
      return { ...item, ...computeFromInclusiveRate(item.rate, item.qty, item.gstRate, isGuj) }
    }))
  }

  const applyItemFields = (base: POItem, fi: any, isGuj: boolean): POItem => {
    const gstRate = fi.gst || fi.gstRate || fi.gstPercent || 0
    const rate = fi.nlc || fi.purchaseRate || fi.rate || 0
    const group = itemGroups.find((g) => sid(g.id) === sid(fi.itemGroupId))
    return {
      ...base, itemId: sid(fi.id), itemName: fi.itemName, uom: fi.uom || "", hsnCode: fi.hsnCode || "",
      variantId: "", variant: "",
      gstRate, rate, marginPercent: fi.margin || fi.marginPercent || 0, incPercent: fi.incentive || fi.incPercent || 0,
      itemGroupId: sid(fi.itemGroupId), itemGroupName: group?.name || fi.itemGroupName || "",
      maxStock: Number(group?.maxQty ?? 0), currentStock: Number(fi.openingStock ?? 0),
      pendingPOQty: Number(pendingPOQtyByGroup[sid(fi.itemGroupId)] ?? 0),
      ...computeFromInclusiveRate(rate, base.qty, gstRate, isGuj),
    }
  }

  const applyVariantFields = (base: POItem, fi: any, variantLike: any, isGuj: boolean): POItem => {
    const variant = findItemVariant(fi, variantLike?.id, variantLike?.variant)
    if (!variant) return base
    const rate = Number(variant.nlc ?? fi.nlc ?? fi.purchaseRate ?? fi.rate ?? 0)
    const gstRate = Number(fi.gst || fi.gstRate || fi.gstPercent || base.gstRate || 0)
    return {
      ...base,
      variantId: sid(variant.id || variant.variant),
      variant: normalizeVariantLabel(variant.variant),
      rate,
      gstRate,
      marginPercent: Number(variant.margin ?? fi.margin ?? fi.marginPercent ?? base.marginPercent ?? 0),
      incPercent: Number(variant.incentive ?? fi.incentive ?? fi.incPercent ?? base.incPercent ?? 0),
      currentStock: Number(variant.openingStock ?? fi.openingStock ?? base.currentStock ?? 0),
      ...computeFromInclusiveRate(rate, base.qty, gstRate, isGuj),
    }
  }

  const checkStockLimit = useCallback((
    rowId: string, masterItem: any, group: any, enteredQty: number, currentPoItems: POItem[],
  ): StockWarning | null => {
    if (!group || !group.maxQty || Number(group.maxQty) <= 0) return null
    const maxStock = Number(group.maxQty); const currentStock = Number(masterItem?.openingStock ?? 0)
    const pendingOther = Number(pendingPOQtyByGroup[sid(group.id)] ?? 0)
    const qtyHere = currentPoItems.filter((r) => r.id !== rowId && sid(r.itemGroupId) === sid(group.id)).reduce((s, r) => s + r.qty, 0)
    const total = pendingOther + qtyHere; const remaining = maxStock - (currentStock + total)
    if (enteredQty > remaining) {
      return { itemRowId: rowId, itemName: masterItem?.itemName || "", groupName: group.name || "", maxStock, currentStock, pendingPOQty: total, remainingQty: Math.max(0, remaining), enteredQty }
    }
    return null
  }, [pendingPOQtyByGroup])

  const handleOpenCancelModal = useCallback((item: POItem) => {
    setCancelQtyState({
      itemId: item.id,
      itemName: item.itemName || "this item",
      currentQty: item.originalQty && item.originalQty > item.qty ? item.originalQty : item.qty,
      remark: item.cancelRemark || ""
    })
  }, [])

  const handleCancelQtyConfirm = useCallback((rowId: string, newQty: number, remark: string) => {
    setPOItems((prev) => prev.map((item) => {
      if (item.id !== rowId) return item
      const origQty = item.originalQty && item.originalQty > 0 ? item.originalQty : item.qty
      return { ...item, qty: newQty, cancelRemark: remark, originalQty: origQty, ...computeFromInclusiveRate(item.rate, newQty, item.gstRate, isGujaratSupplier) }
    }))
    setCancelQtyState(null)
  }, [isGujaratSupplier])

  const updateItem = useCallback((id: string, field: any, value: any) => {
    setPOItems((prev) => prev.map((item) => {
      if (item.id !== id) return item
      let u = { ...item }
      if (field === "brandId") {
        const brand = brands.find((b) => sid(b.id) === sid(value))
        u.brandId = sid(value); u.brandName = brand?.name || ""; u.itemId = ""; u.itemName = ""; u.variantId = ""; u.variant = ""; return u
      }
      if (field === "itemId") {
        const fi = items.find((i) => sid(i.id) === sid(value))
        const alreadyUsed = !hasItemVariants(fi) && prev.some((r) => r.id !== id && sid(r.itemId) === sid(value))
        if (alreadyUsed) {
          const name = fi?.itemName || "This item"
          setDuplicateWarning(`"${name}" is already added.`); setTimeout(() => setDuplicateWarning(""), 4000); return item
        }
        setDuplicateWarning("")
        if (fi) {
          u = applyItemFields(u, fi, isGujaratSupplier)
          const variants = getItemVariants(fi)
          if (variants.length === 1) u = applyVariantFields(u, fi, variants[0], isGujaratSupplier)
          if (fi.brandId && !u.brandId) { const brand = brands.find((b) => sid(b.id) === sid(fi.brandId)); if (brand) { u.brandId = sid(fi.brandId); u.brandName = brand.name } }
          const group = itemGroups.find((g) => sid(g.id) === sid(fi.itemGroupId))
          const w = checkStockLimit(id, fi, group, u.qty, prev)
          if (w) setTimeout(() => setStockWarning(w), 50)
        }
        return u
      }
      if (field === "variantId") {
        const fi = items.find((i) => sid(i.id) === sid(u.itemId))
        const variant = findItemVariant(fi, value)
        const nextKey = getItemVariantLineKey(u.itemId, variant?.id, variant?.variant)
        const alreadyUsed = nextKey && prev.some((r) => r.id !== id && getItemVariantLineKey(r.itemId, r.variantId, r.variant) === nextKey)
        if (alreadyUsed) {
          const label = normalizeVariantLabel(variant?.variant) || "This variant"
          setDuplicateWarning(`"${u.itemName} - ${label}" is already added.`); setTimeout(() => setDuplicateWarning(""), 4000); return item
        }
        setDuplicateWarning("")
        if (!fi || !variant) return { ...u, variantId: sid(value), variant: "" }
        return applyVariantFields(u, fi, variant, isGujaratSupplier)
      }
      if (field === "gstRate") return item
      if (field === "rate") { u.rate = Number(value); return { ...u, ...computeFromInclusiveRate(u.rate, u.qty, u.gstRate, isGujaratSupplier) } }
      if (field === "totalInput") return { ...u, ...computeFromTotal(Number(value), u.qty, u.gstRate, isGujaratSupplier) }
      if (field === "remarks") { u.remarks = value; return u }
      ;(u as any)[field] = value; return u
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands, items, itemGroups, isGujaratSupplier, checkStockLimit])

  const addItem = () => setPOItems((p) => [...p, emptyItem()])
  const removeItem = (id: string) => { if (poItems.length === 1) return; setPOItems((p) => p.filter((i) => i.id !== id)) }
  const moveItem = (id: string, dir: "up" | "down") => {
    setPOItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id)
      if (dir === "up" && idx === 0) return prev; if (dir === "down" && idx === prev.length - 1) return prev
      const next = [...prev]; const swap = dir === "up" ? idx - 1 : idx + 1; [next[idx], next[swap]] = [next[swap], next[idx]]; return next
    })
  }

  const selectedSupplier = suppliers.find((s) => s.id === formData.supplierId)
  const supplierTaxContext = getSupplierTaxContext(selectedSupplier)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter") { const t = e.target as HTMLElement; if (t.tagName !== "TEXTAREA" && t.tagName !== "INPUT") e.preventDefault() }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("")
    if (userRole === "super_admin" && !selectedCompanyId) { setError("Please select a company"); return }
    if (!formData.supplierId) { setError("Please select a supplier"); return }
    const completedItems = poItems.filter((i) => (i.itemId || "").trim())
    if (completedItems.length === 0) { setError("Please add at least one item"); return }
    const missingQtyOrRate = completedItems.find((i) => i.qty <= 0 || i.rate <= 0)
    if (missingQtyOrRate) { setError("Quantity and rate are required for every selected item"); return }
    const validItems = completedItems.map(normForApi)
    const ta = validItems.reduce((s, i) => s + toNum(i.amount), 0)
    const da = (ta * formData.discountPercent) / 100
    const st = validItems.reduce((s, i) => s + toNum(i.total), 0)
    const na = st - da + toNum(formData.otherCharges)
    setIsUpdating(true)
    try {
      const token = sessionStorage.getItem("authToken") || ""
      const result = await purchaseOrderAPI.update(poId, {
        ...formData, companyId: selectedCompanyId || sessionStorage.getItem("companyId") || "",
        discountAmount: da, totalAmount: ta,
        sgst: validItems.reduce((s, i) => s + toNum(i.sgstAmount), 0),
        cgst: validItems.reduce((s, i) => s + toNum(i.cgstAmount), 0),
        igst: validItems.reduce((s, i) => s + toNum(i.igstAmount), 0),
        netAmount: na, items: validItems,
      }, token)
      if (result.success) { setSuccess(true); setTimeout(() => router.push("/purchase-orders/list"), 1500) }
      else setError(result.message || "Failed to update purchase order")
    } catch { setError("Failed to update purchase order") }
    finally { setIsUpdating(false) }
  }

  if (!canEdit("suppliers")) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full"><CardContent className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-center mb-6">You don't have permission to edit purchase orders.</p>
        <Link href="/purchase-orders/list"><Button>View Orders</Button></Link>
      </CardContent></Card>
    </div>
  )

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" /><p className="text-muted-foreground">Loading purchase order...</p></div>
    </div>
  )

  const cancelledItemsCount = poItems.filter((i) => i.cancelRemark).length

  return (
    <div className="py-8 px-4">
      <div className="w-full">
        <Button onClick={() => router.push("/purchase-orders/list")} className="mb-4 bg-red-700 hover:bg-red-800 text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0"><ShoppingCart className="h-6 w-6 text-white" /></div>
              <div><CardTitle className="text-2xl">Edit Purchase Order</CardTitle><CardDescription>Update purchase order details</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-6">
              {success && <Alert className="border-green-500 bg-green-50"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800">Purchase Order updated successfully! Redirecting...</AlertDescription></Alert>}
              {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

              {userRole === "super_admin" && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg border-b pb-2">Company</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Select Company <span className="text-destructive">*</span></Label>
                      <Select value={selectedCompanyId} onValueChange={handleCompanyChange}>
                        <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>{companies.map((c) => <SelectItem key={c.id} value={sid(c.id)}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Order Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Supplier / Party <span className="text-destructive">*</span></Label>
                    <SearchableSupplierSelect id="supplierId" value={formData.supplierId} suppliers={suppliers} onValueChange={handleSupplierChange} />
                    {formData.supplierId && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p>Tax mode:{" "}
                          <span className={`font-semibold ${isGujaratSupplier ? "text-blue-600" : "text-orange-600"}`}>{supplierTaxContext.taxModeLabel}</span>
                        </p>
                        <p>
                          Supplier state: <span className="font-medium">{supplierTaxContext.selectedStateName || "-"}</span>
                          {supplierTaxContext.selectedStateCode ? ` (${supplierTaxContext.selectedStateCode})` : ""}
                          {supplierTaxContext.gstStateCode ? ` | GST code: ${supplierTaxContext.gstStateCode} (${supplierTaxContext.gstStateName})` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>PO Date <span className="text-destructive">*</span></Label>
                    <Input type="date" className="h-10 w-full" value={formData.poDate} onChange={(e) => handleChange("poDate", e.target.value)} required />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">Items</h3>
                    {cancelledItemsCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                        <XCircle className="h-3 w-3" />
                        {cancelledItemsCount} item{cancelledItemsCount !== 1 ? "s" : ""} adjusted
                      </span>
                    )}
                  </div>
                  <Button type="button" size="sm" onClick={addItem} className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent">
                    <Plus className="h-4 w-4 mr-1" />Add Item
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pb-1">
                  <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                  To cancel/adjust qty, click the <span className="font-semibold text-foreground px-1">Qty</span> value or the <span className="font-semibold text-foreground px-1">✕ icon</span> in the Action column.
                </p>

                {duplicateWarning && <Alert variant="destructive" className="py-2"><AlertCircle className="h-4 w-4" /><AlertDescription>{duplicateWarning}</AlertDescription></Alert>}

                <style>{`
                  .no-spinner::-webkit-outer-spin-button,.no-spinner::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
                  .no-spinner[type=number]{-moz-appearance:textfield}
                  .po-table-edit{border-collapse:collapse;width:100%;font-size:0.75rem}
                  .po-table-edit th{border:1px solid rgba(255,255,255,0.25);padding:8px 10px;font-size:0.72rem;font-weight:600;white-space:nowrap;background-color:#b91c1c;color:white}
                  .po-table-edit td{border:1px solid #d1d5db;padding:4px 6px;vertical-align:middle}
                  .po-table-edit tbody tr:hover td{background-color:rgba(0,0,0,0.02)}
                  .po-table-edit tbody tr.over-limit td{background-color:rgba(254,226,226,0.5)}
                  .po-table-edit input[type=number]:focus{background-color:rgba(0,0,0,0.03);outline:none}
                  .qty-clickable:hover{background-color:rgba(185,28,28,0.06)!important}
                `}</style>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="po-table-edit">
                    <thead>
                      <tr>
                        <th style={{ width: "50px" }}>#</th>
                        <th style={{ width: "150px", textAlign: "left" }}>Brand</th>
                        <th style={{ width: "190px", textAlign: "left" }}>Item *</th>
                        <th style={{ width: "150px", textAlign: "left" }}>Variant</th>
                        <th style={{ width: "170px", textAlign: "left" }}>Remarks</th>
                        <th style={{ width: "72px", textAlign: "center" }}>GST %</th>
                        <th style={{ width: "72px", textAlign: "center" }}>Qty *</th>
                        <th style={{ width: "100px", textAlign: "center" }}>Rate *</th>
                        <th style={{ width: "100px", textAlign: "center" }}>Amount</th>
                        {isGujaratSupplier ? (
                          <><th style={{ width: "90px", textAlign: "center" }}>CGST</th><th style={{ width: "90px", textAlign: "center" }}>SGST</th></>
                        ) : <th style={{ width: "90px", textAlign: "center" }}>IGST</th>}
                        <th style={{ width: "72px", textAlign: "center" }}>Margin%</th>
                        <th style={{ width: "72px", textAlign: "center" }}>Inc.%</th>
                        <th style={{ width: "105px", textAlign: "center" }}>Total</th>
                        <th style={{ width: "65px", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poItems.map((item, index) => (
                        <EditPOItemRow
                          key={item.id} item={item} index={index}
                          brandOptions={brandOptions} itemOptions={itemOptions} allItems={items}
                          selectedLineKeys={selectedLineKeys}
                          isGujaratSupplier={isGujaratSupplier} allPoItems={poItems}
                          isFirst={index === 0} isLast={index === poItems.length - 1} isSingle={poItems.length === 1}
                          onUpdate={updateItem} onRemove={removeItem}
                          onOpenCancelModal={handleOpenCancelModal}
                          onMove={moveItem}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold border-b pb-2">Adjustments</h3>
                  <div className="space-y-3">
                    <div className="space-y-2"><Label>Payment Terms</Label><Input value={formData.paymentTerms} onChange={(e) => handleChange("paymentTerms", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Delivery Schedule</Label><Input value={formData.deliverySchedule} onChange={(e) => handleChange("deliverySchedule", e.target.value)} /></div>
                    <div className="space-y-2"><Label>Transportation</Label><Input value={formData.transportation} onChange={(e) => handleChange("transportation", e.target.value)} /></div>
                  </div>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 space-y-2.5 border border-border/40">
                  <SRow label="Qty Total" value={totalQty.toString()} />
                  <SRow label="Taxable Amount" value={`₹ ${fmt(totalTaxable)}`} />
                  <div className="flex justify-between items-center text-sm gap-2">
                    <span className="text-muted-foreground shrink-0">Discount %</span>
                    <div className="flex items-center gap-2 ml-auto">
                      <Input type="number" className="h-6 w-14 text-xs text-right no-spinner border-border/60 px-1"
                        value={formData.discountPercent || ""} min={0} max={100}
                        onChange={(e) => handleChange("discountPercent", parseFloat(e.target.value) || 0)} />
                      <span className="font-medium text-red-600 whitespace-nowrap text-xs">- ₹ {fmt(discountAmt)}</span>
                    </div>
                  </div>
                  {isGujaratSupplier ? (
                    <><SRow label="CGST" value={`₹ ${fmt(totalCGST)}`} /><SRow label="SGST" value={`₹ ${fmt(totalSGST)}`} /></>
                  ) : <SRow label="IGST" value={`₹ ${fmt(totalIGST)}`} />}
                  <div className="flex justify-between items-center text-sm gap-2">
                    <span className="text-muted-foreground shrink-0">Other Charges ₹</span>
                    <Input type="number" className="h-6 w-24 text-xs text-right no-spinner border-border/60 px-1 ml-auto"
                      value={formData.otherCharges || ""} min={0} onChange={(e) => handleChange("otherCharges", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="flex justify-between items-center text-base font-bold border-t pt-2 mt-1">
                    <span>Net Amount</span><span className="text-primary">₹ {fmt(netAmount)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Remarks</h3>
                <div className="space-y-2"><Label>Remarks</Label><Textarea value={formData.remarks} onChange={(e) => handleChange("remarks", e.target.value)} rows={2} /></div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" className="flex-1 bg-gradient-to-r from-accent to-accent-secondary" disabled={isUpdating || success}>
                  {isUpdating ? "Updating..." : success ? "Updated!" : "Update Purchase Order"}
                </Button>
                <Link href="/purchase-orders/list" className="flex-1">
                  <Button type="button" variant="outline" className="w-full bg-transparent" disabled={isUpdating}>Cancel</Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      <StockWarningModal warning={stockWarning} onClose={() => setStockWarning(null)} />
      <CancelQtyModal state={cancelQtyState} onClose={() => setCancelQtyState(null)} onConfirm={handleCancelQtyConfirm} />
    </div>
  )
}

export default function PurchaseOrderEditPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" /><p className="text-muted-foreground">Loading...</p></div>
          </div>
        }>
          <PurchaseOrderEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
