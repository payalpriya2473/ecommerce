"use client";
// sales-invoices/edit/page.tsx

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { salesInvoiceAPI } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import Link from "next/link";
import {
  SalesInvoiceFormFields,
  EMPTY_SI_FORM,
  type SalesInvoiceFormValues,
  type SIItem,
  type Installment,
  type SerialRow,
} from "../SalesInvoiceForm";
import { normalizeVariantLabel } from "@/lib/item-variant-utils";

const genId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
const countSerials = (srNo: string) => srNo.split(",").map((s) => s.trim()).filter(Boolean).length;
const toNumber = (v: unknown) => Number(v) || 0;

function buildInvoiceTotals(validItems: SIItem[], values: SalesInvoiceFormValues) {
  const grossAmount       = validItems.reduce((s, i) => s + toNumber(i.qty) * toNumber(i.rate), 0);
  const totalScheme       = validItems.reduce((s, i) => s + toNumber(i.scheme), 0);
  const totalDiscountRs   = validItems.reduce((s, i) => s + toNumber(i.discountRs), 0);
  const taxableAmount   = validItems.reduce((s, i) => s + toNumber(i.amount), 0);
  const discountAmount  = (taxableAmount * toNumber(values.discountPercent)) / 100;
  const sgst            = validItems.reduce((s, i) => s + toNumber(i.sgstAmount), 0);
  const cgst            = validItems.reduce((s, i) => s + toNumber(i.cgstAmount), 0);
  const igst            = validItems.reduce((s, i) => s + toNumber(i.igstAmount), 0);
  const totalInstallation = validItems.reduce((s, i) => s + toNumber(i.installation), 0);
  const totalAmount     = taxableAmount;
  const netAmount       =
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
  return { discountAmount, sgst, cgst, igst, totalAmount, netAmount: Math.round(netAmount) };
}

function normalizeSerialRows(rawRows: any[]): SerialRow[] {
  if (!Array.isArray(rawRows) || rawRows.length === 0)
    return [{ id: genId(), color: "", srNo: "" }];
  const looksOld = rawRows.every((r) => { const s: string = r.srNo || ""; return s.trim().length > 0 && !s.includes(","); });
  if (looksOld) {
    const colorMap = new Map<string, string[]>(); const colorOrder: string[] = [];
    for (const r of rawRows) {
      const key = (r.color || "").trim();
      if (!colorMap.has(key)) { colorMap.set(key, []); colorOrder.push(key); }
      if (r.srNo?.trim()) colorMap.get(key)!.push(r.srNo.trim());
    }
    const merged = colorOrder.map((key) => ({ id: genId(), color: key, srNo: colorMap.get(key)!.join(",") + (colorMap.get(key)!.length > 0 ? "," : "") }));
    return merged.length > 0 ? merged : [{ id: genId(), color: "", srNo: "" }];
  }
  return rawRows.map((r) => ({ id: r.id || genId(), color: r.color || "", srNo: r.srNo || "" }));
}

function pickNumber(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== "") { const num = Number(value); if (!Number.isNaN(num)) return num; }
  }
  return 0;
}

export default function SalesInvoiceEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siId = searchParams.get("id") || "";
  const { canEdit } = usePermissions();

  const [isLoading,    setIsLoading]    = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError,    setFormError]    = useState("");
  const [success,      setSuccess]      = useState(false);
  const [loadError,    setLoadError]    = useState("");
  const [formValues,   setFormValues]   = useState<SalesInvoiceFormValues>({ ...EMPTY_SI_FORM });

  useEffect(() => {
    if (!siId) { setLoadError("Sale invoice ID is missing"); setIsLoading(false); return; }
    fetchSI();
  }, [siId]);

  const fetchSI = async () => {
    try {
      const token = sessionStorage.getItem("authToken") || "";
      const result = await salesInvoiceAPI.getById(token, siId);
      if (!result.success) { setLoadError("Failed to load sale invoice"); return; }
      const si = result.data;

      const itemSource = Array.isArray(si.items) ? si.items
        : Array.isArray(si.invoiceItems) ? si.invoiceItems
        : Array.isArray(si.saleInvoiceItems) ? si.saleInvoiceItems : [];

      const mappedItems: SIItem[] = itemSource.map((item: any) => ({
        id:              item.id || genId(),
        itemId:          item.itemId  || "",
        brandId:         item.brandId || "",
        variantId:       item.variantId || item.variant || "",
        variant:         normalizeVariantLabel(item.variant),
        brandName:       item.brandName  || "",
        itemName:        item.itemName   || "",
        remarks:         item.remarks    || "",
        qty:             pickNumber(item, ["qty", "quantity"]),
        rate:            pickNumber(item, ["rate"]),
        amount:          pickNumber(item, ["amount", "taxableAmount"]),
        scheme:          pickNumber(item, ["scheme"]),
        discountPercent: pickNumber(item, ["discountPercent", "disc_percent"]),
        discountRs:      pickNumber(item, ["discountRs", "disc_rs", "discount"]),
        incPercent:      pickNumber(item, ["incPercent", "inc_percent", "incentivePercent"]),
        gstPercent:      pickNumber(item, ["gstPercent", "gstRate", "gst"]),
        sgstPercent:     pickNumber(item, ["sgstPercent"]),
        sgstAmount:      pickNumber(item, ["sgstAmount", "sgst"]),
        cgstPercent:     pickNumber(item, ["cgstPercent"]),
        cgstAmount:      pickNumber(item, ["cgstAmount", "cgst"]),
        igstPercent:     pickNumber(item, ["igstPercent"]),
        igstAmount:      pickNumber(item, ["igstAmount", "igst"]),
        // FIX: load all per-item fields
        incentive:       pickNumber(item, ["incentive"]),
        buyBack:         pickNumber(item, ["buyBack", "buyback"]),
        installation:    pickNumber(item, ["installation"]),
        bookingAmount:   pickNumber(item, ["bookingAmount", "booking_amount"]),
        demo:            Boolean(item.demo),
        selfDelivery:    Boolean(item.selfDelivery ?? item.self_delivery),
        serialRows:      normalizeSerialRows(item.serialRows || []),
        showDescription: false,
        showSerialTable: false,
      }));

      const mappedInstallments: Installment[] = Array.isArray(si.installments) && si.installments.length > 0
        ? si.installments.map((inst: any) => ({ id: inst.id || genId(), instAmt: Number(inst.instAmt) || 0, noOfInst: Number(inst.noOfInst) || 0, totalAmt: Number(inst.totalAmt) || 0, stDate: inst.stDate ? inst.stDate.split("T")[0] : "", days: Number(inst.days) || 0 }))
        : EMPTY_SI_FORM.installments;

      setFormValues({
        companyId:         String(si.companyId || sessionStorage.getItem("companyId") || ""),
        branchId:          si.branchId ? String(si.branchId) : "",
        billNumber:        si.billNumber || "",
        billDate:          si.billDate ? si.billDate.split("T")[0] : new Date().toISOString().split("T")[0],
        customerId:        si.customerId || "",
        partyName:         si.partyName || si.customerName || "",
        address:           si.address || "",
        partyCityVillage:  si.partyCityVillage || "",
        mobileNo:          si.mobileNo  || "",
        adharNo:           si.adharNo   || "",
        reference1:        si.reference1 || "",
        reference1Address: si.reference1Address || "",
        reference1City:    si.reference1City || "",
        reference1Mobile:  si.reference1Mobile || "",
        reference2:        si.reference2 || "",
        reference2Address: si.reference2Address || "",
        reference2City:    si.reference2City || "",
        reference2Mobile:  si.reference2Mobile || "",
        otpVerified:       Boolean(si.otpVerified),
        items:             mappedItems.length > 0 ? mappedItems : EMPTY_SI_FORM.items,
        discountPercent:   Number(si.discountPercent)  || 0,
        freightAmount:     Number(si.freightAmount)    || 0,
        scheme:            Number(si.scheme)           || 0,
        otherCharges:      Number(si.otherCharges)     || 0,
        processingFees1:   Number(si.processingFees1)  || 0,
        processingFees2:   Number(si.processingFees2)  || 0,
        installationAmt:   Number(si.installationAmt)  || 0,
        mop:               si.mop || "",
        booking:           Number(si.booking)  || 0,
        buyBack:           Number(si.buyBack)  || 0,
        fAmt1: Number(si.fAmt1) || 0, fComp1: si.fComp1 || "",
        fAmt2: Number(si.fAmt2) || 0, fComp2: si.fComp2 || "",
        dbd1: Number(si.dbd1) || 0, dbd2: Number(si.dbd2) || 0,
        fileNo1: si.fileNo1 || "",
        fileNo2: si.fileNo2 || "",
        salesmanId:        si.salesmanId ? String(si.salesmanId) : "",
        installments:      mappedInstallments,
        paymentAtDelivery: Boolean(si.paymentAtDelivery),
        remarks:           si.remarks || "",
        margin:            Number(si.margin)       || 0,
        cashMargin:        Number(si.cashMargin)   || 0,
        onlineMargin:      Number(si.onlineMargin) || 0,
        balance:           Number(si.balance)      || 0,
        cashbookId:        si.cashbookId  ? String(si.cashbookId)  : "",
        bankBookId:        si.bankBookId  ? String(si.bankBookId)  : "",
        utrNumber:         si.utrNumber || "",
      });
    } catch {
      setLoadError("Failed to load sale invoice");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (updated: Partial<SalesInvoiceFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...updated }));
    setFormError(""); setSuccess(false);
  };
  const handleItemsChange = (items: SIItem[]) => setFormValues((prev) => ({ ...prev, items }));

  const handleSubmit = async () => {
    setFormError("");
    if (!formValues.companyId)         { setFormError("Please select a company"); return; }
    if (!formValues.billNumber.trim()) { setFormError("Bill number is required"); return; }
    if (!formValues.branchId)          { setFormError("Branch is required"); return; }
    if (!formValues.partyName.trim())  { setFormError("Party / Customer name is required"); return; }

    const validItems = formValues.items.filter((i) => i.itemName.trim() && i.qty > 0);
    if (!validItems.length) { setFormError("Please add at least one item with name and quantity"); return; }

    for (const row of validItems) {
      const totalSerials = row.serialRows.reduce((s, r) => s + countSerials(r.srNo), 0);
      if (totalSerials === 0) { handleItemsChange(formValues.items.map((item) => item.id === row.id ? { ...item, showDescription: true, showSerialTable: true } : item)); setFormError(`Serial / Barcode is required for "${row.itemName}".`); return; }
      if (totalSerials !== row.qty) { handleItemsChange(formValues.items.map((item) => item.id === row.id ? { ...item, showDescription: true, showSerialTable: true } : item)); setFormError(`Serial count mismatch for "${row.itemName}": ${totalSerials} serials but qty is ${row.qty}.`); return; }
    }

    setIsSubmitting(true);
    try {
      const token  = sessionStorage.getItem("authToken") || "";
      const totals = buildInvoiceTotals(validItems, formValues);

      const payload = {
        companyId:         formValues.companyId || sessionStorage.getItem("companyId") || "",
        branchId:          formValues.branchId,
        billNumber:        formValues.billNumber,
        billDate:          formValues.billDate,
        partyName:         formValues.partyName,
        customerId:        formValues.customerId || null,
        address:           formValues.address,
        partyCityVillage:  formValues.partyCityVillage,
        mobileNo:          formValues.mobileNo,
        adharNo:           formValues.adharNo,
        reference1:        formValues.reference1,
        reference1Address: formValues.reference1Address,
        reference1City:    formValues.reference1City,
        reference1Mobile:  formValues.reference1Mobile,
        reference2:        formValues.reference2,
        reference2Address: formValues.reference2Address,
        reference2City:    formValues.reference2City,
        reference2Mobile:  formValues.reference2Mobile,
        otpVerified:       formValues.otpVerified,
        discountPercent:   formValues.discountPercent,
        discountAmount:    totals.discountAmount,
        freightAmount:     formValues.freightAmount,
        scheme:            formValues.scheme,
        otherCharges:      formValues.otherCharges,
        processingFees1:   formValues.processingFees1,
        processingFees2:   formValues.processingFees2,
        installationAmt:   formValues.installationAmt,
        totalAmount:       totals.totalAmount,
        sgst:              totals.sgst,
        cgst:              totals.cgst,
        igst:              totals.igst,
        netAmount:         totals.netAmount,
        mop:               formValues.mop,
        booking:           formValues.booking,
        buyBack:           formValues.buyBack,
        fAmt1: formValues.fAmt1, fComp1: formValues.fComp1,
        fAmt2: formValues.fAmt2, fComp2: formValues.fComp2,
        dbd1:  formValues.dbd1,  dbd2:   formValues.dbd2,
        fileNo1: formValues.fileNo1, fileNo2: formValues.fileNo2,
        salesmanId:        formValues.salesmanId || null,
        margin:            formValues.margin,
        cashMargin:        formValues.cashMargin,
        onlineMargin:      formValues.onlineMargin,
        balance:           formValues.balance,
        cashbookId:        formValues.cashbookId || null,
        bankBookId:        formValues.bankBookId || null,
        utrNumber:         formValues.utrNumber,
        paymentAtDelivery: formValues.paymentAtDelivery,
        remarks:           formValues.remarks,
        installments: formValues.installments.filter((i) => i.instAmt > 0),
        items: validItems.map((i) => ({
          itemId:          i.itemId  || null,
          brandId:         i.brandId || null,
          variantId:       i.variantId || null,
          variant:         i.variant || null,
          itemName:        i.itemName,
          brandName:       i.brandName || null,
          remarks:         i.remarks || null,
          qty:             i.qty,
          rate:            i.rate,
          amount:          i.amount,
          scheme:          i.scheme,
          discountPercent: i.discountPercent,
          discountRs:      i.discountRs,
          gstPercent:      i.gstPercent,
          incPercent:      i.incPercent,
          sgstPercent:     i.sgstPercent,
          sgstAmount:      i.sgstAmount,
          cgstPercent:     i.cgstPercent,
          cgstAmount:      i.cgstAmount,
          igstPercent:     i.igstPercent,
          igstAmount:      i.igstAmount,
          // FIX: all per-item fields now included
          incentive:       parseFloat(((toNumber(i.amount) * toNumber(i.incPercent)) / 100).toFixed(2)),
          buyBack:         i.buyBack,
          installation:    i.installation,
          bookingAmount:   i.bookingAmount,
          demo:            i.demo ? 1 : 0,
          selfDelivery:    i.selfDelivery ? 1 : 0,
          serialRows: i.serialRows.filter((r) => r.srNo.trim()).map((r) => ({
            color: r.color || null,
            srNo:  r.srNo.trim(),
          })),
        })),
      };

      const result = await salesInvoiceAPI.update(siId, payload as any, token);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/sales-invoices/list"), 600);
      } else {
        setFormError(result.message || "Failed to update sale invoice");
      }
    } catch {
      setFormError("Failed to update sale invoice. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canEdit("sales")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center mb-6">You don&apos;t have permission to edit sale invoices.</p>
            <Link href="/sales-invoices/list"><Button>View Invoices</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">
            <Button variant="ghost" onClick={() => router.push("/sales-invoices/list")} className="mb-4 bg-red-700 text-white hover:bg-red-800">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                    <FileText className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Edit Sale Invoice</CardTitle>
                    <CardDescription>Update sale invoice details</CardDescription>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-muted-foreground">Mode</p>
                    <p className="text-xl font-bold text-primary">Edit</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {success && (
                  <Alert className="mb-4 border-green-500 bg-green-50">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">Sale invoice updated successfully.</AlertDescription>
                  </Alert>
                )}
                <SalesInvoiceFormFields
                  values={formValues}
                  onChange={handleChange}
                  onItemsChange={handleItemsChange}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/sales-invoices/list")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="edit"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
