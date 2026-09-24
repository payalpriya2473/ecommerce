"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  MapPin,
  Package,
  Pencil,
  Printer,
  RotateCcw,
  Truck,
  User,
  XCircle,
  FileText,
  Mail,
  Send,
} from "lucide-react";
import { onlineOrderAPI, type OnlineOrder, type OnlineOrderStatus } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { resolveAssetUrl } from "@/lib/asset-url";
import { cn } from "@/lib/utils";
import {
  ORDER_ACTION_LABEL,
  ORDER_STATUS_CLASS,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_CLASS,
  formatDateTime,
  formatINR,
  paymentMethodLabel,
} from "../order-status";

type ActionKind = OnlineOrderStatus | "edit_tracking";

const EMAIL_EVENT_LABEL: Record<string, string> = {
  placed: "Order placed",
  payment_failed: "Payment failed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped + invoice",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refund_initiated: "Refund initiated",
  refunded: "Refund completed",
  payment_issue: "Payment alert",
};

const COURIERS = ["Delhivery", "Blue Dart", "DTDC", "Ecom Express", "Xpressbees", "India Post", "Shadowfax", "Self Delivery"];

export default function OnlineOrderViewContent() {
  const router = useRouter();
  const id = useSearchParams().get("id") || "";
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const canEdit = hasPermission("online_orders", "edit");

  const [order, setOrder] = useState<OnlineOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  const [action, setAction] = useState<ActionKind | null>(null);
  const [note, setNote] = useState("");
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [restock, setRestock] = useState(true);
  const [refund, setRefund] = useState(true);
  const [busy, setBusy] = useState(false);

  const [adminNotes, setAdminNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);

  const token = () => (typeof window !== "undefined" ? sessionStorage.getItem("authToken") : null);

  const load = useCallback(async () => {
    const t = token();
    if (!t || !id) return;
    try {
      const result = await onlineOrderAPI.getById(t, id);
      if (result.success) {
        setOrder(result.data);
        setAdminNotes(result.data.adminNotes || "");
        setNotesSaved(true);
        setError("");
      } else {
        setError(result.message || "Order not found");
      }
    } catch {
      setError("Failed to load order");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const openAction = (kind: ActionKind) => {
    setAction(kind);
    setError("");
    setNote("");
    setProblems([]);
    setRestock(true);
    setRefund(true);
    setCourierName(order?.courierName || "");
    setTrackingNumber(order?.trackingNumber || "");
    setTrackingUrl(order?.trackingUrl || "");
  };

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(""), 4000);
  };

  const submitAction = async () => {
    const t = token();
    if (!t || !order || !action) return;
    setBusy(true);
    setProblems([]);
    try {
      let result: any;
      if (action === "edit_tracking") {
        result = await onlineOrderAPI.updateShipping(t, order.id, { courierName, trackingNumber, trackingUrl });
      } else if (action === "cancelled") {
        result = await onlineOrderAPI.cancel(t, order.id, note);
      } else {
        result = await onlineOrderAPI.changeStatus(t, order.id, {
          status: action,
          note,
          courierName,
          trackingNumber,
          trackingUrl,
          restock,
          refund,
        });
      }
      if (result.success) {
        setAction(null);
        flash(result.message || "Order updated");
        await load();
      } else {
        setProblems(Array.isArray(result.problems) ? result.problems : []);
        setError(result.message || "Update failed");
        if (!Array.isArray(result.problems)) setAction(null);
      }
    } catch {
      setError("Update failed");
    } finally {
      setBusy(false);
    }
  };

  const retryRefund = async () => {
    const t = token();
    if (!t || !order) return;
    setBusy(true);
    if (
      order.refundMode === "manual" &&
      !window.confirm(`Confirm that ${formatINR(order.totalAmount)} has been refunded to the customer (bank transfer / UPI / cash)?`)
    ) {
      setBusy(false);
      return;
    }
    const result = await onlineOrderAPI.refund(t, order.id).catch(() => null);
    setBusy(false);
    if (result?.success) {
      flash(result.message || "Refund done");
      await load();
    } else setError(result?.message || "Refund failed");
  };

  const openInvoice = async () => {
    const t = token();
    if (!t || !order) return;
    const win = window.open("", "_blank");
    const result = await onlineOrderAPI.getInvoice(t, order.id).catch(() => ({ message: "Could not load the invoice" }) as { message: string; blob?: Blob });
    if ("blob" in result && result.blob) {
      const url = URL.createObjectURL(result.blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      if (!order.invoiceNumber) void load();
    } else {
      win?.close();
      setError(result.message || "Could not load the invoice");
    }
  };

  const resendEmail = async () => {
    const t = token();
    if (!t || !order) return;
    setBusy(true);
    const result = await onlineOrderAPI.resendEmail(t, order.id).catch(() => null);
    setBusy(false);
    if (result?.success) {
      flash(result.message || "Email sent");
    } else {
      setError(result?.message || "Email could not be sent");
    }
    await load();
  };

  const saveNotes = async () => {
    const t = token();
    if (!t || !order) return;
    const result = await onlineOrderAPI.saveNotes(t, order.id, adminNotes).catch(() => null);
    if (result?.success) {
      setNotesSaved(true);
      flash("Notes saved");
    } else setError(result?.message || "Could not save notes");
  };

  if (!permissionsLoading && !hasPermission("online_orders", "view")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="p-10 text-center text-muted-foreground">You don&apos;t have permission to view online orders.</div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  if (isLoading) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  if (!order) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="p-10 text-center">
            <p className="text-muted-foreground mb-4">{error || "Order not found"}</p>
            <Button variant="outline" onClick={() => router.push("/online-orders")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to orders
            </Button>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  const forwardActions = order.nextStatuses.filter((s) => s !== "cancelled" && s !== "returned");
  const canCancel = order.nextStatuses.includes("cancelled");
  const canReturn = order.nextStatuses.includes("returned");
  const isOnlinePaid = order.paymentStatus === "paid" && order.paymentProvider === "razorpay";
  const shippedOrLater = ["shipped", "out_for_delivery", "delivered", "returned"].includes(order.status);

  const steps: { label: string; at: string | null; done: boolean }[] = [
    { label: "Placed", at: order.placedAt, done: true },
    ...(order.paymentMethod !== "cod" ? [{ label: "Paid", at: order.paidAt, done: Boolean(order.paidAt) }] : []),
    { label: "Confirmed", at: order.confirmedAt, done: Boolean(order.confirmedAt) },
    { label: "Packed", at: order.packedAt, done: Boolean(order.packedAt) },
    { label: "Shipped", at: order.shippedAt, done: Boolean(order.shippedAt) },
    { label: "Delivered", at: order.deliveredAt, done: Boolean(order.deliveredAt) },
  ];

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4 md:px-6 lg:px-8 max-w-7xl">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-3">
              <Button variant="ghost" size="icon" onClick={() => router.push("/online-orders")} className="mt-1">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
                  <span className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", ORDER_STATUS_CLASS[order.status])}>
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                  <span className={cn("rounded-md border px-2 py-0.5 text-xs font-medium capitalize", PAYMENT_STATUS_CLASS[order.paymentStatus])}>
                    {order.paymentStatus}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Placed {formatDateTime(order.placedAt)} · {order.statusLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(order.invoiceNumber || ["shipped", "out_for_delivery", "delivered", "returned"].includes(order.status)) && (
                <Button variant="outline" onClick={() => void openInvoice()}>
                  <FileText className="h-4 w-4 mr-2" /> {order.invoiceNumber ? "Invoice" : "Generate Invoice"}
                </Button>
              )}
              <Link href={`/online-orders/print?id=${order.id}`} target="_blank">
                <Button variant="outline">
                  <Printer className="h-4 w-4 mr-2" /> Packing Slip
                </Button>
              </Link>
              {canEdit &&
                forwardActions.map((s) => (
                  <Button
                    key={s}
                    onClick={() => openAction(s)}
                    className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
                  >
                    {s === "shipped" ? <Truck className="h-4 w-4 mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    {ORDER_ACTION_LABEL[s]}
                  </Button>
                ))}
              {canEdit && canReturn && (
                <Button variant="outline" onClick={() => openAction("returned")}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Mark Returned
                </Button>
              )}
              {canEdit && canCancel && (
                <Button variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => openAction("cancelled")}>
                  <XCircle className="h-4 w-4 mr-2" /> Cancel
                </Button>
              )}
              {canEdit && order.canRefund && (
                <Button variant="outline" disabled={busy} onClick={() => void retryRefund()}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {order.refundMode === "manual" ? "Mark Refund Paid" : "Refund via Razorpay"}
                </Button>
              )}
            </div>
          </div>

          {success && (
            <Alert className="mb-4 border-green-500 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}
          {error && !action && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {order.status === "pending_payment" && (
            <Alert className="mb-4 border-amber-300 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                The customer has not completed online payment yet. It will move to “New” automatically once Razorpay confirms the payment.
              </AlertDescription>
            </Alert>
          )}

          {/* Progress */}
          {order.status !== "cancelled" && (
            <Card className="mb-6 border-border/50 shadow-sm">
              <CardContent className="py-5">
                <div className="flex items-start">
                  {steps.map((step, index) => (
                    <div key={step.label} className="flex-1 flex flex-col items-center text-center relative">
                      {index > 0 && (
                        <div className={cn("absolute top-3 right-1/2 w-full h-0.5 -z-0", step.done ? "bg-green-500" : "bg-border")} />
                      )}
                      <div
                        className={cn(
                          "relative z-10 h-6 w-6 rounded-full border-2 flex items-center justify-center bg-background",
                          step.done ? "border-green-500 bg-green-500 text-white" : "border-border"
                        )}
                      >
                        {step.done && <CheckCircle2 className="h-4 w-4" />}
                      </div>
                      <div className={cn("text-xs font-medium mt-2", !step.done && "text-muted-foreground")}>{step.label}</div>
                      <div className="text-[11px] text-muted-foreground">{step.at ? formatDateTime(step.at) : ""}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" /> Items
                    {order.stockDeducted && (
                      <span className="ml-auto text-xs font-normal text-muted-foreground">Stock deducted</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {(order.items || []).map((item) => (
                      <div key={item.id} className="flex gap-4 px-6 py-4">
                        <div className="h-16 w-16 rounded-lg border bg-muted/30 overflow-hidden flex-shrink-0">
                          {item.primaryImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={resolveAssetUrl(item.primaryImage)} alt={item.itemName} className="h-full w-full object-contain" />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{item.itemName}</div>
                          <div className="text-xs text-muted-foreground">
                            {[item.brandName, item.variant, item.colorName].filter(Boolean).join(" · ")}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            GST {item.gst}% · Current stock:{" "}
                            <span className={cn(item.currentStock != null && item.currentStock < item.qty && !order.stockDeducted && "text-red-600 font-semibold")}>
                              {item.currentStock ?? "-"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div>
                            {formatINR(item.unitPrice)} × {item.qty}
                          </div>
                          {item.originalPrice > item.unitPrice && (
                            <div className="text-xs text-muted-foreground line-through">{formatINR(item.originalPrice)}</div>
                          )}
                          <div className="font-semibold mt-1">{formatINR(item.lineTotal)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t px-6 py-4 space-y-1.5 text-sm">
                    <Row label="Subtotal (incl. GST)" value={formatINR(order.subtotal)} />
                    {order.couponDiscount > 0 && <Row label={`Coupon ${order.couponCode || ""}`} value={`− ${formatINR(order.couponDiscount)}`} />}
                    {order.platformDiscount > 0 && <Row label="Platform discount" value={`− ${formatINR(order.platformDiscount)}`} />}
                    {order.deliveryCharge > 0 && <Row label={order.deliveryLabel || "Delivery"} value={formatINR(order.deliveryCharge)} />}
                    {order.codFee > 0 && <Row label="COD fee" value={formatINR(order.codFee)} />}
                    <Row label="GST included" value={formatINR(order.taxAmount)} muted />
                    <div className="flex justify-between pt-2 border-t font-semibold text-base">
                      <span>Total</span>
                      <span>{formatINR(order.totalAmount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {(order.courierName || shippedOrLater) && (
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Truck className="h-4 w-4" /> Shipment
                      {canEdit && order.status !== "cancelled" && (
                        <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => openAction("edit_tracking")}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <div>
                      <span className="text-muted-foreground">Courier:</span> {order.courierName || "-"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tracking / AWB:</span> {order.trackingNumber || "-"}
                    </div>
                    {order.trackingUrl && (
                      <a href={order.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Open tracking <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {(order.history || []).length === 0 && (order.payments || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                  ) : (
                    <ol className="relative border-l border-border ml-2 space-y-4">
                      {[
                        ...(order.history || []).map((h) => ({
                          key: `h${h.id}`,
                          at: h.createdAt,
                          title:
                            h.fromStatus === h.toStatus
                              ? "Updated"
                              : ORDER_STATUS_LABEL[h.toStatus as OnlineOrderStatus] || h.toStatus,
                          sub: [h.note, h.actorName ? `by ${h.actorName}` : h.actorType].filter(Boolean).join(" — "),
                        })),
                        ...(order.payments || []).map((p) => ({
                          key: `p${p.id}`,
                          at: p.createdAt,
                          title: `Payment: ${p.eventType}`,
                          sub: [p.amount != null ? formatINR(Number(p.amount)) : null, p.status, p.providerPaymentId].filter(Boolean).join(" · "),
                        })),
                      ]
                        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                        .map((e) => (
                          <li key={e.key} className="ml-4">
                            <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background bg-primary/70" />
                            <div className="text-sm font-medium">{e.title}</div>
                            {e.sub && <div className="text-xs text-muted-foreground">{e.sub}</div>}
                            <div className="text-[11px] text-muted-foreground">{formatDateTime(e.at)}</div>
                          </li>
                        ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right */}
            <div className="space-y-6">
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" /> Customer
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div className="font-medium">{order.customer.name || "-"}</div>
                  {order.customer.phone && <div>{order.customer.phone}</div>}
                  {order.customer.email && <div className="text-muted-foreground break-all">{order.customer.email}</div>}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Ship to
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-0.5">
                  <div className="font-medium">{order.address.name}</div>
                  <div>{order.address.phone}</div>
                  <div>{order.address.line1}</div>
                  {order.address.line2 && <div>{order.address.line2}</div>}
                  <div>
                    {[order.address.city, order.address.state].filter(Boolean).join(", ")} {order.address.pinCode}
                  </div>
                  {order.notes && <div className="mt-2 text-muted-foreground">Customer note: {order.notes}</div>}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Payment
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div>
                    {paymentMethodLabel(order.paymentMethod)}
                    {order.paymentDetail ? ` · ${order.paymentDetail}` : ""}
                  </div>
                  <div className="capitalize">Status: {order.paymentStatus}</div>
                  {order.paidAt && <div className="text-muted-foreground">Paid {formatDateTime(order.paidAt)}</div>}
                  {order.providerPaymentId && <div className="text-xs text-muted-foreground break-all">Payment ID: {order.providerPaymentId}</div>}
                  {order.paymentError && <div className="text-xs text-red-600">{order.paymentError}</div>}
                  {order.invoiceNumber && (
                    <div className="text-xs mt-2">
                      Invoice: <span className="font-medium">{order.invoiceNumber}</span>
                      {order.invoiceDate ? ` · ${formatDateTime(order.invoiceDate)}` : ""}
                    </div>
                  )}
                  {order.cancelReason && <div className="text-xs text-muted-foreground mt-2">Cancel reason: {order.cancelReason}</div>}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="h-4 w-4" /> Emails
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="ml-auto h-7" disabled={busy || !order.customerHasEmail} onClick={() => void resendEmail()}>
                        <Send className="h-3.5 w-3.5 mr-1" /> Resend
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {!order.customerHasEmail && (
                    <p className="text-xs text-amber-700">This customer has no email on their account, so no emails can be sent.</p>
                  )}
                  {(order.notifications || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No emails sent yet.</p>
                  ) : (
                    (order.notifications || []).slice().reverse().map((n) => (
                      <div key={n.id} className="flex items-start justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium">
                            {EMAIL_EVENT_LABEL[n.event] || n.event}
                            <span className="text-muted-foreground font-normal"> · {n.audience === "store" ? "Store" : "Customer"}</span>
                          </div>
                          <div className="text-muted-foreground truncate" title={n.error || n.recipient || ""}>
                            {n.status === "sent" ? n.recipient : n.error || n.recipient}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{formatDateTime(n.createdAt)}</div>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize",
                            n.status === "sent"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : n.status === "failed"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                          )}
                        >
                          {n.status}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Internal notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    rows={4}
                    value={adminNotes}
                    disabled={!canEdit}
                    placeholder="Only visible to staff"
                    onChange={(e) => {
                      setAdminNotes(e.target.value);
                      setNotesSaved(false);
                    }}
                  />
                  {canEdit && (
                    <Button size="sm" variant="outline" disabled={notesSaved} onClick={() => void saveNotes()}>
                      Save notes
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Action dialog */}
          <Dialog open={action !== null} onOpenChange={(open) => !open && !busy && setAction(null)}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {action === "edit_tracking" ? "Edit tracking details" : action ? ORDER_ACTION_LABEL[action] : ""}
                </DialogTitle>
                <DialogDescription>
                  {action === "confirmed" && "Checks stock and deducts it from the item's Opening Stock."}
                  {action === "packed" && "The order is packed and ready to hand over to the courier."}
                  {action === "shipped" &&
                    "Enter the courier and AWB. A GST invoice number is issued now and the invoice PDF is emailed to the customer with the tracking details."}
                  {action === "out_for_delivery" && "The courier is delivering the order today."}
                  {action === "delivered" &&
                    (order.paymentMethod === "cod" ? "COD payment will be marked as received." : "Marks the order as delivered.")}
                  {action === "cancelled" &&
                    (isOnlinePaid
                      ? "The full amount will be refunded to the customer through Razorpay."
                      : "The order will be cancelled.") +
                      (order.stockDeducted ? " Stock will be added back." : "")}
                  {action === "returned" && "Use this when the product has come back to the store (customer return or courier RTO)."}
                  {action === "edit_tracking" && "Fix the courier or AWB number."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {problems.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="font-medium mb-1">{error}</div>
                      <ul className="list-disc ml-4 text-sm">
                        {problems.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {(action === "shipped" || action === "edit_tracking") && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Courier *</Label>
                      <Input list="courier-list" value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="e.g. Delhivery" />
                      <datalist id="courier-list">
                        {COURIERS.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tracking / AWB number *</Label>
                      <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tracking link (optional)</Label>
                      <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} placeholder="https://" />
                    </div>
                  </>
                )}

                {action === "returned" && (
                  <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                      Add the items back to stock
                    </label>
                    {isOnlinePaid && (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
                        Refund {formatINR(order.totalAmount)} through Razorpay now
                      </label>
                    )}
                    {order.paymentMethod === "cod" && order.paymentStatus === "paid" && (
                      <p className="text-muted-foreground">COD order — refund the customer manually (bank transfer / UPI).</p>
                    )}
                  </div>
                )}

                {action !== "edit_tracking" && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {order.customerHasEmail
                      ? "The customer will get an email about this update."
                      : "This customer has no email address, so no email will be sent."}
                  </p>
                )}

                {action !== "edit_tracking" && (
                  <div className="space-y-1.5">
                    <Label>{action === "cancelled" ? "Reason (shown to customer)" : "Note (optional)"}</Label>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => setAction(null)}>
                  Close
                </Button>
                <Button
                  disabled={busy || ((action === "shipped" || action === "edit_tracking") && (!courierName.trim() || !trackingNumber.trim()))}
                  className={action === "cancelled" ? "bg-red-600 hover:bg-red-700" : undefined}
                  onClick={() => void submitAction()}
                >
                  {busy ? "Saving..." : action === "edit_tracking" ? "Save" : action ? ORDER_ACTION_LABEL[action] : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
