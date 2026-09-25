import type { ReportColumnType } from "@/lib/api";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const formatCurrency = (v: unknown) => `₹${inr.format(Number(v) || 0)}`;
export const formatNumber = (v: unknown) => qtyFmt.format(Number(v) || 0);

export function formatDate(v: unknown, withTime = false): string {
  if (!v) return "-";
  const raw = String(v);
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(raw) ? raw.replace(" ", "T") : raw);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Human label for enum-ish values (status, channel, stock status …). */
export const BADGE_LABELS: Record<string, string> = {
  showroom: "Showroom",
  website: "Website",
  invoiced: "Invoiced",
  pending_payment: "Awaiting Payment",
  payment_failed: "Payment Failed",
  processing: "New",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  in_stock: "In Stock",
  low_stock: "Low Stock",
  out_of_stock: "Out of Stock",
  active: "Active",
  inactive: "Inactive",
  reorder_now: "Reorder Now",
  reorder_soon: "Reorder Soon",
  below_min: "Below Minimum",
  ok: "OK",
  overstock: "Overstock",
  dead: "Dead Stock",
};

export const BADGE_CLASSES: Record<string, string> = {
  showroom: "bg-indigo-50 text-indigo-700 border-indigo-200",
  website: "bg-cyan-50 text-cyan-700 border-cyan-200",
  invoiced: "bg-green-50 text-green-700 border-green-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  in_stock: "bg-green-50 text-green-700 border-green-200",
  active: "bg-green-50 text-green-700 border-green-200",
  low_stock: "bg-amber-50 text-amber-700 border-amber-200",
  pending_payment: "bg-amber-50 text-amber-700 border-amber-200",
  out_of_stock: "bg-red-50 text-red-700 border-red-200",
  payment_failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  inactive: "bg-gray-100 text-gray-600 border-gray-200",
  returned: "bg-orange-50 text-orange-700 border-orange-200",
  reorder_now: "bg-red-50 text-red-700 border-red-200",
  reorder_soon: "bg-amber-50 text-amber-700 border-amber-200",
  below_min: "bg-orange-50 text-orange-700 border-orange-200",
  ok: "bg-green-50 text-green-700 border-green-200",
  overstock: "bg-violet-50 text-violet-700 border-violet-200",
  dead: "bg-gray-100 text-gray-600 border-gray-200",
};

export function formatCell(type: ReportColumnType, value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  switch (type) {
    case "currency":
      return formatCurrency(value);
    case "number":
      return formatNumber(value);
    case "percent":
      return `${formatNumber(value)}%`;
    case "date":
      return formatDate(value);
    case "datetime":
      return formatDate(value, true);
    case "badge":
      return BADGE_LABELS[String(value)] || String(value);
    default:
      return String(value);
  }
}

export const isNumericType = (type: ReportColumnType) => type === "number" || type === "currency" || type === "percent";
