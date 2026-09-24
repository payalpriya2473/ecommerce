"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { onlineOrderAPI, type OnlineOrder } from "@/lib/api";
import { formatDateTime, formatINR, paymentMethodLabel } from "../order-status";

function PrintContent() {
  const id = useSearchParams().get("id") || "";
  const [order, setOrder] = useState<OnlineOrder | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = sessionStorage.getItem("authToken");
    if (!token || !id) {
      setError("Please open this page from the admin panel while logged in.");
      return;
    }
    onlineOrderAPI
      .getById(token, id)
      .then((result) => {
        if (result.success) {
          setOrder(result.data);
          setTimeout(() => window.print(), 400);
        } else setError(result.message || "Order not found");
      })
      .catch(() => setError("Failed to load order"));
  }, [id]);

  if (error) return <div className="p-10 text-center text-sm">{error}</div>;
  if (!order) return <div className="p-10 text-center text-sm">Loading…</div>;

  // Split the GST-inclusive line totals into taxable value + GST per rate.
  const gstByRate = new Map<number, { taxable: number; gst: number }>();
  for (const item of order.items || []) {
    const rate = Number(item.gst) || 0;
    const taxable = item.lineTotal / (1 + rate / 100);
    const entry = gstByRate.get(rate) || { taxable: 0, gst: 0 };
    entry.taxable += taxable;
    entry.gst += item.lineTotal - taxable;
    gstByRate.set(rate, entry);
  }

  return (
    <div className="mx-auto max-w-[800px] p-8 text-[13px] text-black bg-white print:p-0">
      <style>{`@media print { @page { margin: 12mm; } .no-print { display: none !important; } }`}</style>

      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
        <div>
          <div className="text-2xl font-bold tracking-wide">APPLENEXT</div>
          <div className="text-xs">shop.applenext.in</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">Order Summary / Packing Slip</div>
          <div>
            Order: <b>{order.orderNumber}</b>
          </div>
          <div>Date: {formatDateTime(order.placedAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-4">
        <div>
          <div className="font-semibold uppercase text-xs mb-1">Ship to</div>
          <div className="font-semibold">{order.address.name}</div>
          <div>{order.address.phone}</div>
          <div>{order.address.line1}</div>
          {order.address.line2 && <div>{order.address.line2}</div>}
          <div>
            {[order.address.city, order.address.state].filter(Boolean).join(", ")} - {order.address.pinCode}
          </div>
        </div>
        <div>
          <div className="font-semibold uppercase text-xs mb-1">Payment</div>
          <div>
            {paymentMethodLabel(order.paymentMethod)} — <span className="capitalize">{order.paymentStatus}</span>
          </div>
          {order.paymentMethod === "cod" && order.paymentStatus !== "paid" && (
            <div className="mt-1 text-base font-bold">COLLECT: {formatINR(order.totalAmount)}</div>
          )}
          {order.courierName && (
            <div className="mt-2">
              Courier: {order.courierName}
              <br />
              AWB: <b>{order.trackingNumber}</b>
            </div>
          )}
        </div>
      </div>

      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1.5">#</th>
            <th className="py-1.5">Item</th>
            <th className="py-1.5 text-center">Qty</th>
            <th className="py-1.5 text-right">Rate</th>
            <th className="py-1.5 text-right">GST</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((item, index) => (
            <tr key={item.id} className="border-b border-gray-300 align-top">
              <td className="py-1.5">{index + 1}</td>
              <td className="py-1.5">
                <div className="font-medium">{item.itemName}</div>
                <div className="text-xs">{[item.variant, item.colorName].filter(Boolean).join(" · ")}</div>
                <div className="text-xs">Serial / IMEI: ____________________</div>
              </td>
              <td className="py-1.5 text-center">{item.qty}</td>
              <td className="py-1.5 text-right">{formatINR(item.unitPrice)}</td>
              <td className="py-1.5 text-right">{item.gst}%</td>
              <td className="py-1.5 text-right">{formatINR(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between gap-8">
        <table className="text-xs border-collapse self-start">
          <thead>
            <tr className="border-b border-black">
              <th className="pr-4 text-left">GST rate</th>
              <th className="pr-4 text-right">Taxable</th>
              <th className="text-right">GST</th>
            </tr>
          </thead>
          <tbody>
            {[...gstByRate.entries()].map(([rate, v]) => (
              <tr key={rate}>
                <td className="pr-4">{rate}%</td>
                <td className="pr-4 text-right">{formatINR(v.taxable)}</td>
                <td className="text-right">{formatINR(v.gst)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="w-64 space-y-1">
          <div className="flex justify-between">
            <span>Subtotal (incl. GST)</span>
            <span>{formatINR(order.subtotal)}</span>
          </div>
          {order.couponDiscount > 0 && (
            <div className="flex justify-between">
              <span>Coupon {order.couponCode}</span>
              <span>− {formatINR(order.couponDiscount)}</span>
            </div>
          )}
          {order.platformDiscount > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>− {formatINR(order.platformDiscount)}</span>
            </div>
          )}
          {order.deliveryCharge > 0 && (
            <div className="flex justify-between">
              <span>Delivery</span>
              <span>{formatINR(order.deliveryCharge)}</span>
            </div>
          )}
          {order.codFee > 0 && (
            <div className="flex justify-between">
              <span>COD fee</span>
              <span>{formatINR(order.codFee)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-black pt-1 font-bold text-sm">
            <span>Total</span>
            <span>{formatINR(order.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>GST included</span>
            <span>{formatINR(order.taxAmount)}</span>
          </div>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t border-black pt-1">Packed by</div>
        <div className="border-t border-black pt-1">Checked by</div>
      </div>
      <p className="mt-6 text-[11px] text-gray-600">
        This is an order summary, not a tax invoice. The GST tax invoice is issued from Sales Invoices.
      </p>

      <div className="no-print mt-6 text-center">
        <button onClick={() => window.print()} className="rounded border px-4 py-2 text-sm">
          Print
        </button>
      </div>
    </div>
  );
}

export default function OnlineOrderPrintPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <PrintContent />
    </Suspense>
  );
}
