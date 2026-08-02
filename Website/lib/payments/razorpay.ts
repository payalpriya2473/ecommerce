// lib/payments/razorpay.ts
// Loads Razorpay Standard Checkout on demand and wraps it in a promise.

const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<boolean> | null = null;

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailure {
  code?: string;
  description?: string;
  reason?: string;
  step?: string;
  source?: string;
  metadata?: { payment_id?: string; order_id?: string };
}

export type CheckoutOutcome =
  | { status: "paid"; payload: RazorpaySuccess }
  | { status: "failed"; error: RazorpayFailure }
  | { status: "dismissed" };

export interface OpenCheckoutOptions {
  keyId: string;
  razorpayOrderId: string;
  amount: number; // paise
  currency?: string;
  orderNumber: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  themeColor?: string;
}

/** Injects checkout.js once and resolves when it's ready. */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  if (!scriptPromise) {
    scriptPromise = new Promise<boolean>((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", () => resolve(false));
        if (window.Razorpay) resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = CHECKOUT_SCRIPT;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        scriptPromise = null;
        resolve(false);
      };
      document.body.appendChild(script);
    });
  }

  return scriptPromise;
}

/**
 * Opens the Razorpay modal and resolves once the customer pays, fails, or
 * closes it. Never rejects — the caller gets one of three clear outcomes.
 */
export function openRazorpayCheckout(options: OpenCheckoutOptions): Promise<CheckoutOutcome> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.Razorpay) {
      resolve({ status: "failed", error: { description: "Payment window could not be opened" } });
      return;
    }

    let settled = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const checkout = new window.Razorpay({
      key: options.keyId,
      amount: options.amount,
      currency: options.currency || "INR",
      order_id: options.razorpayOrderId,
      name: "AppleNext Electronics",
      description: `Order ${options.orderNumber}`,
      image: "/applenext_icon.png",
      prefill: {
        name: options.customerName || "",
        email: options.customerEmail || "",
        contact: options.customerPhone || "",
      },
      notes: { orderNumber: options.orderNumber },
      theme: { color: options.themeColor || "#eb2d23" },
      retry: { enabled: false },
      modal: {
        ondismiss: () => settle({ status: "dismissed" }),
        escape: true,
        confirm_close: true,
      },
      handler: (payload: RazorpaySuccess) => settle({ status: "paid", payload }),
    });

    checkout.on("payment.failed", (event: { error?: RazorpayFailure }) => {
      settle({ status: "failed", error: event?.error ?? {} });
    });

    checkout.open();
  });
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: any;
  }
}
