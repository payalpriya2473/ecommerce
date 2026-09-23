"use client";

import type React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ShoppingCart, AlertCircle, Plus, Trash2, ArrowLeft, ChevronUp, ChevronDown, AlertTriangle } from "lucide-react";
import { purchaseOrderAPI, supplierAPI, brandAPI, itemAPI, itemGroupAPI } from "@/lib/api";
import Link from "next/link";
import { SearchableSupplierSelect } from "@/components/searchable-supplier-select";
import { TableSelect, type TableSelectOption } from "@/components/table-select";
import { getSupplierTaxContext } from "@/lib/gst-utils";
import {
  findItemVariant,
  getItemVariantLineKey,
  getItemVariants,
  hasItemVariants,
  normalizeVariantLabel,
  sid,
} from "@/lib/item-variant-utils";

interface POItem {
  id: string; itemId?: string; brandId?: string; brandName: string; itemName: string;
  variantId?: string; variant?: string;
  uom: string; hsnCode: string; gstRate: number; qty: number; rate: number; amount: number;
  cgstPercent: number; cgstAmount: number; sgstPercent: number; sgstAmount: number;
  igstPercent: number; igstAmount: number; total: number; marginPercent: number; incPercent: number;
  remarks: string; itemGroupId?: string; itemGroupName?: string;
  maxStock?: number; currentStock?: number; pendingPOQty?: number;
}

interface StockWarning {
  itemRowId: string; itemName: string; groupName: string;
  maxStock: number; currentStock: number; pendingPOQty: number;
  remainingQty: number; enteredQty: number;
}

const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

const emptyItem = (): POItem => ({
  id: genId(), itemId: "", brandId: "", brandName: "", itemName: "",
  variantId: "", variant: "",
  uom: "", hsnCode: "", gstRate: 0, qty: 0, rate: 0, amount: 0,
  cgstPercent: 0, cgstAmount: 0, sgstPercent: 0, sgstAmount: 0,
  igstPercent: 0, igstAmount: 0, total: 0, marginPercent: 0, incPercent: 0,
  remarks: "", itemGroupId: "", itemGroupName: "", maxStock: 0, currentStock: 0, pendingPOQty: 0,
});

const computeFromInclusiveRate = (rate: number, qty: number, gst: number, isGuj: boolean) => {
  const total = rate * qty; const div = 1 + gst / 100; const amount = total / div;
  const cp = isGuj ? gst / 2 : 0; const sp = isGuj ? gst / 2 : 0; const ip = isGuj ? 0 : gst;
  return { amount, total, cgstPercent: cp, cgstAmount: amount * cp / 100, sgstPercent: sp, sgstAmount: amount * sp / 100, igstPercent: ip, igstAmount: amount * ip / 100 };
};

const computeFromTotal = (total: number, qty: number, gst: number, isGuj: boolean) => {
  const div = 1 + gst / 100; const amount = total / div; const rate = qty > 0 ? total / qty : 0;
  const cp = isGuj ? gst / 2 : 0; const sp = isGuj ? gst / 2 : 0; const ip = isGuj ? 0 : gst;
  return { amount, rate, total, cgstPercent: cp, cgstAmount: amount * cp / 100, sgstPercent: sp, sgstAmount: amount * sp / 100, igstPercent: ip, igstAmount: amount * ip / 100 };
};

const toNum = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown) => toNum(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normForApi = (item: POItem) => {
  const gr = toNum(item.gstRate);
  return {
    itemId: item.itemId || undefined, brandId: item.brandId || undefined,
    variantId: item.variantId || undefined, variant: normalizeVariantLabel(item.variant) || undefined,
    qty: toNum(item.qty), rate: toNum(item.rate), amount: toNum(item.amount),
    marginPercent: toNum(item.marginPercent), incPercent: toNum(item.incPercent),
    cgstPercent: toNum(item.cgstPercent), cgstAmount: toNum(item.cgstAmount),
    sgstPercent: toNum(item.sgstPercent), sgstAmount: toNum(item.sgstAmount),
    igstPercent: toNum(item.igstPercent), igstAmount: toNum(item.igstAmount),
    total: toNum(item.total), gstRate: gr, gstPercent: gr, remarks: item.remarks || "",
    itemGroupName: String(item.itemGroupName || ""), maxStock: Number(item.maxStock ?? 0),
    currentStock: Number((item as any).openingStock ?? item.currentStock ?? 0),
    pendingPOQty: Number(item.pendingPOQty ?? 0),
  };
};

function StockWarningModal({ warning, onClose }: { warning: StockWarning | null; onClose: () => void }) {
  if (!warning) return null;
  return (
    <Dialog open={!!warning} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0"><AlertTriangle className="h-5 w-5 text-amber-600" /></div>
            <span className="text-amber-700">Stock Limit Exceeded</span>
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-foreground pt-1">
              Quantity exceeds allowed limit.{" "}
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
  );
}

function SRow({ label, value, colored }: { label: string; value: string; colored?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${colored ? "text-red-600" : ""}`}>{value}</span>
    </div>
  );
}

interface POItemRowProps {
  item: POItem; index: number;
  brandOptions: TableSelectOption[]; itemOptions: TableSelectOption[];
  allItems: any[]; selectedLineKeys: string[];
  isGujaratSupplier: boolean; isFirst: boolean; isLast: boolean; isSingle: boolean;
  onUpdate: (id: string, field: any, value: any) => void;
  onRemove: (id: string) => void; onAddRow: () => void;
  onMove: (id: string, dir: "up" | "down") => void;
}

function POItemRow({
  item, index, brandOptions, itemOptions, allItems, selectedLineKeys,
  isGujaratSupplier, isFirst, isLast, isSingle,
  onUpdate, onRemove, onAddRow, onMove,
}: POItemRowProps) {
  const [totalInput, setTotalInput] = useState(() => item.total ? item.total.toFixed(2) : "");
  useEffect(() => { setTotalInput(item.total ? item.total.toFixed(2) : ""); }, [item.total]);

  const selectedMasterItem = useMemo(
    () => allItems.find((entry) => sid(entry.id) === sid(item.itemId)),
    [allItems, item.itemId]
  );

  const filteredItemOptions = useMemo(() => {
    return itemOptions.filter((opt) => {
      const master = allItems.find((i) => sid(i.id) === sid(opt.id));
      if (item.brandId && master && sid(master.brandId) !== sid(item.brandId)) return false;
      if (sid(opt.id) !== sid(item.itemId) && !hasItemVariants(master)) {
        const itemKey = getItemVariantLineKey(opt.id);
        if (selectedLineKeys.includes(itemKey)) return false;
      }
      return true;
    });
  }, [itemOptions, allItems, item.brandId, item.itemId, selectedLineKeys]);

  const variantOptions = useMemo(() => {
    const variants = getItemVariants(selectedMasterItem);
    return variants
      .filter((variant) => {
        const lineKey = getItemVariantLineKey(item.itemId, variant.id, variant.variant);
        const currentKey = getItemVariantLineKey(item.itemId, item.variantId, item.variant);
        return lineKey === currentKey || !selectedLineKeys.includes(lineKey);
      })
      .map((variant) => ({
        id: sid(variant.id || variant.variant),
        label: normalizeVariantLabel(variant.variant),
        sublabel: `NLC: ${fmt(variant.nlc ?? 0)}`,
      }));
  }, [selectedMasterItem, item.itemId, item.variantId, item.variant, selectedLineKeys]);

  const hasLimit = !!(item.itemGroupId && item.maxStock && item.maxStock > 0);
  const remainingQty = hasLimit ? Math.max(0, (item.maxStock ?? 0) - (item.currentStock ?? 0) - (item.pendingPOQty ?? 0)) : null;
  const isOverLimit = remainingQty !== null && item.qty > remainingQty;

  const numInputStyle: React.CSSProperties = {
    width: "100%", height: "28px", border: "none", background: "transparent",
    outline: "none", fontSize: "0.75rem", textAlign: "center", padding: "0 4px",
    appearance: "textfield" as any,
  };

  return (
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
      <td style={{ padding: "0" }}>
        <input type="number" className="no-spinner" value={item.qty || ""} min={0}
          onChange={(e) => onUpdate(item.id, "qty", parseFloat(e.target.value) || 0)}
          style={{ ...numInputStyle, color: isOverLimit ? "#dc2626" : undefined, fontWeight: isOverLimit ? 600 : undefined }} />
      </td>
      <td style={{ padding: "0" }}>
        <input type="number" className="no-spinner" value={item.rate || ""} min={0}
          onChange={(e) => onUpdate(item.id, "rate", parseFloat(e.target.value) || 0)}
          style={numInputStyle} />
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
          onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onUpdate(item.id, "totalInput", v); }}
          style={{ ...numInputStyle, fontWeight: 600 }} />
      </td>
      <td style={{ textAlign: "center", padding: "4px 2px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "2px" }}>
          <button type="button" onClick={onAddRow}
            style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: "none", cursor: "pointer", color: "#dc2626" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
            <Plus style={{ width: "13px", height: "13px" }} />
          </button>
          <button type="button" disabled={isSingle} onClick={() => onRemove(item.id)}
            style={{ height: "26px", width: "26px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", border: "none", background: "none", cursor: isSingle ? "not-allowed" : "pointer", color: "#dc2626", opacity: isSingle ? 0.3 : 1 }}
            onMouseEnter={e => { if (!isSingle) e.currentTarget.style.backgroundColor = "#fef2f2"; }}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
            <Trash2 style={{ width: "13px", height: "13px" }} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function PurchaseOrderRegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [itemGroups, setItemGroups] = useState<any[]>([]);
  const [pendingPOQtyByGroup, setPendingPOQtyByGroup] = useState<Record<string, number>>({});
  const [nextPONumber, setNextPONumber] = useState("PO-0001");
  const [poItems, setPOItems] = useState<POItem[]>([emptyItem()]);
  const [isGujaratSupplier, setIsGujaratSupplier] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [stockWarning, setStockWarning] = useState<StockWarning | null>(null);
  const [formData, setFormData] = useState({
    supplierId: "", poDate: new Date().toISOString().split("T")[0],
    paymentTerms: "", deliverySchedule: "", transportation: "",
    remarks: "", discountPercent: 0, otherCharges: 0,
  });

  const totalTaxable = poItems.reduce((s, i) => s + i.amount, 0);
  const discountAmt = (totalTaxable * formData.discountPercent) / 100;
  const totalCGST = poItems.reduce((s, i) => s + i.cgstAmount, 0);
  const totalSGST = poItems.reduce((s, i) => s + i.sgstAmount, 0);
  const totalIGST = poItems.reduce((s, i) => s + i.igstAmount, 0);
  const totalQty = poItems.reduce((s, i) => s + i.qty, 0);
  const subTotal = poItems.reduce((s, i) => s + i.total, 0);
  const netAmount = subTotal - discountAmt + Number(formData.otherCharges);

  useEffect(() => { loadMasterData(); }, []);

  const loadMasterData = async () => {
    const token = sessionStorage.getItem("authToken") || "";
    const [bR, iR, sR, gR] = await Promise.all([
      brandAPI.getAll(token), itemAPI.getAll(token),
      supplierAPI.getAll(token), itemGroupAPI.getAll(token),
    ]);
    if (bR.success) setBrands(bR.data);
    if (iR.success) setItems(iR.data);
    if (sR.success) setSuppliers(sR.data);
    if (gR.success) setItemGroups(gR.data);
    try {
      const pR = await purchaseOrderAPI.getPendingQtyByGroup(token);
      if (pR?.success) setPendingPOQtyByGroup(pR.data || {});
    } catch { setPendingPOQtyByGroup({}); }
  };

  const brandOptions: TableSelectOption[] = useMemo(
    () => brands.map((b) => ({ id: sid(b.id), label: b.name })), [brands]
  );
  const itemOptions: TableSelectOption[] = useMemo(
    () => items.map((i) => ({ id: sid(i.id), label: i.itemName, sublabel: i.itemGroupName || "" })), [items]
  );
  const selectedLineKeys = useMemo(
    () => poItems.map((i) => getItemVariantLineKey(i.itemId, i.variantId, i.variant)).filter(Boolean),
    [poItems]
  );

  const checkStockLimit = useCallback((
    rowId: string, masterItem: any, group: any, enteredQty: number, currentPoItems: POItem[],
  ): StockWarning | null => {
    if (!group || !group.maxQty || Number(group.maxQty) <= 0) return null;
    const maxStock = Number(group.maxQty);
    const currentStock = Number(masterItem?.openingStock ?? 0);
    const pendingOther = Number(pendingPOQtyByGroup[sid(group.id)] ?? 0);
    const qtyHere = currentPoItems.filter((r) => r.id !== rowId && sid(r.itemGroupId) === sid(group.id)).reduce((s, r) => s + r.qty, 0);
    const total = pendingOther + qtyHere;
    const remaining = maxStock - (currentStock + total);
    if (enteredQty > remaining) {
      return { itemRowId: rowId, itemName: masterItem?.itemName || "", groupName: group.name || group.groupName || "",
        maxStock, currentStock, pendingPOQty: total, remainingQty: Math.max(0, remaining), enteredQty };
    }
    return null;
  }, [pendingPOQtyByGroup]);

  const handleChange = (field: string, value: any) => { setFormData((p) => ({ ...p, [field]: value })); setError(""); };

  const handleSupplierChange = (supplierId: string) => {
    handleChange("supplierId", supplierId);
    const s = suppliers.find((s) => s.id === supplierId);
    const isGuj = getSupplierTaxContext(s).isIntraState;
    setIsGujaratSupplier(isGuj);
    setPOItems((prev) => prev.map((item) => {
      if (item.gstRate === 0 || item.rate === 0) return item;
      return { ...item, ...computeFromInclusiveRate(item.rate, item.qty, item.gstRate, isGuj) };
    }));
  };

  const applyItemFields = (base: POItem, fi: any, isGuj: boolean): POItem => {
    const gstRate = fi.gst || fi.gstRate || fi.gstPercent || 0;
    const rate = fi.nlc || fi.purchaseRate || fi.rate || 0;
    const group = itemGroups.find((g) => sid(g.id) === sid(fi.itemGroupId));
    return {
      ...base, itemId: sid(fi.id), itemName: fi.itemName, uom: fi.uom || "", hsnCode: fi.hsnCode || "",
      variantId: "", variant: "",
      gstRate, rate, marginPercent: fi.margin || fi.marginPercent || 0, incPercent: fi.incentive || fi.incPercent || 0,
      itemGroupId: sid(fi.itemGroupId), itemGroupName: group?.name || fi.itemGroupName || "",
      maxStock: Number(group?.maxQty ?? 0), currentStock: Number(fi.openingStock ?? 0),
      pendingPOQty: Number(pendingPOQtyByGroup[sid(fi.itemGroupId)] ?? 0),
      ...computeFromInclusiveRate(rate, base.qty, gstRate, isGuj),
    };
  };

  const applyVariantFields = (base: POItem, fi: any, variantLike: any, isGuj: boolean): POItem => {
    const variant = findItemVariant(fi, variantLike?.id, variantLike?.variant);
    if (!variant) return base;
    const rate = Number(variant.nlc ?? fi.nlc ?? fi.purchaseRate ?? fi.rate ?? 0);
    const gstRate = Number(fi.gst || fi.gstRate || fi.gstPercent || base.gstRate || 0);
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
    };
  };

  const updateItem = useCallback((id: string, field: any, value: any) => {
    setPOItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      let u = { ...item };
      if (field === "brandId") {
        const brand = brands.find((b) => sid(b.id) === sid(value));
        u.brandId = sid(value); u.brandName = brand?.name || ""; u.itemId = ""; u.itemName = ""; u.variantId = ""; u.variant = "";
        return u;
      }
      if (field === "itemId") {
        const fi = items.find((i) => sid(i.id) === sid(value));
        const alreadyUsed = !hasItemVariants(fi) && prev.some((r) => r.id !== id && sid(r.itemId) === sid(value));
        if (alreadyUsed) {
          const name = fi?.itemName || "This item";
          setDuplicateWarning(`"${name}" is already added.`); setTimeout(() => setDuplicateWarning(""), 4000); return item;
        }
        setDuplicateWarning("");
        if (fi) {
          u = applyItemFields(u, fi, isGujaratSupplier);
          const variants = getItemVariants(fi);
          if (variants.length === 1) {
            u = applyVariantFields(u, fi, variants[0], isGujaratSupplier);
          }
          if (fi.brandId && !u.brandId) {
            const brand = brands.find((b) => sid(b.id) === sid(fi.brandId));
            if (brand) { u.brandId = sid(fi.brandId); u.brandName = brand.name; }
          }
          const group = itemGroups.find((g) => sid(g.id) === sid(fi.itemGroupId));
          const w = checkStockLimit(id, fi, group, u.qty, prev);
          if (w) setTimeout(() => setStockWarning(w), 50);
        }
        return u;
      }
      if (field === "variantId") {
        const fi = items.find((i) => sid(i.id) === sid(u.itemId));
        const variant = findItemVariant(fi, value);
        const nextKey = getItemVariantLineKey(u.itemId, variant?.id, variant?.variant);
        const alreadyUsed = nextKey && prev.some((r) => r.id !== id && getItemVariantLineKey(r.itemId, r.variantId, r.variant) === nextKey);
        if (alreadyUsed) {
          const label = normalizeVariantLabel(variant?.variant) || "This variant";
          setDuplicateWarning(`"${u.itemName} - ${label}" is already added.`); setTimeout(() => setDuplicateWarning(""), 4000); return item;
        }
        setDuplicateWarning("");
        if (!fi || !variant) return { ...u, variantId: sid(value), variant: "" };
        return applyVariantFields(u, fi, variant, isGujaratSupplier);
      }
      if (field === "gstRate") return item;
      if (field === "qty") {
        u.qty = Number(value);
        if (u.rate > 0) u = { ...u, ...computeFromInclusiveRate(u.rate, u.qty, u.gstRate, isGujaratSupplier) };
        if (u.itemId) {
          const fi = items.find((i) => sid(i.id) === sid(u.itemId));
          const group = itemGroups.find((g) => sid(g.id) === sid(u.itemGroupId));
          const w = checkStockLimit(id, fi, group, u.qty, prev);
          if (w) setTimeout(() => setStockWarning(w), 50);
        }
        return u;
      }
      if (field === "rate") { u.rate = Number(value); return { ...u, ...computeFromInclusiveRate(u.rate, u.qty, u.gstRate, isGujaratSupplier) }; }
      if (field === "totalInput") return { ...u, ...computeFromTotal(Number(value), u.qty, u.gstRate, isGujaratSupplier) };
      if (field === "remarks") { u.remarks = value; return u; }
      (u as any)[field] = value; return u;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brands, items, itemGroups, isGujaratSupplier, checkStockLimit]);

  const addItem = () => setPOItems((p) => [...p, emptyItem()]);
  const removeItem = (id: string) => { if (poItems.length === 1) return; setPOItems((p) => p.filter((i) => i.id !== id)); };
  const moveItem = (id: string, dir: "up" | "down") => {
    setPOItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (dir === "up" && idx === 0) return prev; if (dir === "down" && idx === prev.length - 1) return prev;
      const next = [...prev]; const swap = dir === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]]; return next;
    });
  };

  const selectedSupplier = suppliers.find((s) => s.id === formData.supplierId);
  const supplierTaxContext = getSupplierTaxContext(selectedSupplier);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === "Enter") { const t = e.target as HTMLElement; if (t.tagName !== "TEXTAREA" && t.tagName !== "INPUT") e.preventDefault(); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    if (!formData.supplierId) { setError("Please select a supplier"); return; }
    const completedItems = poItems.filter((i) => (i.itemId || "").trim());
    if (completedItems.length === 0) { setError("Please add at least one item"); return; }
    const missingQtyOrRate = completedItems.find((i) => i.qty <= 0 || i.rate <= 0);
    if (missingQtyOrRate) { setError("Quantity and rate are required for every selected item"); return; }
    const validItems = completedItems.map(normForApi);
    const ta = validItems.reduce((s, i) => s + toNum(i.amount), 0);
    const da = (ta * formData.discountPercent) / 100;
    const st = validItems.reduce((s, i) => s + toNum(i.total), 0);
    const na = st - da + toNum(formData.otherCharges);
    setIsLoading(true);
    try {
      const token = sessionStorage.getItem("authToken") || "";
      const result = await purchaseOrderAPI.create({
        ...formData,
        discountAmount: da, totalAmount: ta,
        sgst: validItems.reduce((s, i) => s + toNum(i.sgstAmount), 0),
        cgst: validItems.reduce((s, i) => s + toNum(i.cgstAmount), 0),
        igst: validItems.reduce((s, i) => s + toNum(i.igstAmount), 0),
        netAmount: na, items: validItems,
      }, token);
      if (result.success) { router.push("/purchase-orders/list"); }
      else setError(result.message || "Failed to create purchase order");
    } catch { setError("Failed to create purchase order."); }
    finally { setIsLoading(false); }
  };

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">
            <Button variant="ghost" onClick={() => router.push("/purchase-orders/list")} className="mb-4 bg-red-700 text-white hover:bg-red-800">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">New Purchase Order</CardTitle>
                    <CardDescription>Create a purchase order for your supplier</CardDescription>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-muted-foreground">PO Number</p>
                    <p className="text-xl font-bold text-primary">{nextPONumber}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-6">

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">Order Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Supplier / Party <span className="text-destructive">*</span></Label>
                        <SearchableSupplierSelect id="supplierId" value={formData.supplierId} suppliers={suppliers} onValueChange={handleSupplierChange} />
                        {formData.supplierId && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>Tax mode:{" "}
                              <span className={`font-semibold ${isGujaratSupplier ? "text-blue-600" : "text-orange-600"}`}>
                                {supplierTaxContext.taxModeLabel}
                              </span>
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
                      <h3 className="font-semibold text-lg">Items</h3>
                      <Button type="button" size="sm" onClick={addItem}
                        className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent">
                        <Plus className="h-4 w-4 mr-1" />Add Item
                      </Button>
                    </div>
                    {duplicateWarning && (
                      <Alert variant="destructive" className="py-2"><AlertCircle className="h-4 w-4" /><AlertDescription>{duplicateWarning}</AlertDescription></Alert>
                    )}
                    <style>{`
                      .no-spinner::-webkit-outer-spin-button, .no-spinner::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                      .no-spinner[type=number] { -moz-appearance: textfield; }
                      .po-table { border-collapse: collapse; width: 100%; font-size: 0.75rem; }
                      .po-table th { border: 1px solid rgba(255,255,255,0.25); padding: 8px 10px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; background-color: #b91c1c; color: white; }
                      .po-table td { border: 1px solid #d1d5db; padding: 4px 6px; vertical-align: middle; }
                      .po-table tbody tr:hover td { background-color: rgba(0,0,0,0.02); }
                      .po-table tbody tr.over-limit td { background-color: rgba(254,226,226,0.5); }
                      .po-table input[type=number]:focus { background-color: rgba(0,0,0,0.03); outline: none; }
                    `}</style>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="po-table">
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
                            <POItemRow
                              key={item.id} item={item} index={index}
                              brandOptions={brandOptions} itemOptions={itemOptions} allItems={items}
                              selectedLineKeys={selectedLineKeys}
                              isGujaratSupplier={isGujaratSupplier}
                              isFirst={index === 0} isLast={index === poItems.length - 1} isSingle={poItems.length === 1}
                              onUpdate={updateItem} onRemove={removeItem} onAddRow={addItem} onMove={moveItem}
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
                      <SRow label="Qty Total" value={totalQty.toString()} colored />
                      <SRow label="Taxable Amount" value={`₹ ${fmt(totalTaxable)}`} colored />
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
                        <><SRow label="CGST" value={`₹ ${fmt(totalCGST)}`} colored /><SRow label="SGST" value={`₹ ${fmt(totalSGST)}`} colored /></>
                      ) : <SRow label="IGST" value={`₹ ${fmt(totalIGST)}`} colored />}
                      <div className="flex justify-between items-center text-sm gap-2">
                        <span className="text-muted-foreground shrink-0">Other Charges ₹</span>
                        <Input type="number" className="h-6 w-24 text-xs text-right no-spinner border-border/60 px-1 ml-auto"
                          value={formData.otherCharges || ""} min={0}
                          onChange={(e) => handleChange("otherCharges", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="flex justify-between items-center text-base font-bold border-t pt-2 mt-1">
                        <span>Net Amount</span><span className="text-primary">₹ {fmt(netAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg border-b pb-2">Remarks</h3>
                    <div className="space-y-2">
                      <Label>Remarks</Label>
                      <Textarea value={formData.remarks} onChange={(e) => handleChange("remarks", e.target.value)} rows={2} />
                    </div>
                  </div>

                  {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

                  <div className="flex gap-4 pt-4">
                    <Button type="submit" className="flex-1 bg-gradient-to-r from-accent to-accent-secondary" disabled={isLoading}>
                      {isLoading ? "Saving..." : "Save Purchase Order"}
                    </Button>
                    <Link href="/purchase-orders/list" className="flex-1">
                      <Button type="button" variant="outline" className="w-full bg-transparent">Cancel</Button>
                    </Link>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
        <StockWarningModal warning={stockWarning} onClose={() => setStockWarning(null)} />
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
