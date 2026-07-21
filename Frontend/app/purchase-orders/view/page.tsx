"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ShoppingCart, ArrowLeft, Edit, Package, CreditCard,
  AlertCircle, Calendar, User, MapPin, Settings2, MessageSquare
} from "lucide-react"
import Link from "next/link"
import { purchaseOrderAPI } from "@/lib/api"
import { PermissionGate } from "@/components/PermissionGate"

interface POItem {
  id: string
  brandName?: string
  itemName: string
  variant?: string
  uom?: string
  hsnCode?: string
  qty: number
  rate: number
  amount: number
  gstRate: number
  marginPercent: number
  incPercent: number
  sgstPercent: number
  sgstAmount: number
  cgstPercent: number
  cgstAmount: number
  igstPercent: number
  igstAmount: number
  total: number
  remarks?: string
  cancelRemark?: string
  itemGroupName?: string
  maxStock?: number
}

interface PurchaseOrder {
  id: string
  poNumber: string
  supplierId: string
  supplierName: string
  supplierCity?: string
  supplierState?: string
  supplierGST?: string
  poDate: string
  paymentTerms?: string
  deliverySchedule?: string
  transportation?: string
  remarks?: string
  discountPercent: number
  discountAmount: number
  totalAmount: number
  sgst: number
  cgst: number
  igst: number
  otherCharges: number
  netAmount: number
  items: POItem[]
  createdAt: string
}

const toNumber = (value: unknown) => Number(value) || 0

const pickNumber = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = obj[key]
    if (value !== undefined && value !== null && value !== "") {
      const num = Number(value)
      if (!Number.isNaN(num)) return num
    }
  }
  return 0
}

const resolveGstRate = (item: Record<string, unknown>) => {
  const direct = pickNumber(item, ["gstRate", "gstPercent", "gst", "aTaxPercent"])
  if (direct > 0) return direct

  const igstPercent = pickNumber(item, ["igstPercent", "igst_percentage"])
  const sgstPercent = pickNumber(item, ["sgstPercent", "sgst_percentage"])
  const cgstPercent = pickNumber(item, ["cgstPercent", "cgst_percentage"])
  if (igstPercent > 0 || sgstPercent > 0 || cgstPercent > 0) {
    return igstPercent > 0 ? igstPercent : sgstPercent + cgstPercent
  }

  const amount = pickNumber(item, ["amount", "taxableAmount", "taxable_amount"])
  const cgstAmount = pickNumber(item, ["cgstAmount", "cgst", "cgst_amount"])
  const sgstAmount = pickNumber(item, ["sgstAmount", "sgst", "sgst_amount"])
  const igstAmount = pickNumber(item, ["igstAmount", "igst", "igst_amount"])
  if (amount > 0) {
    if (igstAmount > 0) return (igstAmount * 100) / amount
    if (cgstAmount > 0 || sgstAmount > 0) return ((cgstAmount + sgstAmount) * 100) / amount
  }
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

const computeTaxFromRate = (
  amount: number, gstRate: number,
  cgstPercentRaw: number, sgstPercentRaw: number, igstPercentRaw: number
) => {
  if (igstPercentRaw > 0) {
    return { cgstPercent: 0, sgstPercent: 0, igstPercent: igstPercentRaw, cgstAmount: 0, sgstAmount: 0, igstAmount: (amount * igstPercentRaw) / 100 }
  }
  if (cgstPercentRaw > 0 || sgstPercentRaw > 0) {
    const cgstPercent = cgstPercentRaw || sgstPercentRaw
    const sgstPercent = sgstPercentRaw || cgstPercentRaw
    return { cgstPercent, sgstPercent, igstPercent: 0, cgstAmount: (amount * cgstPercent) / 100, sgstAmount: (amount * sgstPercent) / 100, igstAmount: 0 }
  }
  if (gstRate > 0) {
    const half = gstRate / 2
    return { cgstPercent: half, sgstPercent: half, igstPercent: 0, cgstAmount: (amount * half) / 100, sgstAmount: (amount * half) / 100, igstAmount: 0 }
  }
  return { cgstPercent: 0, sgstPercent: 0, igstPercent: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 }
}

const normalizePOItem = (item: Record<string, unknown>): POItem => {
  const qty = pickNumber(item, ["qty", "quantity"])
  const rate = pickNumber(item, ["rate", "purchaseRate", "purchase_rate"])
  const amount = pickNumber(item, ["amount", "taxableAmount", "taxable_amount"]) || qty * rate
  const gstRate = resolveGstRate(item)

  const cgstPercentRaw = pickNumber(item, ["cgstPercent", "cgst_percentage"])
  const sgstPercentRaw = pickNumber(item, ["sgstPercent", "sgst_percentage"])
  const igstPercentRaw = pickNumber(item, ["igstPercent", "igst_percentage"])
  const cgstAmountRaw = pickNumber(item, ["cgstAmount", "cgst", "cgst_amount"])
  const sgstAmountRaw = pickNumber(item, ["sgstAmount", "sgst", "sgst_amount"])
  const igstAmountRaw = pickNumber(item, ["igstAmount", "igst", "igst_amount"])
  const derived = amount > 0
    ? computeTaxFromRate(amount, gstRate, cgstPercentRaw, sgstPercentRaw, igstPercentRaw)
    : { cgstPercent: 0, sgstPercent: 0, igstPercent: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0 }

  const cgstPercent = cgstPercentRaw > 0 ? cgstPercentRaw : derived.cgstPercent
  const sgstPercent = sgstPercentRaw > 0 ? sgstPercentRaw : derived.sgstPercent
  const igstPercent = igstPercentRaw > 0 ? igstPercentRaw : derived.igstPercent
  const cgstAmount = cgstAmountRaw > 0 ? cgstAmountRaw : (amount * cgstPercent) / 100
  const sgstAmount = sgstAmountRaw > 0 ? sgstAmountRaw : (amount * sgstPercent) / 100
  const igstAmount = igstAmountRaw > 0 ? igstAmountRaw : (amount * igstPercent) / 100
  const total = pickNumber(item, ["total", "lineTotal", "line_total"]) || amount + cgstAmount + sgstAmount + igstAmount

  const { baseRemarks, cancelRemark } = parseCancelRemark(String(item.remarks || ""))

  return {
    id: String(item.id || ""),
    brandName: String(item.brandName || item.brand || ""),
    itemName: String(item.itemName || item.name || ""),
    variant: String(item.variant || ""),
    uom: String(item.uom || ""),
    hsnCode: String(item.hsnCode || item.hsn || ""),
    qty, rate, amount, gstRate,
    marginPercent: pickNumber(item, ["marginPercent", "margin_percent"]),
    incPercent: pickNumber(item, ["incPercent", "inc_percent", "incentive"]),
    sgstPercent, sgstAmount, cgstPercent, cgstAmount, igstPercent, igstAmount, total,
    remarks: baseRemarks,
    cancelRemark,
    itemGroupName: String(item.itemGroupName || ""),
    maxStock: Number(item.maxStock ?? 0),
  }
}

function PurchaseOrderViewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const poId = searchParams.get("id") || ""

  const [po, setPO] = useState<PurchaseOrder | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => { if (poId) fetchPO() }, [poId])

  const fetchPO = async () => {
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const result = await purchaseOrderAPI.getById(token, poId)
      if (result.success) {
        const poData = result.data || {}
        const itemSource = Array.isArray(poData.items)
          ? poData.items
          : Array.isArray(poData.orderItems)
            ? poData.orderItems
            : Array.isArray(poData.purchaseOrderItems)
              ? poData.purchaseOrderItems
              : []
        const normalizedItems = Array.isArray(itemSource)
          ? itemSource.map((item: Record<string, unknown>) => normalizePOItem(item))
          : []
        setPO({ ...poData, items: normalizedItems })
      }
    } catch (err) { console.error("Error fetching PO:", err) }
    finally { setIsLoading(false) }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  }

  const fmt = (amount: number) =>
    `₹ ${(Number(amount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading purchase order...</p>
        </div>
      </div>
    )
  }

  if (!po) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Purchase order not found</p>
          <Link href="/purchase-orders/list"><Button className="mt-4">Back to Orders</Button></Link>
        </div>
      </div>
    )
  }

  const totalQty = po.items?.reduce((s, i) => s + Number(i.qty), 0) || 0
  const isGujarat = (po.cgst || 0) > 0
  const hasAdjustmentInfo = po.paymentTerms || po.deliverySchedule || po.transportation
  const cancelledItemsCount = po.items?.filter((i) => i.cancelRemark).length || 0

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6">
          <Button onClick={() => router.push("/purchase-orders/list")} className="mb-4 bg-red-700 hover:bg-red-800 text-white">
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Purchase Order Details</h1>
              <p className="text-muted-foreground mt-1">Complete information for {po.poNumber}</p>
            </div>
            <PermissionGate module="suppliers" action="update">
              <Link href={`/purchase-orders/edit?id=${po.id}`}>
                <Button className="bg-gradient-to-r from-red-700 to-red-800 hover:opacity-90">
                  <Edit className="h-4 w-4 mr-2" />Edit Order
                </Button>
              </Link>
            </PermissionGate>
          </div>
        </div>

        {/* PO Header Card */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="h-10 w-10 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">{po.poNumber}</h2>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Calendar className="h-4 w-4" />
                      <span>PO Date: {formatDate(po.poDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <User className="h-4 w-4" />
                      <span>Supplier: <strong>{po.supplierName}</strong></span>
                      {po.supplierCity && (
                        <span className="text-xs">({po.supplierCity}{po.supplierState ? `, ${po.supplierState}` : ""})</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Tax Mode:{" "}
                      <span className={`font-semibold ${isGujarat ? "text-blue-600" : "text-orange-600"}`}>
                        {isGujarat ? "SGST + CGST (Gujarat)" : "IGST (Inter-state)"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{fmt(po.netAmount)}</p>
                    <p className="text-xs text-muted-foreground">Net Amount</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-6">

          {/* Supplier Info */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Supplier Information</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier Name:</span>
                  <span className="font-medium">{po.supplierName || "—"}</span>
                </div>
                {po.supplierCity && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{po.supplierCity}{po.supplierState ? `, ${po.supplierState}` : ""}</span>
                  </div>
                )}
                {po.supplierGST && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST Number:</span>
                    <Badge variant="outline" className="font-mono text-xs">{po.supplierGST}</Badge>
                  </div>
                )}
                {po.remarks && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Remarks:</span>
                    <span className="font-medium text-right">{po.remarks}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Adjustments */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Adjustments</h3>
              </div>
              <div className="space-y-3 text-sm">
                {po.paymentTerms && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment Terms:</span>
                    <span className="font-medium">{po.paymentTerms}</span>
                  </div>
                )}
                {po.deliverySchedule && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Schedule:</span>
                    <span className="font-medium">{po.deliverySchedule}</span>
                  </div>
                )}
                {po.transportation && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transportation:</span>
                    <span className="font-medium">{po.transportation}</span>
                  </div>
                )}
                {!hasAdjustmentInfo && (
                  <p className="text-muted-foreground text-xs italic">No additional order information</p>
                )}
                <div className={`flex justify-between ${hasAdjustmentInfo ? "border-t pt-2 mt-1" : ""}`}>
                  <span className="text-muted-foreground">Discount ({po.discountPercent || 0}%):</span>
                  <span className="font-medium text-red-600">- {fmt(po.discountAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Other Charges:</span>
                  <span className="font-medium">{fmt(po.otherCharges)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items Table */}
        <Card className="border-border/50 shadow-sm mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-semibold">Items ({po.items?.length || 0})</h3>
              {cancelledItemsCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 ml-1">
                  <MessageSquare className="h-3 w-3" />
                  {cancelledItemsCount} item{cancelledItemsCount !== 1 ? "s" : ""} adjusted
                </span>
              )}
            </div>

            <style>{`
              .po-view-table { border-collapse: collapse; width: 100%; font-size: 0.75rem; }
              .po-view-table th { border: 1px solid rgba(255,255,255,0.25); padding: 8px 10px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; background-color: #b91c1c; color: white; }
              .po-view-table td { border: 1px solid #d1d5db; padding: 6px 10px; vertical-align: top; }
              .po-view-table td.item-name-cell, .po-view-table td.remarks-cell { white-space: normal; word-break: break-word; overflow-wrap: anywhere; line-height: 1.45; }
              .po-view-table td.compact-cell { white-space: nowrap; }
              .po-view-table tbody tr:hover td { background-color: rgba(0,0,0,0.02); }
              .po-view-table tbody tr.alt-row td { background-color: rgba(0,0,0,0.015); }
              .po-view-table tbody tr.alt-row:hover td { background-color: rgba(0,0,0,0.03); }
              .po-view-table tbody tr.cancel-note-row td { background-color: rgba(251,191,36,0.07); border-bottom: 1px solid #fde68a; padding: 3px 12px 5px 52px; }
            `}</style>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="po-view-table">
                <thead>
                  <tr>
                    <th style={{width:"40px", textAlign:"left"}}>#</th>
                    <th style={{width:"140px", textAlign:"left"}}>Brand</th>
                    <th style={{width:"220px", textAlign:"left"}}>Item Name</th>
                    <th style={{width:"150px", textAlign:"left"}}>Variant</th>
                    <th style={{width:"170px", textAlign:"left"}}>Remarks</th>
                    <th style={{width:"70px", textAlign:"center"}}>GST%</th>
                    <th style={{width:"60px", textAlign:"right"}}>Qty</th>
                    <th style={{width:"95px", textAlign:"right"}}>Rate</th>
                    <th style={{width:"95px", textAlign:"right"}}>Amount</th>
                    {isGujarat ? (
                      <>
                        <th style={{width:"95px", textAlign:"right"}}>CGST</th>
                        <th style={{width:"95px", textAlign:"right"}}>SGST</th>
                      </>
                    ) : (
                      <th style={{width:"95px", textAlign:"right"}}>IGST</th>
                    )}
                    <th style={{width:"90px", textAlign:"right"}}>Margin%</th>
                    <th style={{width:"90px", textAlign:"right"}}>Inc.%</th>
                    <th style={{width:"95px", textAlign:"right"}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.items || []).map((item, index) => {
                    const marginAmount = item.rate * item.marginPercent / 100
                    const incentiveAmount = marginAmount * item.incPercent / 100
                    return (
                      <>
                        <tr key={item.id} className={index % 2 !== 0 ? "alt-row" : ""}>
                          <td className="compact-cell" style={{color:"#6b7280"}}>{index + 1}</td>
                          <td>{item.brandName || "—"}</td>
                          <td className="item-name-cell" style={{fontWeight:500}}>{item.itemName}</td>
                          <td>{item.variant || "—"}</td>
                          <td className="remarks-cell">
                            {item.remarks && item.remarks.trim() !== "" ? (
                              <span style={{ display:"inline-block", backgroundColor:"rgba(0,0,0,0.05)", borderRadius:"4px", padding:"2px 6px", maxWidth:"100%", whiteSpace:"normal", wordBreak:"break-word", overflowWrap:"anywhere" }} title={item.remarks}>
                                {item.remarks}
                              </span>
                            ) : (
                              <span style={{color:"rgba(107,114,128,0.5)", fontStyle:"italic", fontSize:"0.68rem"}}>—</span>
                            )}
                          </td>
                          <td className="compact-cell" style={{textAlign:"center"}}>{Number(item.gstRate) || 0}%</td>
                          <td className="compact-cell" style={{textAlign:"right", fontWeight:600, color:"#b91c1c"}}>{item.qty}</td>
                          <td className="compact-cell" style={{textAlign:"right"}}>{fmt(item.rate)}</td>
                          <td className="compact-cell" style={{textAlign:"right"}}>{fmt(item.amount)}</td>
                          {isGujarat ? (
                            <>
                              <td className="compact-cell" style={{textAlign:"right"}}>
                                <div style={{fontSize:"0.65rem", color:"#6b7280"}}>{Number(item.cgstPercent) || 0}%</div>
                                <div style={{fontWeight:500}}>{fmt(item.cgstAmount)}</div>
                              </td>
                              <td className="compact-cell" style={{textAlign:"right"}}>
                                <div style={{fontSize:"0.65rem", color:"#6b7280"}}>{Number(item.sgstPercent) || 0}%</div>
                                <div style={{fontWeight:500}}>{fmt(item.sgstAmount)}</div>
                              </td>
                            </>
                          ) : (
                            <td className="compact-cell" style={{textAlign:"right"}}>
                              <div style={{fontSize:"0.65rem", color:"#6b7280"}}>{Number(item.igstPercent) || 0}%</div>
                              <div style={{fontWeight:500}}>{fmt(item.igstAmount)}</div>
                            </td>
                          )}
                          <td className="compact-cell" style={{textAlign:"right"}}>
                            {item.marginPercent > 0 ? (
                              <><div style={{fontWeight:500}}>{item.marginPercent}%</div><div style={{fontSize:"0.65rem", color:"#6b7280"}}>{fmt(marginAmount)}</div></>
                            ) : <span style={{color:"#9ca3af"}}>—</span>}
                          </td>
                          <td className="compact-cell" style={{textAlign:"right"}}>
                            {item.incPercent > 0 ? (
                              <><div style={{fontWeight:500}}>{item.incPercent}%</div><div style={{fontSize:"0.65rem", color:"#6b7280"}}>{fmt(incentiveAmount)}</div></>
                            ) : <span style={{color:"#9ca3af"}}>—</span>}
                          </td>
                          <td className="compact-cell" style={{textAlign:"right", fontWeight:600, color:"#b91c1c"}}>{fmt(item.total)}</td>
                        </tr>
                        {item.cancelRemark && (
                          <tr key={`${item.id}-cancel`} className="cancel-note-row">
                            <td colSpan={isGujarat ? 14 : 13}>
                              <span style={{ display:"inline-flex", alignItems:"center", gap:"5px", fontSize:"0.7rem", color:"#92400e", fontStyle:"italic" }}>
                                <MessageSquare style={{ width:"10px", height:"10px", flexShrink:0 }} />
                                <strong style={{ fontStyle:"normal" }}>Cancel note:</strong> {item.cancelRemark}
                              </span>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Financial Summary */}
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-semibold">Financial Summary</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Qty Total</span>
                  <span className="font-semibold text-red-600">{totalQty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxable Amount</span>
                  <span className="font-semibold text-red-600">{fmt(po.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount ({po.discountPercent || 0}%)</span>
                  <span className="font-semibold text-red-600">- {fmt(po.discountAmount)}</span>
                </div>
                {isGujarat ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST</span>
                      <span className="font-semibold text-red-600">{fmt(po.cgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST</span>
                      <span className="font-semibold text-red-600">{fmt(po.sgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGST</span>
                    <span className="font-semibold text-red-600">{fmt(po.igst)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Other Charges</span>
                  <span className="font-semibold">{fmt(po.otherCharges)}</span>
                </div>
              </div>
              <div className="flex items-end">
                <div className="w-full bg-muted/30 rounded-lg p-4 border border-border/40">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Net Amount</span>
                    <span className="text-2xl font-bold text-primary">{fmt(po.netAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

export default function PurchaseOrderViewPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <PurchaseOrderViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
