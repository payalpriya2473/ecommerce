"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText, ArrowLeft, Edit, Package, CreditCard,
  AlertCircle, Calendar, User, Barcode, Building2,
  Banknote, Hash, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { brandAPI, itemAPI, salesInvoiceAPI } from "@/lib/api";
import { PermissionGate } from "@/components/PermissionGate";

const toNumber = (v: unknown) => Number(v) || 0;
const fmt = (amount: unknown) =>
  `₹${(Number(amount) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const countSerials = (srNo: string) =>
  srNo.split(",").map((s) => s.trim()).filter(Boolean).length;

// ── InfoRow helper ────────────────────────────────────────────────────────────
function InfoRow({ label, value, valueClass }: { label: string; value: React.ReactNode; valueClass?: string }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-border/30 last:border-0">
      <dt className="text-muted-foreground text-sm shrink-0">{label}</dt>
      <dd className={`font-medium text-sm text-right max-w-[220px] ${valueClass || ""}`}>{value}</dd>
    </div>
  );
}

// ── SummaryRow helper ─────────────────────────────────────────────────────────
function SummaryRow({
  label, value, valueClass, indent,
}: { label: string; value: string; valueClass?: string; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm py-1 ${indent ? "pl-3" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${valueClass || "text-foreground"}`}>{value}</span>
    </div>
  );
}

function DetailTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses = {
    default: "border-border/50 bg-muted/20",
    success: "border-emerald-200 bg-emerald-50",
    warning: "border-orange-200 bg-orange-50",
  };

  return (
    <div className={`rounded-xl border p-3 ${toneClasses[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-semibold text-foreground break-words">{value}</div>
    </div>
  );
}

// ── SerialNumbersDisplay ──────────────────────────────────────────────────────
interface SerialRowData { color?: string; srNo?: string; }

function SerialNumbersDisplay({ serialRows }: { serialRows: SerialRowData[] }) {
  if (!Array.isArray(serialRows) || serialRows.length === 0) return null;
  const colorMap = new Map<string, string[]>();
  const colorOrder: string[] = [];
  for (const r of serialRows) {
    const color = (r.color || "").trim();
    const parts = (r.srNo || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;
    if (!colorMap.has(color)) { colorMap.set(color, []); colorOrder.push(color); }
    colorMap.get(color)!.push(...parts);
  }
  const grouped = colorOrder.map((c) => ({ color: c, serials: colorMap.get(c)! })).filter((r) => r.serials.length > 0);
  if (grouped.length === 0) return null;
  const total = grouped.reduce((s, r) => s + r.serials.length, 0);
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Barcode className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground">
          Serial / Barcode <span className="text-orange-600 font-bold">({total} total)</span>
        </p>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2fr_3fr] bg-red-700 text-white text-xs font-semibold">
          <div className="px-3 py-2 border-r border-red-600">Color</div>
          <div className="px-3 py-2">S.No</div>
        </div>
        {grouped.map((row, idx) => (
          <div key={idx} className={`grid grid-cols-[2fr_3fr] border-b border-border/40 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-muted/10"}`}>
            <div className="px-3 py-2.5 border-r border-border/40">
              {row.color
                ? <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <span className="w-3 h-3 rounded-full border border-border/60 shrink-0 inline-block" style={{ backgroundColor: row.color.toLowerCase() }} />
                    {row.color}
                  </span>
                : <span className="text-xs italic text-muted-foreground">—</span>}
            </div>
            <div className="px-3 py-2.5 flex flex-wrap gap-1">
              {row.serials.map((s, sIdx) => (
                <span key={sIdx} className="inline-block text-[10px] font-mono px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded whitespace-nowrap">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SalesInvoiceViewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siId = searchParams.get("id") || "";

  const [si, setSI] = useState<any>(null);
  const [brandsById, setBrandsById] = useState<Record<string, string>>({});
  const [itemBrandById, setItemBrandById] = useState<Record<string, string>>({});
  const [itemBrandByName, setItemBrandByName] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { if (siId) fetchSI(); }, [siId]);

  const fetchSI = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await salesInvoiceAPI.getById(token, siId);
      if (result.success) {
        setSI(result.data);

        const companyId = result.data?.companyId ? String(result.data.companyId) : undefined;
        const brandResult = await brandAPI.getAll(token, companyId);
        if (brandResult?.success && Array.isArray(brandResult.data)) {
          setBrandsById(
            brandResult.data.reduce((acc: Record<string, string>, brand: any) => {
              if (brand?.id != null) acc[String(brand.id)] = brand.name || "";
              return acc;
            }, {})
          );
        }

        const itemResult = await itemAPI.getAll(token, companyId);
        if (itemResult?.success && Array.isArray(itemResult.data)) {
          setItemBrandById(
            itemResult.data.reduce((acc: Record<string, string>, item: any) => {
              if (item?.id != null && item?.brandName) acc[String(item.id)] = item.brandName;
              return acc;
            }, {})
          );

          setItemBrandByName(
            itemResult.data.reduce((acc: Record<string, string>, item: any) => {
              const itemName = String(item?.itemName || "").trim().toLowerCase();
              if (itemName && item?.brandName && !acc[itemName]) acc[itemName] = item.brandName;
              return acc;
            }, {})
          );
        }
      }
    } catch (err) {
      console.error("Error fetching SI:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading sale invoice...</p>
        </div>
      </div>
    );
  }

  if (!si) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Sale invoice not found</p>
          <Link href="/sales-invoices/list"><Button className="mt-4">Back to Invoices</Button></Link>
        </div>
      </div>
    );
  }

  // ── Normalise items ───────────────────────────────────────────────────────
  const items: any[] = Array.isArray(si.items)
    ? si.items
    : Array.isArray(si.invoiceItems)
    ? si.invoiceItems
    : Array.isArray(si.saleInvoiceItems)
    ? si.saleInvoiceItems
    : [];

  // ── Computed totals ───────────────────────────────────────────────────────
  const totalQty        = items.reduce((s, i) => s + toNumber(i.qty), 0);
  const grossAmount     = items.reduce((s, i) => s + toNumber(i.qty) * toNumber(i.rate), 0);
  const totalScheme     = items.reduce((s, i) => s + toNumber(i.scheme), 0);
  const totalDiscountRs = items.reduce((s, i) => s + toNumber(i.discountRs), 0);
  const taxableAmount   = items.reduce((s, i) => s + toNumber(i.amount), 0);
  const discountPercent = toNumber(si.discountPercent);
  const discountAmount  = (taxableAmount * discountPercent) / 100;
  const totalSGST       = items.reduce((s, i) => s + toNumber(i.sgstAmount), 0);
  const totalCGST       = items.reduce((s, i) => s + toNumber(i.cgstAmount), 0);
  const totalIGST       = items.reduce((s, i) => s + toNumber(i.igstAmount), 0);
  const totalInstallation = items.reduce((s, i) => s + toNumber(i.installation), 0);
  const isGujarat       = totalCGST > 0 || toNumber(si.cgst) > 0;

  // Net Amount — compute from items if items are present, fall back to stored value
  const netAmount = items.length > 0
    ? grossAmount
      - totalScheme
      - totalDiscountRs
      - discountAmount
      + toNumber(si.freightAmount)
      + toNumber(si.otherCharges)
      + toNumber(si.processingFees1)
      + toNumber(si.processingFees2)
      + toNumber(si.installationAmt)
      + totalInstallation
    : toNumber(si.netAmount);

  // Margin & Balance — stored or derived
  const margin  = toNumber(si.margin);
  const balance = toNumber(si.balance);

  // Installments — filter rows that have any value
  const installments: any[] = Array.isArray(si.installments)
    ? si.installments.filter((inst: any) => toNumber(inst.instAmt) > 0 || toNumber(inst.totalAmt) > 0)
    : [];

  // Financial rows
  const financialRows = [
    {
      id: "1",
      fComp: si.fComp1Name || si.fComp1 || "",
      fAmt: toNumber(si.fAmt1),
      dbd: toNumber(si.dbd1),
      processingFees: toNumber(si.processingFees1),
      fileNo: si.fileNo1 || "",
    },
    {
      id: "2",
      fComp: si.fComp2Name || si.fComp2 || "",
      fAmt: toNumber(si.fAmt2),
      dbd: toNumber(si.dbd2),
      processingFees: toNumber(si.processingFees2),
      fileNo: si.fileNo2 || "",
    },
  ].filter((r) => r.fAmt > 0 || r.fComp);

  const paymentMode = si.paymentAtDelivery ? "At Delivery" : "Standard";
  const paymentModeTone = si.paymentAtDelivery ? "success" : "default";
  const bookingValue = toNumber(si.booking) > 0 ? fmt(si.booking) : "—";
  const buyBackValue = toNumber(si.buyBack) > 0 ? fmt(si.buyBack) : "—";
  const bookDetails = [
    { label: "Cashbook", value: si.cashbookName || "—" },
    { label: "Bank Book", value: si.bankBookName || "—" },
    { label: "UTR #", value: si.utrNumber || "—" },
    { label: "Booking", value: bookingValue },
    { label: "Buy Back", value: buyBackValue },
  ];
  const getBrandLabel = (item: any) => {
    const directBrandName = String(item?.brandName || "").trim();
    if (directBrandName) return directBrandName;

    const brandFromItemId = item?.itemId ? itemBrandById[String(item.itemId)] : "";
    if (brandFromItemId) return brandFromItemId;

    const brandFromBrandId = item?.brandId ? brandsById[String(item.brandId)] : "";
    if (brandFromBrandId) return brandFromBrandId;

    const itemNameKey = String(item?.itemName || "").trim().toLowerCase();
    if (itemNameKey && itemBrandByName[itemNameKey]) return itemBrandByName[itemNameKey];

    return "—";
  };

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-6xl">

            {/* ── Header ── */}
            <div className="mb-6">
              <Button onClick={() => router.push("/sales-invoices/list")} className="mb-4 bg-red-700 hover:bg-red-800 text-white">
                <ArrowLeft className="h-4 w-4 mr-2" />Back
              </Button>
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Sale Invoice Details</h1>
                  <p className="text-muted-foreground mt-1">Complete information for bill {si.billNumber || "-"}</p>
                </div>
                <PermissionGate module="sales" action="update">
                  <Link href={`/sales-invoices/edit?id=${si.id}`}>
                    <Button className="bg-gradient-to-r from-red-700 to-red-700 hover:opacity-90">
                      <Edit className="h-4 w-4 mr-2" />Edit Invoice
                    </Button>
                  </Link>
                </PermissionGate>
              </div>
            </div>

            {/* ── Hero Card ── */}
            <Card className="mb-6 border-border/50 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-start gap-6">
                  <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                    <FileText className="h-10 w-10 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <h2 className="text-2xl font-bold mb-1">{si.billNumber || "-"}</h2>
                        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                          <Calendar className="h-4 w-4" />
                          <span className="text-sm">Bill Date: <strong className="text-foreground">{formatDate(si.billDate)}</strong></span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
                          <User className="h-4 w-4" />
                          <span className="text-sm">Party: <strong className="text-foreground">{si.partyName || si.customerName || "—"}</strong></span>
                        </div>
                        {si.mobileNo && <p className="text-xs text-muted-foreground">Mobile: {si.mobileNo}</p>}
                        {si.branchName && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Branch: {si.branchName}</p>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1.5">
                          Tax Mode:{" "}
                          <span className={`font-semibold ${isGujarat ? "text-blue-600" : "text-orange-600"}`}>
                            {isGujarat ? "SGST + CGST (Gujarat)" : "IGST (Inter-state)"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-2xl font-bold text-primary">{fmt(netAmount)}</p>
                        <p className="text-xs text-muted-foreground">Net Amount</p>
                        {margin > 0 && (
                          <p className="text-sm font-semibold text-blue-600">
                            Margin: {fmt(margin)}
                          </p>
                        )}
                        {balance > 0 && (
                          <p className="text-sm font-semibold text-orange-600">
                            Balance: {fmt(balance)}
                          </p>
                        )}
                        {si.category && <Badge variant="outline" className="mt-1">{si.category}</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── Info Grid ── */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Customer */}
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <User className="h-5 w-5 text-accent" /> Customer Information
                  </h3>
                  <dl className="space-y-0">
                    <InfoRow label="Party Name"  value={si.partyName || "—"} />
                    <InfoRow label="Address"     value={si.address} />
                    <InfoRow label="City / Village" value={si.partyCityVillage} />
                    <InfoRow label="Mobile"      value={si.mobileNo} />
                    <InfoRow label="Aadhaar"     value={si.adharNo} />
                    {si.reference1 && (
                      <>
                        <InfoRow label="Reference 1"         value={si.reference1} />
                        <InfoRow label="Ref 1 Mobile"        value={si.reference1Mobile} />
                        <InfoRow label="Ref 1 Address"       value={si.reference1Address} />
                        <InfoRow label="Ref 1 City"          value={si.reference1City} />
                      </>
                    )}
                    {si.reference2 && (
                      <>
                        <InfoRow label="Reference 2"         value={si.reference2} />
                        <InfoRow label="Ref 2 Mobile"        value={si.reference2Mobile} />
                        <InfoRow label="Ref 2 Address"       value={si.reference2Address} />
                        <InfoRow label="Ref 2 City"          value={si.reference2City} />
                      </>
                    )}
                  </dl>
                </CardContent>
              </Card>

              {/* Payment & Other */}
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-accent" /> Payment & Other Info
                  </h3>
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DetailTile
                        label="Branch"
                        value={
                          <span className="inline-flex items-start gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <span>{si.branchName || "—"}</span>
                          </span>
                        }
                      />
                      <DetailTile
                        label="Payment Mode"
                        tone={paymentModeTone}
                        value={
                          <span className="inline-flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{paymentMode}</span>
                          </span>
                        }
                      />
                      <DetailTile
                        label="MOP"
                        value={
                          <span className="inline-flex items-center gap-2">
                            <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{si.mop || "—"}</span>
                          </span>
                        }
                      />
                      <DetailTile
                        label="Salesman"
                        value={
                          <span className="inline-flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{si.salesmanName || "—"}</span>
                          </span>
                        }
                      />
                    </div>

                    <div className="rounded-xl border border-border/50 bg-white overflow-hidden">
                      <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                        <p className="text-sm font-semibold">Payment Details</p>
                      </div>
                      <dl className="px-4 py-2">
                        {bookDetails.map((detail) => (
                          <InfoRow key={detail.label} label={detail.label} value={detail.value} />
                        ))}
                      </dl>
                    </div>

                    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                      <p className="text-sm font-semibold mb-2">Remarks</p>
                      <p className="text-sm leading-6 text-foreground whitespace-pre-wrap min-h-[72px]">
                        {si.remarks || "No additional payment notes for this invoice."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Items Table ── */}
            <Card className="border-border/50 shadow-sm mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">Items ({items.length})</h3>
                </div>
                <style>{`
                  .si-view-table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
                  .si-view-table th { border: 1px solid rgba(255,255,255,0.25); padding: 8px 10px; font-size: 11px; font-weight: 600; white-space: nowrap; }
                  .si-view-table td { border: 1px solid #d1d5db; padding: 6px 10px; }
                  .si-view-table tbody tr:hover td { background-color: #f9fafb; }
                `}</style>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="si-view-table">
                    <thead>
                      <tr className="bg-red-700 text-white">
                        <th style={{ width: "40px" }}>#</th>
                        <th style={{ width: "120px" }}>Brand</th>
                        <th style={{ width: "160px" }}>Item Name</th>
                        <th style={{ width: "140px" }}>Variant</th>
                        <th style={{ width: "60px", textAlign: "right" }}>Qty</th>
                        <th style={{ width: "90px", textAlign: "right" }}>Rate</th>
                        <th style={{ width: "90px", textAlign: "right" }}>Amount</th>
                        <th style={{ width: "80px", textAlign: "right" }}>Scheme</th>
                        <th style={{ width: "70px", textAlign: "right" }}>Disc %</th>
                        <th style={{ width: "80px", textAlign: "right" }}>Disc Rs</th>
                        {isGujarat ? (
                          <>
                            <th style={{ width: "80px", textAlign: "right" }}>S.GST</th>
                            <th style={{ width: "80px", textAlign: "right" }}>C.GST</th>
                          </>
                        ) : (
                          <th style={{ width: "80px", textAlign: "right" }}>I.GST</th>
                        )}
                        <th style={{ width: "80px", textAlign: "right" }}>Incentive</th>
                        <th style={{ width: "80px", textAlign: "right" }}>Buyback</th>
                        <th style={{ width: "90px", textAlign: "right" }}>Installation</th>
                        <th style={{ width: "110px", textAlign: "right" }}>Booking Amount</th>
                        <th style={{ width: "70px", textAlign: "center" }}>Demo</th>
                        <th style={{ width: "90px", textAlign: "center" }}>Self Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any, index: number) => {
                        const totalSerials = Array.isArray(item.serialRows)
                          ? item.serialRows.reduce((s: number, r: any) => s + countSerials(r.srNo || ""), 0)
                          : 0;
                        const hasDetail = item.remarks || totalSerials > 0;
                        return [
                          <tr key={`row-${item.id || index}`} className={index % 2 !== 0 ? "bg-muted/30" : ""}>
                            <td style={{ color: "#6b7280", fontSize: "11px" }}>{index + 1}</td>
                            <td style={{ fontSize: "11px" }}>{getBrandLabel(item)}</td>
                            <td style={{ fontSize: "11px", fontWeight: 500 }}>{item.itemName || "—"}</td>
                            <td style={{ fontSize: "11px" }}>{item.variant || "—"}</td>
                            <td style={{ fontSize: "11px", fontWeight: 500, color: "#dc2626", textAlign: "right" }}>{item.qty}</td>
                            <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.rate)}</td>
                            <td style={{ fontSize: "11px", fontWeight: 500, color: "#dc2626", textAlign: "right" }}>{fmt(item.amount)}</td>
                            <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.scheme)}</td>
                            <td style={{ fontSize: "11px", textAlign: "right" }}>{Number(item.discountPercent || 0).toFixed(2)}%</td>
                            <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.discountRs)}</td>
                            {isGujarat ? (
                              <>
                                <td style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: "10px", color: "#6b7280" }}>{Number(item.sgstPercent || 0)}%</div>
                                  <div style={{ fontSize: "11px", fontWeight: 500 }}>{fmt(item.sgstAmount)}</div>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: "10px", color: "#6b7280" }}>{Number(item.cgstPercent || 0)}%</div>
                                  <div style={{ fontSize: "11px", fontWeight: 500 }}>{fmt(item.cgstAmount)}</div>
                                </td>
                              </>
                            ) : (
                              <td style={{ textAlign: "right" }}>
                                <div style={{ fontSize: "10px", color: "#6b7280" }}>{Number(item.igstPercent || 0)}%</div>
                                <div style={{ fontSize: "11px", fontWeight: 500 }}>{fmt(item.igstAmount)}</div>
                              </td>
                            )}
                            <td style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "10px", color: "#6b7280" }}>{Number(item.incPercent || 0)}%</div>
                              <div style={{ fontSize: "11px", fontWeight: 500 }}>
                                {fmt((toNumber(si.margin) * toNumber(item.incPercent || 0)) / 100)}
                              </div>
                            </td>
                            <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.buyBack)}</td>
                            <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.installation)}</td>
                            <td style={{ fontSize: "11px", textAlign: "right" }}>{fmt(item.bookingAmount)}</td>
                            <td style={{ fontSize: "11px", textAlign: "center", fontWeight: 600 }}>{item.demo ? "Yes" : "No"}</td>
                            <td style={{ fontSize: "11px", textAlign: "center", fontWeight: 600 }}>{item.selfDelivery ? "Yes" : "No"}</td>
                          </tr>,
                          hasDetail ? (
                            <tr key={`detail-${item.id || index}`} style={{ backgroundColor: "#f8fafc" }}>
                              <td colSpan={isGujarat ? 18 : 17} style={{ padding: "10px 14px" }}>
                                <div className="space-y-3 text-xs">
                                  {item.remarks && (
                                    <div>
                                      <p className="font-semibold text-muted-foreground mb-1">Remarks</p>
                                      <p className="text-foreground whitespace-pre-wrap">{item.remarks}</p>
                                    </div>
                                  )}
                                  {totalSerials > 0 && <SerialNumbersDisplay serialRows={item.serialRows} />}
                                </div>
                              </td>
                            </tr>
                          ) : null,
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ── Installments ── */}
            {installments.length > 0 && (
              <Card className="border-border/50 shadow-sm mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Hash className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold">Installments</h3>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.875rem" }}>
                      <thead>
                        <tr className="bg-red-700 text-white">
                          {["#", "Inst. Amt.", "No. of Inst.", "Total Amt.", "Start Date", "Days"].map((h) => (
                            <th key={h} style={{ border: "1px solid rgba(255,255,255,0.25)", padding: "8px 12px", fontSize: "11px", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {installments.map((inst: any, idx: number) => (
                          <tr key={inst.id || idx} style={{ backgroundColor: idx % 2 === 0 ? "white" : "#f9fafb" }}>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 10px", textAlign: "center", fontSize: "11px", color: "#6b7280", fontWeight: 600 }}>{idx + 1}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 10px", textAlign: "right", fontSize: "12px", fontWeight: 500 }}>{fmt(inst.instAmt)}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 10px", textAlign: "center", fontSize: "12px" }}>{inst.noOfInst || "—"}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 10px", textAlign: "right", fontSize: "12px", fontWeight: 600, color: "#dc2626" }}>{fmt(inst.totalAmt)}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 10px", textAlign: "center", fontSize: "12px" }}>
                              {inst.stDate ? new Date(inst.stDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                            </td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 10px", textAlign: "center", fontSize: "12px" }}>{inst.days || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Financial Details ── */}
            {financialRows.length > 0 && (
              <Card className="border-border/50 shadow-sm mb-6">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Banknote className="h-5 w-5 text-accent" />
                    <h3 className="text-lg font-semibold">Financial Details</h3>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.875rem" }}>
                      <thead>
                        <tr className="bg-red-700 text-white">
                          {["#", "Finance Company", "F. Amount", "DBD", "Processing Fees", "File #"].map((h) => (
                            <th key={h} style={{ border: "1px solid rgba(255,255,255,0.25)", padding: "8px 12px", fontSize: "11px", fontWeight: 600, textAlign: h === "#" ? "center" : "left", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {financialRows.map((row, idx) => (
                          <tr key={row.id} style={{ backgroundColor: idx % 2 === 0 ? "white" : "#f9fafb" }}>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 10px", textAlign: "center", fontSize: "11px", color: "#6b7280", fontWeight: 600 }}>{idx + 1}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 12px", fontSize: "12px", fontWeight: 500 }}>{row.fComp || "—"}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 12px", fontSize: "12px", fontWeight: 600, color: "#dc2626" }}>{fmt(row.fAmt)}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 12px", fontSize: "12px" }}>{row.dbd > 0 ? fmt(row.dbd) : "—"}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 12px", fontSize: "12px" }}>{row.processingFees > 0 ? fmt(row.processingFees) : "—"}</td>
                            <td style={{ border: "1px solid #d1d5db", padding: "6px 12px", fontSize: "12px", fontFamily: "monospace" }}>{row.fileNo || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Financial Summary ── */}
            <Card className="border-border/50 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">Financial Summary</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Left column */}
                  <div className="space-y-0 divide-y divide-border/30">
                    <SummaryRow label="Qty Total"      value={totalQty.toString()}          valueClass="text-red-600 font-semibold" />
                    <SummaryRow label="Gross Amount"   value={fmt(grossAmount)}              valueClass="text-red-600 font-semibold" />
                    {totalScheme > 0 && (
                      <SummaryRow label="Scheme"       value={`- ${fmt(totalScheme)}`}      valueClass="text-green-600 font-semibold" />
                    )}
                    {totalDiscountRs > 0 && (
                      <SummaryRow label="Item Disc. (₹)" value={`- ${fmt(totalDiscountRs)}`} valueClass="text-green-600 font-semibold" />
                    )}
                    {discountAmount > 0 && (
                      <SummaryRow label={`Disc. (${discountPercent}%)`} value={`- ${fmt(discountAmount)}`} valueClass="text-red-600 font-semibold" />
                    )}
                    {isGujarat ? (
                      <>
                        <SummaryRow label="S.GST" value={fmt(totalSGST)} valueClass="text-red-600 font-semibold" />
                        <SummaryRow label="C.GST" value={fmt(totalCGST)} valueClass="text-red-600 font-semibold" />
                      </>
                    ) : (
                      <SummaryRow label="I.GST" value={fmt(totalIGST)} valueClass="text-red-600 font-semibold" />
                    )}
                    {toNumber(si.freightAmount) > 0 && (
                      <SummaryRow label="Freight"        value={fmt(si.freightAmount)}      valueClass="text-red-600 font-semibold" />
                    )}
                    {toNumber(si.installationAmt) > 0 && (
                      <SummaryRow label="Installation"   value={fmt(si.installationAmt)}    valueClass="text-red-600 font-semibold" />
                    )}
                    {toNumber(si.otherCharges) > 0 && (
                      <SummaryRow label="Other Charges"  value={fmt(si.otherCharges)}       valueClass="text-red-600 font-semibold" />
                    )}
                  </div>

                  {/* Right column */}
                  <div className="space-y-0 divide-y divide-border/30">
                    <div className="flex justify-between items-center py-2 text-base font-bold">
                      <span>Net Amount</span>
                      <span className="text-primary text-lg">{fmt(netAmount)}</span>
                    </div>

                    {toNumber(si.fAmt1) > 0 && (
                      <SummaryRow label={`Finance Amt 1${si.fComp1Name ? ` (${si.fComp1Name})` : ""}`}
                        value={fmt(si.fAmt1)} valueClass="font-semibold" />
                    )}
                    {toNumber(si.fAmt2) > 0 && (
                      <SummaryRow label={`Finance Amt 2${si.fComp2Name ? ` (${si.fComp2Name})` : ""}`}
                        value={fmt(si.fAmt2)} valueClass="font-semibold" />
                    )}

                    {installments.length > 0 && (
                      <SummaryRow
                        label={`Installments (${installments.length})`}
                        value={fmt(installments.reduce((s: number, i: any) => s + toNumber(i.totalAmt), 0))}
                        valueClass="font-semibold"
                      />
                    )}

                    {margin !== 0 && (
                      <div className="flex justify-between items-center py-2 text-sm font-semibold">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <ChevronRight className="h-3.5 w-3.5" />
                          Margin <span className="text-[10px] font-normal bg-muted px-1.5 py-0.5 rounded ml-1">auto</span>
                        </span>
                        <span className="text-blue-600">{fmt(margin)}</span>
                      </div>
                    )}
                    {balance !== 0 && (
                      <div className="flex justify-between items-center py-2 text-sm font-semibold">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <ChevronRight className="h-3.5 w-3.5" />
                          Balance <span className="text-[10px] font-normal bg-muted px-1.5 py-0.5 rounded ml-1">auto</span>
                        </span>
                        <span className="text-orange-600">{fmt(balance)}</span>
                      </div>
                    )}

                    {toNumber(si.cashMargin) > 0 && (
                      <SummaryRow label="Cash Margin"   value={fmt(si.cashMargin)}    valueClass="font-semibold" />
                    )}
                    {toNumber(si.onlineMargin) > 0 && (
                      <SummaryRow label="Online Margin" value={fmt(si.onlineMargin)}  valueClass="font-semibold" />
                    )}
                    {toNumber(si.booking) > 0 && (
                      <SummaryRow label="Booking"       value={fmt(si.booking)}       valueClass="font-semibold" />
                    )}
                    {toNumber(si.buyBack) > 0 && (
                      <SummaryRow label="Buy Back"      value={`- ${fmt(si.buyBack)}`} valueClass="text-green-600 font-semibold" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
