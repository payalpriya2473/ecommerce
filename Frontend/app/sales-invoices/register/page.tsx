"use client";
// sales-invoices/register/page.tsx

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, ArrowLeft, Loader2 } from "lucide-react";
import { salesInvoiceAPI } from "@/lib/api";
import {
  SalesInvoiceFormFields,
  EMPTY_SI_FORM,
  type SalesInvoiceFormValues,
  type SIItem,
} from "../SalesInvoiceForm";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

const countSerials = (srNo: string) =>
  srNo.split(",").map((s) => s.trim()).filter(Boolean).length;
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

type InvoiceNumberingConfig = {
  prefix?: string;
  suffix?: string;
  startNumber?: number;
  currentNumber?: number;
  resetFrequency?: "never" | "monthly" | "yearly";
  lastReset?: string | null;
};

function getFinancialYear(date = new Date()) {
  const year   = date.getFullYear();
  const fyStart = date.getMonth() >= 3 ? year : year - 1;
  const fyEnd   = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
}

function shouldAutoReset(lastReset?: string | null, resetFrequency?: "never" | "monthly" | "yearly") {
  if (!lastReset || !resetFrequency || resetFrequency === "never") return false;
  const now  = new Date();
  const last = new Date(lastReset);
  const getFY = (d: Date) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);
  if (resetFrequency === "monthly") return now.getFullYear() !== last.getFullYear() || now.getMonth() !== last.getMonth();
  if (resetFrequency === "yearly")  return getFY(now) !== getFY(last);
  return false;
}

function generateSalesBillNumber(config?: InvoiceNumberingConfig) {
  const nextNumber = shouldAutoReset(config?.lastReset, config?.resetFrequency)
    ? Number(config?.startNumber) || 1
    : Number(config?.currentNumber) || Number(config?.startNumber) || 1;
  return `${config?.prefix || ""}${String(nextNumber).padStart(4, "0")}/${getFinancialYear()}${config?.suffix || ""}`;
}

export default function SalesInvoiceRegisterPage() {
  const router = useRouter();
  const [formValues,   setFormValues]   = useState<SalesInvoiceFormValues>({ ...EMPTY_SI_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError,    setFormError]    = useState("");
  const [billLoading,  setBillLoading]  = useState(true);

  // ── Auto-fetch next bill number on mount ─────────────────────────────────
  useEffect(() => {
    const token = sessionStorage.getItem("authToken") || "";
    salesInvoiceAPI.getNextNumber(token)
      .then((res) => { if (res?.billNumber) setFormValues((prev) => ({ ...prev, billNumber: res.billNumber })); })
      .catch(() => {})
      .finally(() => setBillLoading(false));
  }, []);

  useEffect(() => {
    const loadFallbackBillNumber = async () => {
      if (billLoading || formValues.billNumber) return;
      const token = sessionStorage.getItem("authToken") || "";
      if (!token) return;
      try {
        const settingsRes = await fetch(`${API_BASE_URL}/settings/invoice`, { headers: { Authorization: `Bearer ${token}` } });
        if (!settingsRes.ok) throw new Error("Failed to load invoice settings");
        const settingsData = await settingsRes.json();
        const fallbackBillNumber = generateSalesBillNumber(settingsData?.si);
        setFormValues((prev) => (prev.billNumber ? prev : { ...prev, billNumber: fallbackBillNumber }));
      } catch { /* Keep empty */ }
    };
    void loadFallbackBillNumber();
  }, [billLoading, formValues.billNumber]);

  const handleChange = (updated: Partial<SalesInvoiceFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...updated }));
    setFormError("");
  };

  const handleItemsChange = (items: SIItem[]) => setFormValues((prev) => ({ ...prev, items }));

  const handleSubmit = async () => {
    setFormError("");
    if (!formValues.companyId)          { setFormError("Please select a company");            return; }
    if (!formValues.billNumber.trim())  { setFormError("Bill number could not be generated"); return; }
    if (!formValues.branchId)           { setFormError("Branch is required");                  return; }
    if (!formValues.partyName.trim())   { setFormError("Party / Customer name is required");   return; }

    const validItems = formValues.items.filter((i) => i.itemName.trim() && i.qty > 0);
    if (!validItems.length) { setFormError("Please add at least one item with name and quantity"); return; }

    for (const row of validItems) {
      const totalSerials = row.serialRows.reduce((s, r) => s + countSerials(r.srNo), 0);
      if (totalSerials === 0) {
        handleItemsChange(formValues.items.map((item) => item.id === row.id ? { ...item, showDescription: true, showSerialTable: true } : item));
        setFormError(`Serial / Barcode is required for "${row.itemName}".`);
        return;
      }
      if (totalSerials !== row.qty) {
        handleItemsChange(formValues.items.map((item) => item.id === row.id ? { ...item, showDescription: true, showSerialTable: true } : item));
        setFormError(`Serial count mismatch for "${row.itemName}": ${totalSerials} entered but qty is ${row.qty}.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const token     = sessionStorage.getItem("authToken") || "";
      const companyId = formValues.companyId || sessionStorage.getItem("companyId") || "";
      const totals    = buildInvoiceTotals(validItems, formValues);

      const payload = {
        companyId,
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
          // FIX: all per-item fields now included in payload
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

      const result = await salesInvoiceAPI.create(payload as any, token);
      if (result.success) {
        router.push("/sales-invoices/list");
      } else {
        setFormError(result.message || "Failed to create sale invoice");
      }
    } catch {
      setFormError("Failed to create sale invoice. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
                  <div className="flex-1">
                    <CardTitle className="text-2xl">New Sale Invoice</CardTitle>
                    <CardDescription>Create a sale invoice for a customer</CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-0.5">Bill Number</p>
                    {billLoading ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 size={13} className="animate-spin" />
                        <span className="text-sm">Generating…</span>
                      </div>
                    ) : (
                      <span className="inline-block bg-red-700 text-white font-mono font-bold text-base px-3 py-1 rounded-lg tracking-wide">
                        {formValues.billNumber || "—"}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SalesInvoiceFormFields
                  values={formValues}
                  onChange={handleChange}
                  onItemsChange={handleItemsChange}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/sales-invoices/list")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="add"
                  billLoading={billLoading}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
