"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  FileText, ArrowLeft, Edit, Package, Truck,
  CreditCard, AlertCircle, Calendar, User, MapPin, Barcode,
} from "lucide-react"
import Link from "next/link"
import { purchaseInvoiceAPI, branchAPI, purchaseOrderAPI } from "@/lib/api"
import { PermissionGate } from "@/components/PermissionGate"

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

// itemName, brandName, poNumber now always come from the server JOIN —
// no need to denormalize them in the client
const normalizePIItem = (item: Record<string, unknown>) => ({
  ...item,
  qty:          pickNumber(item, ["qty", "quantity"]),
  rate:         pickNumber(item, ["rate"]),
  discountRs:   pickNumber(item, ["discountRs", "discount_rs", "discount"]),
  amount:
    pickNumber(item, ["amount", "taxableAmount", "taxable_amount"]) ||
    Math.max(
      0,
      pickNumber(item, ["qty", "quantity"]) * pickNumber(item, ["rate"]) -
        pickNumber(item, ["discountRs", "discount_rs", "discount"])
    ),
  poRate:       pickNumber(item, ["poRate", "po_rate"]),
  aTaxPercent:  pickNumber(item, ["aTaxPercent", "a_tax_percent", "gstRate", "gstPercent", "gst"]),
  sgstPercent:  pickNumber(item, ["sgstPercent", "sgst_percentage"]),
  sgstAmount:   pickNumber(item, ["sgstAmount", "sgst", "sgst_amount"]),
  cgstPercent:  pickNumber(item, ["cgstPercent", "cgst_percentage"]),
  cgstAmount:   pickNumber(item, ["cgstAmount", "cgst", "cgst_amount"]),
  igstPercent:  pickNumber(item, ["igstPercent", "igst_percentage"]),
  igstAmount:   pickNumber(item, ["igstAmount", "igst", "igst_amount"]),
})

interface SerialRowData { color?: string; srNo?: string }

function SerialNumbersDisplay({ serialRows }: { serialRows: SerialRowData[] }) {
  if (!Array.isArray(serialRows) || serialRows.length === 0) return null

  type GroupedRow = { color: string; serials: string[] }
  const colorMap = new Map<string, string[]>()
  const colorOrder: string[] = []

  for (const r of serialRows) {
    const color = (r.color || "").trim()
    const srNoStr = (r.srNo || "").trim()
    if (!srNoStr) continue
    const parts = srNoStr.split(",").map((s) => s.trim()).filter(Boolean)
    if (parts.length === 0) continue
    if (!colorMap.has(color)) { colorMap.set(color, []); colorOrder.push(color) }
    colorMap.get(color)!.push(...parts)
  }

  const groupedRows: GroupedRow[] = colorOrder
    .map((color) => ({ color, serials: colorMap.get(color)! }))
    .filter((r) => r.serials.length > 0)

  if (groupedRows.length === 0) return null
  const totalCount = groupedRows.reduce((sum, r) => sum + r.serials.length, 0)

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Barcode className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground">
          Serial / Barcode
          <span className="ml-1.5 text-orange-600 font-bold">({totalCount} total)</span>
        </p>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2fr_3fr] bg-red-700 text-white text-xs font-semibold">
          <div className="px-3 py-2 border-r border-red-600">Color</div>
          <div className="px-3 py-2 flex items-center gap-1.5">
            <Barcode className="h-3 w-3" /> S.No
          </div>
        </div>
        {groupedRows.map((row, idx) => (
          <div
            key={idx}
            className={`grid grid-cols-[2fr_3fr] border-b border-border/40 last:border-0 ${
              idx % 2 === 0 ? "bg-white" : "bg-muted/10"
            }`}
          >
            <div className="px-3 py-2.5 border-r border-border/40 flex items-start pt-3">
              {row.color ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <span
                    className="w-3 h-3 rounded-full border border-border/60 shrink-0 inline-block"
                    style={{ backgroundColor: row.color.toLowerCase() }}
                  />
                  {row.color}
                </span>
              ) : (
                <span className="text-xs italic text-muted-foreground">—</span>
              )}
            </div>
            <div className="px-3 py-2.5">
              <div className="flex flex-wrap gap-1">
                {row.serials.map((s, sIdx) => (
                  <span
                    key={sIdx}
                    className="inline-block text-[10px] font-mono px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded whitespace-nowrap"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PurchaseInvoiceViewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const piId = searchParams.get("id") || ""

  const [pi, setPI] = useState<any>(null)
  const [branchName, setBranchName] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [linkedPOItems, setLinkedPOItems] = useState<{ itemId: string; qty: number; rate: number }[]>([])

  useEffect(() => { if (piId) fetchPI() }, [piId])

  const fetchPI = async () => {
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return

      const result = await purchaseInvoiceAPI.getById(token, piId)
      if (result.success) {
        const invoice = result.data

        // itemName, brandName, poNumber now resolved by the server JOIN
        const itemSource =
          Array.isArray(invoice.items)                    ? invoice.items :
          Array.isArray(invoice.invoiceItems)             ? invoice.invoiceItems :
          Array.isArray(invoice.purchaseInvoiceItems)     ? invoice.purchaseInvoiceItems : []

        const normalizedItems = itemSource.map((item: Record<string, unknown>) =>
          normalizePIItem(item)
        )

        setPI({ ...invoice, items: normalizedItems })

        // Load PO items for debit-note calculation
        if (invoice.purchaseOrderId) {
          const poRes = await purchaseOrderAPI.getById(token, invoice.purchaseOrderId)
          if (poRes.success && poRes.data?.items?.length > 0) {
            setLinkedPOItems(
              poRes.data.items.map((item: any) => ({
                itemId: item.itemId || "",
                qty:    Number(item.qty)  || 0,
                rate:   Number(item.rate) || 0,
              }))
            )
          }
        }

        if (invoice.branchId) {
          const branchRes = await branchAPI.getById(token, invoice.branchId)
          setBranchName(
            branchRes.success && branchRes.data?.name ? branchRes.data.name : invoice.branchName || ""
          )
        } else {
          setBranchName(invoice.branchName || "")
        }
      }
    } catch (err) {
      console.error("Error fetching PI:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    })
  }
  const fmt = (amount: number) =>
    `₹${(Number(amount) || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading purchase invoice...</p>
        </div>
      </div>
    )
  }

  if (!pi) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Purchase invoice not found</p>
          <Link href="/purchase-invoices/list">
            <Button className="mt-4">Back to Invoices</Button>
          </Link>
        </div>
      </div>
    )
  }

  const items = Array.isArray(pi.items) ? pi.items : []
  const totalQty              = items.reduce((sum: number, i: any) => sum + toNumber(i.qty), 0)
  const computedTotalAmount   = items.reduce((sum: number, i: any) => sum + toNumber(i.amount), 0)
  const summaryTotalAmount    = computedTotalAmount > 0 ? computedTotalAmount : toNumber(pi.totalAmount)
  const discountPercent       = toNumber(pi.discountPercent)
  const summaryDiscountAmount = (summaryTotalAmount * discountPercent) / 100
  const summarySGSTFromItems  = items.reduce((sum: number, i: any) => sum + toNumber(i.sgstAmount), 0)
  const summaryCGSTFromItems  = items.reduce((sum: number, i: any) => sum + toNumber(i.cgstAmount), 0)
  const summaryIGSTFromItems  = items.reduce((sum: number, i: any) => sum + toNumber(i.igstAmount), 0)
  const summarySGST  = summarySGSTFromItems > 0 ? summarySGSTFromItems : toNumber(pi.sgst)
  const summaryCGST  = summaryCGSTFromItems > 0 ? summaryCGSTFromItems : toNumber(pi.cgst)
  const summaryIGST  = summaryIGSTFromItems > 0 ? summaryIGSTFromItems : toNumber(pi.igst)
  const summaryFreight = toNumber(pi.freightAmount)
  const summaryOther   = toNumber(pi.otherAmount)
  const tcsPercent     = toNumber(pi.tcsPercent)
  const summaryGross   = items.reduce((sum: number, i: any) => sum + toNumber(i.qty) * toNumber(i.rate), 0)
  const summaryItemDiscount = items.reduce((sum: number, i: any) => sum + toNumber(i.discountRs), 0)
  const summaryTcsAmount    = ((summaryGross - summaryItemDiscount - summaryDiscountAmount) * tcsPercent) / 100
  const summaryNetAmount    = items.length > 0
    ? summaryGross - summaryItemDiscount - summaryDiscountAmount + summaryFreight + summaryTcsAmount + summaryOther
    : toNumber(pi.netAmount)

  const debitNoteAmount = (() => {
    const linkedMap = new Map(
      linkedPOItems.map((item: any) => [
        `${String(item.itemId || "")}::${String(item.variantId || "")}::${String(item.variant || "").toLowerCase()}::${String(item.poId || "")}`,
        item,
      ])
    )

    const computed = items
      .filter((i: any) => i.itemName?.trim() && toNumber(i.qty) > 0)
      .reduce((sum: number, i: any) => {
        const key = `${String(i.itemId || "")}::${String(i.variantId || "")}::${String(i.variant || "").toLowerCase()}::${String(i.purchaseOrderId || "")}`
        const poItem = linkedMap.get(key)
        const poRate = toNumber(i.poRate) || toNumber(poItem?.rate)
        if (!poRate) return sum
        return sum + (toNumber(i.rate) - poRate) * toNumber(i.qty)
      }, 0)

    return computed !== 0 ? computed : (Number(pi.debitNoteAmount) || 0)
  })()

  const isGujarat = summaryCGST > 0 || toNumber(pi.cgst) > 0

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6">
          <Button
            onClick={() => router.push("/purchase-invoices/list")}
            className="mb-4 bg-red-700 hover:bg-red-800 text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Purchase Invoice Details</h1>
              <p className="text-muted-foreground mt-1">Complete information for bill {pi.billNumber || "-"}</p>
            </div>
            <PermissionGate module="suppliers" action="update">
              <Link href={`/purchase-invoices/edit?id=${pi.id}`}>
                <Button className="bg-gradient-to-r from-red-700 to-red-700 hover:opacity-90">
                  <Edit className="h-4 w-4 mr-2" />Edit Invoice
                </Button>
              </Link>
            </PermissionGate>
          </div>
        </div>

        {/* PI Header Card */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                <FileText className="h-10 w-10 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold mb-1">{pi.billNumber || "-"}</h2>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Calendar className="h-4 w-4" />
                      <span>Bill Date: {formatDate(pi.billDate)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <User className="h-4 w-4" />
                      <span>Supplier: <strong>{pi.supplierName}</strong></span>
                      {pi.supplierCity && (
                        <span className="text-xs">
                          ({pi.supplierCity}{pi.supplierState ? `, ${pi.supplierState}` : ""})
                        </span>
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
                    <p className="text-2xl font-bold">{fmt(summaryNetAmount)}</p>
                    <p className="text-xs text-muted-foreground">Net Amount</p>
                    {debitNoteAmount !== 0 && (
                      <div className="mt-2">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                          debitNoteAmount > 0
                            ? "bg-orange-100 text-orange-700 border-orange-200"
                            : "bg-green-100 text-green-700 border-green-200"
                        }`}>
                          Debit Note: {fmt(Math.abs(debitNoteAmount))}
                          {debitNoteAmount < 0 ? " (CR)" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Supplier Information</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier Name:</span>
                  <span className="font-medium">{pi.supplierName || "—"}</span>
                </div>
                {pi.supplierCity && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">
                      {pi.supplierCity}{pi.supplierState ? `, ${pi.supplierState}` : ""}
                    </span>
                  </div>
                )}
                {pi.supplierGST && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GST Number:</span>
                    <Badge variant="outline" className="font-mono text-xs">{pi.supplierGST}</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Transport &amp; Other Info</h3>
              </div>
              <div className="space-y-3 text-sm">
                {pi.transporterId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transporter:</span>
                    <span className="font-medium">{pi.transporterId}</span>
                  </div>
                )}
                {pi.lrNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">L.R. No.:</span>
                    <span className="font-medium">{pi.lrNumber}</span>
                  </div>
                )}
                {pi.lrDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">L.R. Date:</span>
                    <span className="font-medium">{formatDate(pi.lrDate)}</span>
                  </div>
                )}
                {branchName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Branch:</span>
                    <span className="font-medium">{branchName}</span>
                  </div>
                )}
                {pi.remarks && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Remarks:</span>
                    <span className="font-medium text-right max-w-[200px]">{pi.remarks}</span>
                  </div>
                )}
                {!pi.transporterId && !pi.lrNumber && !pi.remarks && (
                  <p className="text-muted-foreground text-xs italic">No transport information</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Items Table */}
        <Card className="border-border/50 shadow-sm mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-5 w-5 text-accent" />
              <h3 className="text-lg font-semibold">Items ({pi.items?.length || 0})</h3>
            </div>
            <style>{`
              .pi-view-table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
              .pi-view-table th { border: 1px solid rgba(255,255,255,0.25); padding: 8px 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
              .pi-view-table td { border: 1px solid #d1d5db; padding: 6px 10px; }
              .pi-view-table tbody tr:hover td { background-color: #f9fafb; }
              .pi-view-table tbody tr.alt-row td { background-color: #f9fafb; }
            `}</style>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="pi-view-table">
                <thead>
                  <tr className="bg-red-700 text-white">
                    <th style={{ width: "40px" }}>#</th>
                    <th style={{ width: "80px" }}>P.O.No</th>
                    <th style={{ width: "120px" }}>Brand</th>
                    <th style={{ width: "160px" }}>Item Name</th>
                    <th style={{ width: "140px" }}>Variant</th>
                    <th style={{ width: "60px",  textAlign: "right" }}>Qty</th>
                    <th style={{ width: "95px",  textAlign: "right" }}>Rate</th>
                    <th style={{ width: "80px",  textAlign: "right" }}>Disc.Rs</th>
                    <th style={{ width: "95px",  textAlign: "right" }}>Amount</th>
                    <th style={{ width: "90px",  textAlign: "right" }}>P.O.Rate</th>
                    <th style={{ width: "70px",  textAlign: "right" }}>A.Tax%</th>
                    {isGujarat ? (
                      <>
                        <th style={{ width: "90px", textAlign: "right" }}>SGST</th>
                        <th style={{ width: "90px", textAlign: "right" }}>CGST</th>
                      </>
                    ) : (
                      <th style={{ width: "90px", textAlign: "right" }}>IGST</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(pi.items || []).map((item: any, index: number) => {
                    const totalSerials = Array.isArray(item.serialRows)
                      ? item.serialRows.reduce((sum: number, r: any) => {
                          const s: string = r.srNo || ""
                          return sum + s.split(",").map((x: string) => x.trim()).filter(Boolean).length
                        }, 0)
                      : 0

                    // Description row only shown when there are serials or remarks
                    const hasDetail = item.remarks || (Array.isArray(item.serialRows) && totalSerials > 0)

                    return [
                      <tr key={`row-${item.id || index}`} className={index % 2 !== 0 ? "alt-row" : ""}>
                        <td style={{ color: "#6b7280", fontSize: "11px" }}>{index + 1}</td>
                        {/* poNumber comes from server JOIN */}
                        <td style={{ fontSize: "11px" }}>{item.poNumber || "—"}</td>
                        {/* brandName comes from server JOIN */}
                        <td style={{ fontSize: "11px" }}>{item.brandName || "—"}</td>
                        {/* itemName comes from server JOIN */}
                        <td style={{ fontSize: "11px", fontWeight: 500 }}>{item.itemName || "—"}</td>
                        <td style={{ fontSize: "11px" }}>{item.variant || "—"}</td>
                        <td style={{ fontSize: "11px", fontWeight: 500, color: "#dc2626", textAlign: "right" }}>{item.qty}</td>
                        <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.rate)}</td>
                        <td style={{ fontSize: "11px", textAlign: "right" }}>{item.discountRs || 0}</td>
                        <td style={{ fontSize: "11px", fontWeight: 500, color: "#dc2626", textAlign: "right" }}>{fmt(item.amount)}</td>
                        <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.poRate)}</td>
                        <td style={{ fontSize: "11px", textAlign: "right" }}>{item.aTaxPercent || 0}</td>
                        {isGujarat ? (
                          <>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "10px", color: "#6b7280" }}>{Number(item.sgstPercent) || 0}%</div>
                              <div style={{ fontSize: "11px", fontWeight: 500 }}>{fmt(item.sgstAmount)}</div>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "10px", color: "#6b7280" }}>{Number(item.cgstPercent) || 0}%</div>
                              <div style={{ fontSize: "11px", fontWeight: 500 }}>{fmt(item.cgstAmount)}</div>
                            </td>
                          </>
                        ) : (
                          <td style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "10px", color: "#6b7280" }}>{Number(item.igstPercent) || 0}%</div>
                            <div style={{ fontSize: "11px", fontWeight: 500 }}>{fmt(item.igstAmount)}</div>
                          </td>
                        )}
                      </tr>,

                      hasDetail ? (
                        <tr key={`detail-${item.id || index}`} style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}>
                          <td colSpan={isGujarat ? 13 : 12} style={{ padding: "10px 14px" }}>
                            <div className="space-y-3 text-xs">
                              {item.remarks && (
                                <div>
                                  <p className="font-semibold text-muted-foreground mb-1">Description</p>
                                  <p className="text-foreground whitespace-pre-wrap break-words">{item.remarks}</p>
                                </div>
                              )}
                              {Array.isArray(item.serialRows) && totalSerials > 0 && (
                                <SerialNumbersDisplay serialRows={item.serialRows} />
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ]
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
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Qty Total</span>
                  <span className="font-semibold text-red-600">{totalQty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-semibold text-red-600">{fmt(summaryTotalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Disc. ({discountPercent || 0}%)</span>
                  <span className="font-semibold text-red-600">- {fmt(summaryDiscountAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Freight</span>
                  <span className="font-semibold text-red-600">{fmt(summaryFreight)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">TCS ({tcsPercent || 0}%)</span>
                  <span className="font-semibold text-red-600">{fmt(summaryTcsAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Other</span>
                  <span className="font-semibold text-red-600">{fmt(summaryOther)}</span>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {isGujarat ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST</span>
                      <span className="font-semibold text-red-600">{fmt(summarySGST)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST</span>
                      <span className="font-semibold text-red-600">{fmt(summaryCGST)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGST</span>
                    <span className="font-semibold text-red-600">{fmt(summaryIGST)}</span>
                  </div>
                )}
                <div className="pt-1 mt-1 border-t">
                  <p className="font-semibold text-muted-foreground mb-2">RCM</p>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST</span>
                      <span className="font-semibold">{fmt(pi.rcmSgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST</span>
                      <span className="font-semibold">{fmt(pi.rcmCgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IGST</span>
                      <span className="font-semibold">{fmt(pi.rcmIgst)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className={`rounded-lg p-3 border ${
                  debitNoteAmount > 0 ? "bg-orange-50 border-orange-200" :
                  debitNoteAmount < 0 ? "bg-green-50 border-green-200"  :
                  "bg-muted/30 border-border/50"
                }`}>
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                    Debit Note Amt.
                  </p>
                  <p className={`text-xl font-bold ${
                    debitNoteAmount > 0 ? "text-orange-600" :
                    debitNoteAmount < 0 ? "text-green-600"  :
                    "text-muted-foreground"
                  }`}>
                    {debitNoteAmount !== 0
                      ? `${debitNoteAmount < 0 ? "- " : ""}${fmt(Math.abs(debitNoteAmount))}`
                      : "₹ 0.00"}
                  </p>
                  <p className="text-xs mt-0.5 text-muted-foreground">
                    {debitNoteAmount > 0  && <span className="text-orange-600">PI exceeds PO amount</span>}
                    {debitNoteAmount < 0  && <span className="text-green-600">PI below PO amount (credit)</span>}
                    {debitNoteAmount === 0 && linkedPOItems.length > 0    && "Amounts match PO exactly"}
                    {debitNoteAmount === 0 && linkedPOItems.length === 0 && !pi.purchaseOrderId && "No linked PO"}
                    {debitNoteAmount === 0 && linkedPOItems.length === 0 &&  pi.purchaseOrderId && "Loading PO data..."}
                  </p>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-3 mt-2">
                  <span>Net Amount</span>
                  <span className="text-primary">{fmt(summaryNetAmount)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

export default function PurchaseInvoiceViewPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </div>
          }
        >
          <PurchaseInvoiceViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
