"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, FileText, Mail, Save, Store } from "lucide-react";
import { onlineStoreSettingsAPI, type OnlineStoreSettings } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { INDIAN_STATES } from "@/lib/indian-states";
import { EmailHealthCard } from "./EmailHealthCard";

const EMPTY: OnlineStoreSettings = {
  legalName: "",
  tradeName: "AppleNext",
  gstin: "",
  pan: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "Gujarat",
  pinCode: "",
  phone: "",
  email: "",
  website: "https://shop.applenext.in",
  alertEmail: "",
  invoicePrefix: "WEB/",
  invoiceTerms: "",
  sendCustomerEmails: true,
};

const EMAIL_FLOW: [string, string, string][] = [
  ["Order placed", "COD order placed, or online payment received", "Customer + Store"],
  ["Payment failed", "Razorpay payment failed", "Customer"],
  ["Confirmed", "Admin confirms the order (stock deducted)", "Customer"],
  ["Packed", "Admin marks packed", "Customer"],
  ["Shipped", "Admin ships — courier, AWB and GST invoice PDF attached", "Customer"],
  ["Out for delivery", "Admin marks out for delivery", "Customer"],
  ["Delivered", "Admin marks delivered (COD marked paid)", "Customer"],
  ["Cancelled", "Customer or admin cancels (refund info included)", "Customer + Store if by customer"],
  ["Returned", "Admin marks returned", "Customer"],
  ["Refund initiated / completed", "Razorpay refund started / confirmed, or manual refund recorded", "Customer"],
  ["Payment alert", "Amount mismatch, payment after cancel, refund failure", "Store"],
];

export default function OnlineStoreSettingsPage() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("online_orders", "edit");
  const [form, setForm] = useState<OnlineStoreSettings>(EMPTY);
  const [nextInvoice, setNextInvoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    onlineStoreSettingsAPI
      .get(token)
      .then((result) => {
        if (result.success) {
          setForm({ ...EMPTY, ...result.data });
          setNextInvoice(result.data.nextInvoicePreview || "");
          if (!result.data.configured) setError("Settings table not found — run online_orders_invoice_email_queries.sql in phpMyAdmin, then fill this form.");
        } else setError(result.message || "Failed to load settings");
      })
      .catch(() => setError("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof OnlineStoreSettings>(key: K, value: OnlineStoreSettings[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      const result = await onlineStoreSettingsAPI.save(token, form);
      if (result.success) {
        setForm({ ...EMPTY, ...result.data });
        setNextInvoice(result.data.nextInvoicePreview || "");
        setSuccess(result.message || "Saved");
        setTimeout(() => setSuccess(""), 3000);
      } else setError(result.message || "Could not save");
    } catch {
      setError("Could not save");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof OnlineStoreSettings, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={String(form[key] ?? "")}
        disabled={!canEdit}
        onChange={(e) => set(key, e.target.value as never)}
        {...props}
      />
    </div>
  );

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4 md:px-6 lg:px-8 max-w-5xl">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Online Store</h1>
              <p className="text-muted-foreground mt-1">Details printed on the GST invoice, and order email settings</p>
            </div>
            {canEdit && (
              <Button onClick={() => void save()} disabled={saving || loading} className="bg-gradient-to-r from-accent to-accent-secondary">
                <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>

          {success && (
            <Alert className="mb-4 border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              <EmailHealthCard canEdit={canEdit} />

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Store className="h-5 w-5" /> Seller details (on the invoice)
                  </CardTitle>
                  <CardDescription>The supply is intra-state (CGST + SGST) when the delivery state matches the state below, otherwise IGST.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {field("legalName", "Legal name (as per GST)")}
                  {field("tradeName", "Trade / brand name")}
                  {field("gstin", "GSTIN", { placeholder: "24ABCDE1234F1Z5", maxLength: 15 })}
                  {field("pan", "PAN", { maxLength: 10 })}
                  {field("addressLine1", "Address line 1")}
                  {field("addressLine2", "Address line 2")}
                  {field("city", "City")}
                  <div className="space-y-1.5">
                    <Label>State</Label>
                    <select
                      value={form.state}
                      disabled={!canEdit}
                      onChange={(e) => set("state", e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  {field("pinCode", "PIN code", { maxLength: 6 })}
                  {field("phone", "Phone")}
                  {field("email", "Support email (reply-to for customer emails)", { type: "email" })}
                  {field("website", "Website URL")}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5" /> Invoice
                  </CardTitle>
                  <CardDescription>
                    An invoice number is issued when an order is shipped. Numbers restart at 0001 every April.
                    {nextInvoice ? ` Next number: ${nextInvoice}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {field("invoicePrefix", "Number prefix", { placeholder: "WEB/" })}
                  <div className="md:col-span-2 space-y-1.5">
                    <Label>Terms & conditions (printed on the invoice)</Label>
                    <Textarea rows={4} value={form.invoiceTerms} disabled={!canEdit} onChange={(e) => set("invoiceTerms", e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Mail className="h-5 w-5" /> Order emails
                  </CardTitle>
                  <CardDescription>
                    Sent through the SMTP account in Settings → Email Config (it must be Active). Customer emails go to the email on the customer&apos;s account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.sendCustomerEmails}
                      disabled={!canEdit}
                      onChange={(e) => set("sendCustomerEmails", e.target.checked)}
                    />
                    Email customers when their order status changes
                  </label>
                  {field("alertEmail", "Store alert email(s) — comma separated", { placeholder: "orders@applenext.in" })}

                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 font-semibold">Email</th>
                          <th className="text-left p-2 font-semibold">Sent when</th>
                          <th className="text-left p-2 font-semibold">To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {EMAIL_FLOW.map(([name, when, to]) => (
                          <tr key={name} className="border-t">
                            <td className="p-2 font-medium">{name}</td>
                            <td className="p-2 text-muted-foreground">{when}</td>
                            <td className="p-2">{to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
