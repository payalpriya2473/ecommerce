"use client"

import type { CSSProperties } from "react"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Printer } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { companyAPI, purchaseOrderAPI } from "@/lib/api"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

interface POItem {
  id: string
  brandName?: string
  variant?: string
  itemName: string
  uom?: string
  qty: number
  rate: number
  amount: number
  gstRate: number
  remarks?: string
}

interface PurchaseOrder {
  id: string
  poNumber: string
  supplierName: string
  supplierCity?: string
  supplierState?: string
  supplierGST?: string
  supplierPhone?: string
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
}

interface Company {
  id: string
  name: string
  address?: string
  city?: string
  state?: string
  pinCode?: string
  gstNumber?: string
  logoUrl?: string
  email?: string
  phone?: string
  dispatchName?: string
  dispatchContactPerson?: string
  dispatchContactPhone?: string
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api").replace(/\/api\/?$/, "")
const toNumber = (value: unknown) => Number(value) || 0

const formatMoney = (value: unknown) =>
  toNumber(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const formatDate = (value?: string) => {
  if (!value) return ""
  try {
    return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
  } catch { return value }
}

function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  const convert = (n: number): string => {
    if (n < 20) return ones[n]
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`
    if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${convert(n % 100)}` : ""}`
    if (n < 100000) return `${convert(Math.floor(n / 1000))} Thousand${n % 1000 ? ` ${convert(n % 1000)}` : ""}`
    if (n < 10000000) return `${convert(Math.floor(n / 100000))} Lakh${n % 100000 ? ` ${convert(n % 100000)}` : ""}`
    return `${convert(Math.floor(n / 10000000))} Crore${n % 10000000 ? ` ${convert(n % 10000000)}` : ""}`
  }
  if (!num) return "Zero Rupees Only"
  const whole = Math.floor(num)
  const paise = Math.round((num - whole) * 100)
  return `${convert(whole)} Rupees${paise > 0 ? ` And ${convert(paise)} Paise` : ""} Only`
}

function normalizePOItem(item: Record<string, unknown>): POItem {
  const qty = toNumber(item.qty ?? item.quantity)
  const rate = toNumber(item.rate ?? item.purchaseRate)
  const computedAmount = qty * rate
  const amount = computedAmount > 0 ? computedAmount : toNumber(item.amount ?? item.taxableAmount)

  // Resolve GST rate from multiple possible field names
  const gstRate = (() => {
    // Try direct fields first
    for (const key of ["gstRate", "gstPercent", "gst", "aTaxPercent"]) {
      const val = Number(item[key])
      if (val > 0) return val
    }
    // Try to derive from IGST percent
    const igst = Number(item.igstPercent)
    if (igst > 0) return igst
    // Try to derive from CGST+SGST percent
    const cgst = Number(item.cgstPercent)
    const sgst = Number(item.sgstPercent)
    if (cgst > 0 || sgst > 0) return cgst + sgst
    // Try to derive from tax amounts vs taxable amount
    const taxableAmt = Number(item.amount ?? item.taxableAmount)
    const igstAmt = Number(item.igstAmount ?? item.igst)
    const cgstAmt = Number(item.cgstAmount ?? item.cgst)
    const sgstAmt = Number(item.sgstAmount ?? item.sgst)
    if (taxableAmt > 0) {
      if (igstAmt > 0) return Math.round((igstAmt * 100) / taxableAmt)
      if (cgstAmt > 0 || sgstAmt > 0) return Math.round(((cgstAmt + sgstAmt) * 100) / taxableAmt)
    }
    return 0
  })()

  return {
    id: String(item.id || item.itemId || ""),
    brandName: String(item.brandName || item.brand || ""),
    variant: String(item.variant || item.variantName || item.variantLabel || ""),
    itemName: String(item.itemName || item.name || ""),
    uom: String(item.uom || "PCS"),
    qty, rate, amount,
    gstRate,
    remarks: String(item.remarks || ""),
  }
}

function normalizePO(source: Record<string, unknown>): PurchaseOrder {
  const itemsSource = Array.isArray(source.items) ? source.items
    : Array.isArray(source.orderItems) ? source.orderItems
    : Array.isArray(source.purchaseOrderItems) ? source.purchaseOrderItems : []
  const items = itemsSource.map((item: Record<string, unknown>) => normalizePOItem(item))
  const supplierGST = String(source.supplierGST || source.supplierGst || source.supplierGSTNumber || source.vendorGST || source.vendorGst || "")
  const supplierPhone = String(source.supplierPhone || source.phone || source.supplierMobile || source.vendorPhone || source.vendorMobile || "")
  return { ...source as unknown as PurchaseOrder, supplierGST, supplierPhone, items }
}

const MIN_ITEM_ROWS = 20

function POPrintContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const poId = searchParams.get("id") || ""

  const [po, setPO] = useState<PurchaseOrder | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState("")
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [role, setRole] = useState("")

  useEffect(() => {
    const userRole = sessionStorage.getItem("userRole") || ""
    const companyId = sessionStorage.getItem("companyId") || ""
    setRole(userRole)
    const load = async () => {
      try {
        const token = sessionStorage.getItem("authToken") || ""
        const [poRes, companyRes] = await Promise.all([
          purchaseOrderAPI.getById(token, poId),
          companyAPI.getAll(token),
        ])
        if (!poRes.success) { setError("Purchase order not found") }
        else { setPO(normalizePO(poRes.data || {})) }
         if (companyRes.success) {
          setCompanies(companyRes.data || [])
          // Auto-select company from PO's companyId
          const poCompanyId = poRes.data?.companyId || ""
          if (poCompanyId) {
            const matched = companyRes.data.find((c: Company) => c.id === poCompanyId)
            if (matched) {
              setSelectedCompanyId(matched.id)
              setSelectedCompany(matched)
            }
          } else if (userRole !== "super_admin" && companyId) {
            setSelectedCompanyId(companyId)
            setSelectedCompany(companyRes.data.find((c: Company) => c.id === companyId) || null)
          }
        }
      } catch { setError("Failed to load purchase order") }
      finally { setLoading(false) }
    }
    if (poId) load()
    else { setError("Purchase order not found"); setLoading(false) }
  }, [poId])

  const handleCompanyChange = (id: string) => {
    setSelectedCompanyId(id)
    setSelectedCompany(companies.find((c) => c.id === id) || null)
  }

  const logoSrc = useMemo(() => {
    if (!selectedCompany?.logoUrl) return ""
    if (selectedCompany.logoUrl.startsWith("http") || selectedCompany.logoUrl.startsWith("data:")) return selectedCompany.logoUrl
    return `${API_BASE}${selectedCompany.logoUrl}`
  }, [selectedCompany])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading purchase order...</p>
        </div>
      </div>
    )
  }

  if (error || !po) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{error || "Purchase order not found"}</p>
          <button onClick={() => router.push("/purchase-orders/list")} style={btnStyle}>Back to Orders</button>
        </div>
      </div>
    )
  }

  const items = po.items || []
  const emptyRows = Math.max(0, MIN_ITEM_ROWS - items.length)
  const isGujaratTax = toNumber(po.cgst) > 0 || toNumber(po.sgst) > 0
  const computedGross = items.reduce((sum, item) => sum + toNumber(item.amount), 0)
  const grossAmount = toNumber(po.totalAmount) > 0 ? toNumber(po.totalAmount) : computedGross

  const companyAddress = [selectedCompany?.address, selectedCompany?.city, selectedCompany?.state]
    .filter(Boolean).join(", ").toUpperCase()

const dispatchText = (() => {
  const name = (selectedCompany?.dispatchContactPerson?.trim() || selectedCompany?.dispatchName?.trim() || "")
  if (!name) return ""
  const phone = selectedCompany?.dispatchContactPhone
  return `Please Give Dispatch Instructions To ${name}${phone ? ` On ${phone}` : ""}, Minimum 4 Hrs Prior Delivery`
})()

  const summaryRows: { label: string; value: number }[] = [
    { label: "Gross", value: grossAmount },
    ...(toNumber(po.discountAmount) > 0 ? [{ label: "Discount", value: -toNumber(po.discountAmount) }] : []),
    ...(isGujaratTax
      ? [{ label: "C.GST", value: toNumber(po.cgst) }, { label: "S.GST", value: toNumber(po.sgst) }]
      : [{ label: "I.GST", value: toNumber(po.igst) }]),
    ...(toNumber(po.otherCharges) > 0 ? [{ label: "Other Charges", value: toNumber(po.otherCharges) }] : []),
  ]

  /* ─── border constants so they're consistent everywhere ─── */
  const B  = "1px solid #000"
  const BH = "1.5px solid #000"

  return (
    <>
      <style>{`
        /* ── SCREEN ── */
        .po-screen-wrap   { padding: 20px 16px 40px; }
        .po-action-bar    { display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
        .po-preview-center {
          display:flex; justify-content:center;
          background:#d1d5db; padding:24px 0; border-radius:8px;
        }

        /* A4 root */
        #po-print-root {
          width: 210mm;
          min-height: 297mm;
          background: #fff;
          box-shadow: 0 4px 18px rgba(0,0,0,.18);
          padding: 6mm 7mm;
          display: flex;
          flex-direction: column;
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
          box-sizing: border-box;
        }

        /* Outer document box — ALL four sides */
        .po-doc {
          flex: 1;
          border: 1.5px solid #000;   /* top + left + right */
          display: flex;
          flex-direction: column;
          /* bottom is provided by the last child (sign row) */
        }

        /* HEADER */
        .po-hdr {
          display:flex; align-items:center;
          padding:8px 12px; gap:12px;
          border-bottom:1.5px solid #000;
        }
        .po-hdr-logo     { width:72px; height:62px; object-fit:contain; flex-shrink:0; }
        .po-hdr-logo-box {
          width:72px; height:62px; flex-shrink:0;
          border:1px dashed #bbb;
          display:flex; align-items:center; justify-content:center;
          font-size:9px; color:#aaa;
        }
        .po-hdr-center { flex:1; text-align:center; }
        .po-hdr-name {
          font-size:26px; font-weight:700;
          text-decoration:underline; text-transform:uppercase;
          line-height:1.1; margin-bottom:5px;
        }
        .po-hdr-line { font-size:12px; line-height:1.65; }
        .po-hdr-gst  { font-size:12px; font-weight:700; margin-top:1px; }

        /* TITLE */
        .po-sec-title {
          text-align:center; font-size:13px; font-weight:700;
          text-transform:uppercase; padding:7px 0;
          border-bottom:1.5px solid #000; letter-spacing:0.5px;
        }

        /* SUPPLIER + META */
        .po-party       { display:flex; border-bottom:1.5px solid #000; min-height:115px; }
        .po-party-left  { flex:1; padding:8px 12px; border-right:1.5px solid #000; }
        .po-party-right { width:230px; flex-shrink:0; display:flex; flex-direction:column; }
        .po-sup-name    { font-size:13px; font-weight:700; text-transform:uppercase; margin-bottom:2px; }
        .po-sup-city    { font-size:12px; margin-bottom:1px; }
        .po-sup-row     { display:flex; justify-content:space-between; gap:10px; font-size:12px; margin-top:16px; }
        .po-sup-attn    { font-size:12px; margin-top:5px; }
        .po-meta-row {
          display:flex; align-items:center;
          border-bottom:1px solid #000;
          padding:7px 10px; font-size:12px; font-weight:700; min-height:34px;
        }
        .po-meta-label { width:78px; flex-shrink:0; }
        .po-meta-sep   { margin:0 6px; }
        .po-note-cell  { flex:1; padding:8px 10px; font-size:11px; font-weight:600; line-height:1.45; }

        /* ITEMS TABLE */
       /* ITEMS TABLE */
        .po-items-wrap { flex:1; border-bottom:1.5px solid #000; overflow:hidden; display:flex; flex-direction:column; }
        .po-items-tbl  { width:100%; border-collapse:collapse; table-layout:fixed; height:100%; }
        .po-items-tbl th, .po-items-tbl td {
          border-right:1px solid #000;
          padding:4px 5px; font-size:11px; vertical-align:top;
        }
        .po-items-tbl th:first-child, .po-items-tbl td:first-child { border-left:none; }
        .po-items-tbl th:last-child,  .po-items-tbl td:last-child  { border-right:none; }
        .po-items-tbl thead tr   { border-bottom:1px solid #000; }
        .po-items-tbl thead th   { font-weight:700; text-align:center; }
        .po-items-tbl thead th.lft { text-align:left; }
        .po-items-tbl thead th.rgt { text-align:right; }
        .po-items-tbl td.c { text-align:center; }
        .po-items-tbl td.r { text-align:right; }
        .po-item-row  td { height:26px; }
        .po-empty-row    { flex:1; }
        .po-empty-row td { height:26px; min-height:26px; }

        /*
          ═══════════════════════════════════════════════
          FOOTER  (no outer border needed — po-doc provides
          left/right; footer sections provide top/bottom)
          ═══════════════════════════════════════════════
        */
        /* Top band: Terms | Summary */
        .po-footer-top { display:flex; border-bottom:1.5px solid #000; }
        .po-terms-col {
          flex:1; border-right:1.5px solid #000; padding:7px 10px;
        }
        .po-term-line {
          display:flex; align-items:baseline; min-height:28px; font-size:12px;
        }
        .po-term-line strong { min-width:130px; font-weight:700; flex-shrink:0; }

        /* Summary column */
        .po-summary-col { width:230px; flex-shrink:0; display:flex; flex-direction:column; }
        .po-s-row {
          display:flex; border-bottom:1px solid #000;
          font-size:12px; font-weight:600;
        }
        .po-s-row:last-child { border-bottom:none; flex:1; }
        .po-s-label {
          flex:1; padding:6px 10px;
          display:flex; align-items:center;
        }
        .po-s-value {
          width:105px; flex-shrink:0;
          padding:6px 10px; text-align:right;
          border-left:1px solid #000;
          display:flex; align-items:center; justify-content:flex-end;
        }

        /* Rupees | Net Amount band */
        .po-footer-bottom {
          display:flex;
          border-bottom:1.5px solid #000;   /* ← closes the footer bottom */
        }
        .po-rupees-cell {
          flex:1; border-right:1.5px solid #000;
          padding:7px 10px; font-size:12px; font-weight:700;
          display:flex; align-items:center;
        }
        .po-net-row   { width:230px; flex-shrink:0; display:flex; font-size:13px; font-weight:700; }
        .po-net-label { flex:1; padding:7px 10px; display:flex; align-items:center; }
        .po-net-value {
          width:105px; flex-shrink:0;
          padding:7px 10px; text-align:right;
          border-left:1px solid #000;
          display:flex; align-items:center; justify-content:flex-end;
        }

        /*
          ═══════════════════════════════════════════════
          SIGN ROW — last section of po-doc
          Must close the outer box at the bottom:
            • left side stretches full width (no extra border needed)
            • right side has border-left
            • the BOTTOM of this row = bottom of the outer po-doc border
              → achieved by border-bottom on .po-sign-row itself
          ═══════════════════════════════════════════════
        */
        .po-sign-row {
          display:flex;
          min-height:90px;
        }
        .po-sign-left {
          flex:1;
          padding:8px 10px; font-size:11px;
          display:flex; flex-direction:column; justify-content:space-between;
        }
        .po-sign-dispatch {
          font-weight:700; font-size:12px; line-height:1.55;
        }
        .po-sign-juris {
          display:flex; justify-content:space-between; font-size:11px; margin-top:4px;
        }
        .po-sign-right {
          width:230px; flex-shrink:0;
          padding:10px 10px 8px; text-align:center;
          font-size:12px; font-weight:700;
         
          display:flex; flex-direction:column; justify-content:space-between;
          align-items:center;
        }

        /* ════════════════════════════════════════════
           PRINT — show only #po-print-root, full A4
           ════════════════════════════════════════════ */
        @media print {
          @page { size: A4 portrait; margin: 0; }

          body * { visibility: hidden !important; }

          #po-print-root,
          #po-print-root * { visibility: visible !important; }

          #po-print-root {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            padding: 6mm 7mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            overflow: hidden !important;
          }
        }
      `}</style>

      <div className="po-screen-wrap">

        {/* Action bar */}
        <div className="po-action-bar">
          <button onClick={() => router.push("/purchase-orders/list")} style={btnStyle}>
            <ArrowLeft size={14} /> Back
          </button>
          <span style={{ fontSize:13, fontWeight:600, color:"#374151" }}>Company:</span>
          {role === "super_admin" ? (
            <Select value={selectedCompanyId} onValueChange={handleCompanyChange}>
              <SelectTrigger style={{ width:280, height:34, fontSize:13 }}>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span style={{ fontSize:13, fontWeight:600 }}>{selectedCompany?.name || "Loading..."}</span>
          )}
          <button
            onClick={() => window.print()}
            disabled={!selectedCompany}
            style={{ ...btnStyle, marginLeft:"auto", opacity: selectedCompany ? 1 : 0.55 }}
          >
            <Printer size={14} />
            {selectedCompany ? "Print / Download PDF" : "Select company first"}
          </button>
        </div>

        {/* Grey preview background */}
        <div className="po-preview-center">

          {/* ══ ONLY THIS IS PRINTED ══ */}
          <div id="po-print-root">
            <div className="po-doc">

              {/* ── HEADER ── */}
              <div className="po-hdr">
                {logoSrc
                  ? <img src={logoSrc} alt="Logo" className="po-hdr-logo" />
                  : <div className="po-hdr-logo-box">LOGO</div>
                }
                <div className="po-hdr-center">
                  <div className="po-hdr-name">{selectedCompany?.name || "Company Name"}</div>
                  {companyAddress            && <div className="po-hdr-line">H.O.- {companyAddress}</div>}
                  {selectedCompany?.phone    && <div className="po-hdr-line">Phone : {selectedCompany.phone}</div>}
                  {selectedCompany?.email    && <div className="po-hdr-line">Email : {selectedCompany.email}</div>}
                  {selectedCompany?.gstNumber && <div className="po-hdr-gst">GST No. : {selectedCompany.gstNumber}</div>}
                </div>
              </div>

              {/* ── TITLE ── */}
              <div className="po-sec-title">Purchase Order</div>

              {/* ── SUPPLIER + META ── */}
              <div className="po-party">
                <div className="po-party-left">
                  <div className="po-sup-name">{po.supplierName}</div>
                  {po.supplierCity  && <div className="po-sup-city">{po.supplierCity}</div>}
                  {po.supplierState && <div className="po-sup-city">{po.supplierState}</div>}
                  <div className="po-sup-row">
                    <span>Phone No. :&nbsp;{po.supplierPhone || ""}</span>
                    <span>GST No. :&nbsp;{po.supplierGST || ""}</span>
                  </div>
                  <div className="po-sup-attn">Kind Attn. :</div>
                </div>
                <div className="po-party-right">
                  <div className="po-meta-row">
                    <span className="po-meta-label">P.O. No.</span>
                    <span className="po-meta-sep">:</span>
                    <span style={{ fontWeight:700 }}>{po.poNumber}</span>
                  </div>
                  <div className="po-meta-row" style={{ borderBottom:"1px solid #000" }}>
                    <span className="po-meta-label">P.O. Date</span>
                    <span className="po-meta-sep">:</span>
                    <span>{formatDate(po.poDate)}</span>
                  </div>
                  <div className="po-note-cell">
                    Please Mention the above P.O. No. in future correspondence.
                  </div>
                </div>
              </div>

              {/* ── ITEMS TABLE ── */}
              <div className="po-items-wrap">
                <table className="po-items-tbl">
              <colgroup>
                    <col style={{ width:"4%"  }} />
                    <col style={{ width:"27%" }} />
                    <col style={{ width:"7%"  }} />
                    <col style={{ width:"5%"  }} />
                    <col style={{ width:"11%" }} />
                    <col style={{ width:"11%" }} />
                    {isGujaratTax ? (
                      <>
                        <col style={{ width:"8%" }} />
                        <col style={{ width:"8%" }} />
                      </>
                    ) : (
                      <col style={{ width:"8%" }} />
                    )}
                    <col style={{ width:"7%"  }} />
                    <col style={{ width:"12%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th className="lft">Item</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th className="rgt">Rate</th>
                      <th className="rgt">Amount</th>
                      {isGujaratTax ? (
                        <>
                          <th>CGST%</th>
                          <th>SGST%</th>
                        </>
                      ) : (
                        <th>GST%</th>
                      )}
                      <th style={{ whiteSpace:"normal", lineHeight:"1.2", fontSize:"0.65rem" }}>Disc.%</th>
                      <th className="rgt">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                     const discPct = toNumber(po.discountPercent)
                      const itemTotal = toNumber(item.qty) * toNumber(item.rate)
                      const gstRate = toNumber(item.gstRate)
                      const cgstPct = gstRate / 2
                      const sgstPct = gstRate / 2
                      return (
                        <tr key={item.id || idx} className="po-item-row">
                          <td className="c">{idx + 1}</td>
                          <td>
                            <div>{item.itemName}</div>
                            {item.variant && <div style={{ fontSize:10 }}>{item.variant}</div>}
                            {item.remarks   && <div style={{ fontSize:10 }}>{item.remarks}</div>}
                          </td>
                          <td className="c">{toNumber(item.qty).toFixed(2)}</td>
                          <td className="c">{item.uom || "PCS"}</td>
                          <td className="r">{formatMoney(item.rate)}</td>
                          <td className="r">{formatMoney(item.amount)}</td>
                          {isGujaratTax ? (
                            <>
                              <td className="c">{cgstPct.toFixed(2)}%</td>
                              <td className="c">{sgstPct.toFixed(2)}%</td>
                            </>
                          ) : (
                            <td className="c">{gstRate.toFixed(2)}%</td>
                          )}
                          <td className="c">{discPct.toFixed(2)}%</td>
                          <td className="r">{formatMoney(itemTotal)}</td>
                        </tr>
                      )
                    })}
                    {Array.from({ length: emptyRows }).map((_, i) => (
                      <tr key={`empty-${i}`} className="po-empty-row">
                        {isGujaratTax
                          ? <><td/><td/><td/><td/><td/><td/><td/><td/><td/><td/></>
                          : <><td/><td/><td/><td/><td/><td/><td/><td/><td/></>
                        }
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── FOOTER: Terms + Summary ── */}
              <div className="po-footer-top">
                <div className="po-terms-col">
                  <div className="po-term-line">
                    <strong>Payment Terms:</strong>
                    <span>{po.paymentTerms || ""}</span>
                  </div>
                  <div className="po-term-line">
                    <strong>Delivery Schedule:</strong>
                    <span>{po.deliverySchedule || ""}</span>
                  </div>
                  <div className="po-term-line">
                    <strong>Transportation:</strong>
                    <span>{po.transportation || ""}</span>
                  </div>
                  <div className="po-term-line">
                    <strong>Remarks:</strong>
                    <span>{po.remarks || ""}</span>
                  </div>
                </div>
                <div className="po-summary-col">
                  {summaryRows.map((row, idx) => (
                    <div key={`${row.label}-${idx}`} className="po-s-row">
                      <span className="po-s-label">{row.label}</span>
                      <span className="po-s-value">
                        {row.value < 0 ? "-" : ""}
                        {formatMoney(Math.abs(row.value))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── FOOTER: Rupees | Net Amount ── */}
              <div className="po-footer-bottom">
                <div className="po-rupees-cell">
                  Rupees :&nbsp;{numberToWords(toNumber(po.netAmount)).toUpperCase()}
                </div>
                <div className="po-net-row">
                  <span className="po-net-label">Net Amount</span>
                  <span className="po-net-value">{formatMoney(po.netAmount)}</span>
                </div>
              </div>

              {/* ── SIGN ROW ── */}
              <div className="po-sign-row">
                <div className="po-sign-left">
                  {dispatchText && (
                    <div className="po-sign-dispatch">{dispatchText}</div>
                  )}
                  <div className="po-sign-juris">
                    <span>Subject To {selectedCompany?.city || ""} Jurisdiction</span>
                    <span>E. &amp; O. E.</span>
                  </div>
                </div>
                <div className="po-sign-right">
                  <div>For, {(selectedCompany?.name || "").toUpperCase()}</div>
                  <div style={{ fontWeight: 400, marginTop: "auto" }}>Authorised Signatory</div>
                </div>
              </div>

            </div>{/* /po-doc */}
          </div>{/* /po-print-root */}

        </div>{/* /po-preview-center */}
      </div>{/* /po-screen-wrap */}
    </>
  )
}

const btnStyle: CSSProperties = {
  display:"inline-flex", alignItems:"center", gap:6,
  padding:"7px 14px", background:"#b91c1c", color:"#fff",
  border:"none", borderRadius:6, cursor:"pointer",
  fontSize:13, fontWeight:600,
}

export default function POPrintPage() {
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
          <POPrintContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
