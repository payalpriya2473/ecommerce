import type { OnlineOrderStatus } from "@/lib/api";

export const ORDER_STATUS_LABEL: Record<OnlineOrderStatus, string> = {
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
};

export const ORDER_STATUS_CLASS: Record<OnlineOrderStatus, string> = {
  pending_payment: "bg-amber-50 text-amber-700 border-amber-200",
  payment_failed: "bg-red-50 text-red-700 border-red-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
  packed: "bg-violet-50 text-violet-700 border-violet-200",
  shipped: "bg-cyan-50 text-cyan-700 border-cyan-200",
  out_for_delivery: "bg-teal-50 text-teal-700 border-teal-200",
  delivered: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  returned: "bg-orange-50 text-orange-700 border-orange-200",
};

/** Button text for moving an order INTO a status. */
export const ORDER_ACTION_LABEL: Record<OnlineOrderStatus, string> = {
  pending_payment: "Awaiting Payment",
  payment_failed: "Payment Failed",
  processing: "Reopen",
  confirmed: "Confirm Order",
  packed: "Mark Packed",
  shipped: "Ship Order",
  out_for_delivery: "Out for Delivery",
  delivered: "Mark Delivered",
  cancelled: "Cancel Order",
  returned: "Mark Returned",
};

export const PAYMENT_STATUS_CLASS: Record<string, string> = {
  paid: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-gray-100 text-gray-600 border-gray-200",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  upi: "UPI",
  card: "Card",
  netbanking: "Net Banking",
  emi: "EMI",
  wallet: "Wallet",
  razorpay: "Online",
};

export const paymentMethodLabel = (method: string) =>
  PAYMENT_METHOD_LABEL[method] || (method ? method.charAt(0).toUpperCase() + method.slice(1) : "-");

export const formatINR = (value: number) =>
  `₹${(Number(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
