"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAccount, orderFromApi, type AccountAddress } from "@/lib/account/account-context";
import { useCart } from "@/lib/cart/cart-context";
import { getImageUrl } from "@/lib/api/publicApi";
import {
  customerOrderAPI,
  customerPaymentAPI,
  isLoggedIn,
  onCustomerAuthChange,
  type CustomerOrder,
  type PaymentConfig,
  type PlaceOrderPayload,
} from "@/lib/api/customerApi";
import { loadRazorpayScript, openRazorpayCheckout } from "@/lib/payments/razorpay";
import {
  COUPONS,
  DELIVERY_OPTIONS,
  clearCheckoutCoupon,
  computeOrderTotals,
  formatRupees,
  readCheckoutCoupon,
  saveCheckoutCoupon,
  type DeliveryType,
  type PaymentMethod,
} from "@/lib/pricing/order-pricing";
import "./CheckoutPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface Toast {
  id: number;
  message: string;
  type: "success" | "warning";
}

const PROGRESS_STEPS = ["Cart", "Address", "Payment", "Confirm"];

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra",
  "Odisha", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

const PINCODE_MAP: Record<string, { city: string; state: string }> = {
  "400001": { city: "Mumbai", state: "Maharashtra" },
  "400064": { city: "Mumbai", state: "Maharashtra" },
  "411001": { city: "Pune", state: "Maharashtra" },
  "110001": { city: "New Delhi", state: "Delhi" },
  "560001": { city: "Bengaluru", state: "Karnataka" },
  "600001": { city: "Chennai", state: "Tamil Nadu" },
  "500001": { city: "Hyderabad", state: "Telangana" },
  "700001": { city: "Kolkata", state: "West Bengal" },
  "380001": { city: "Ahmedabad", state: "Gujarat" },
  "302001": { city: "Jaipur", state: "Rajasthan" },
};

const UPI_APPS = [
  { name: "GPay", label: "Google Pay", style: { background: "var(--success-tint)", color: "#34a853" }, icon: "fab fa-google-pay" },
  { name: "PhonePe", label: "PhonePe", style: { background: "var(--bg-subtle)", color: "#7c3aed" }, icon: "fas fa-bolt" },
  { name: "Paytm", label: "Paytm", style: { background: "var(--info-tint)", color: "var(--info-strong)" }, text: "Pay" },
  { name: "BHIM", label: "BHIM UPI", style: { background: "var(--brand-tint)", color: "var(--brand)" }, text: "BHIM" },
];

const BANKS = [
  { name: "HDFC Bank", short: "HDFC", style: { background: "linear-gradient(135deg, #003399, #0066cc)" } },
  { name: "State Bank of India", short: "SBI", style: { background: "linear-gradient(135deg, #003399, #1565c0)" } },
  { name: "Axis Bank", short: "AXIS", style: { background: "linear-gradient(135deg, #8b0000, #cc0000)" } },
  { name: "ICICI Bank", short: "ICICI", style: { background: "linear-gradient(135deg, #ff6600, #cc5200)" } },
];

const OTHER_BANKS = [
  "Kotak Mahindra Bank", "Yes Bank", "Bank of Baroda", "Punjab National Bank",
  "Canara Bank", "IndusInd Bank", "Federal Bank", "IDFC First Bank",
];

const WALLETS = ["Paytm Wallet", "PhonePe Wallet", "Amazon Pay", "Mobikwik", "Ola Money", "Airtel Money"];

const WALLET_ICONS: Record<string, string> = {
  "Paytm Wallet": "💙",
  "PhonePe Wallet": "💜",
  "Amazon Pay": "🟢",
  Mobikwik: "🔵",
  "Ola Money": "🟠",
  "Airtel Money": "🔴",
};

const EMPTY_FORM = {
  name: "",
  phone: "",
  addr1: "",
  addr2: "",
  landmark: "",
  pincode: "",
  city: "",
  state: "",
  addrType: "home" as AccountAddress["type"],
};

function luhnValid(cardNumber: string) {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let value = Number(digits[i]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function expiryValid(value: string) {
  const match = value.replace(/\s/g, "").match(/^(\d{2})\/?(\d{2})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const expiry = new Date(year, month, 0, 23, 59, 59);
  return expiry.getTime() > Date.now();
}

function formatAddressLines(address: AccountAddress | null) {
  if (!address) return [];
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.pinCode].filter(Boolean).join(", "),
  ].filter(Boolean) as string[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const router = useRouter();

  const { items: cartItems, clearCart } = useCart();
  const { profile, addresses, addAddress, addOrder, refreshOrders } = useAccount();

  const [authState, setAuthState] = useState<"checking" | "guest" | "member">("checking");
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [savingAddress, setSavingAddress] = useState(false);

  const [deliveryType, setDeliveryType] = useState<DeliveryType>("free");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [upiApp, setUpiApp] = useState("GPay");
  const [upiId, setUpiId] = useState("");
  const [upiVerified, setUpiVerified] = useState(false);
  const [card, setCard] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [bank, setBank] = useState("HDFC Bank");
  const [wallet, setWallet] = useState("Paytm Wallet");

  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("Processing…");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const [placedOrder, setPlacedOrder] = useState<CustomerOrder | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: "success" | "warning" = "success") => {
    const id = (toastIdRef.current += 1);
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2900);
  }, []);

  // ── Auth gate: checkout requires a signed-in customer ──────────────────────
  useEffect(() => {
    const sync = () => setAuthState(isLoggedIn() ? "member" : "guest");
    sync();
    return onCustomerAuthChange(sync);
  }, []);

  useEffect(() => {
    if (authState === "guest" && !placedOrder) {
      router.replace("/login?redirect=/checkout");
    }
  }, [authState, placedOrder, router]);

  // ── Is the online payment gateway switched on? ────────────────────────────
  useEffect(() => {
    let ignore = false;
    customerPaymentAPI.getConfig().then((response) => {
      if (!ignore && response.success && response.data) setPaymentConfig(response.data);
    });
    return () => {
      ignore = true;
    };
  }, []);

  // ── Coupon handed over from the cart page ─────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    setCouponCode(readCheckoutCoupon());
  }, [hydrated]);

  // ── Address selection defaults to the customer's default address ──────────
  useEffect(() => {
    if (addresses.length === 0) {
      setSelectedAddressId(null);
      return;
    }
    setSelectedAddressId((current) => {
      if (current && addresses.some((address) => address.id === current)) return current;
      const preferred = addresses.find((address) => address.isDefault) ?? addresses[0];
      return preferred.id;
    });
  }, [addresses]);

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId]
  );

  // ── Only the items ticked on the cart page are checked out ────────────────
  const orderLines = useMemo(
    () => cartItems.filter((item) => item.selected !== false),
    [cartItems]
  );

  const totals = useMemo(
    () => computeOrderTotals(orderLines, { couponCode, deliveryType, paymentMethod }),
    [orderLines, couponCode, deliveryType, paymentMethod]
  );

  // ── Payment summary label ─────────────────────────────────────────────────
  const paymentDetail = useMemo(() => {
    switch (paymentMethod) {
      case "upi":
        return upiId.trim() ? upiId.trim() : UPI_APPS.find((app) => app.name === upiApp)?.label ?? "UPI";
      case "card": {
        const digits = card.number.replace(/\D/g, "");
        return digits ? `•••• ${digits.slice(-4)}` : "Card";
      }
      case "netbanking":
        return bank;
      case "wallet":
        return wallet;
      default:
        return "Pay on delivery";
    }
  }, [paymentMethod, upiApp, upiId, card.number, bank, wallet]);

  // ── Validation ────────────────────────────────────────────────────────────
  const addressError = !selectedAddress ? "Please add or select a delivery address" : null;

  const paymentError = useMemo(() => {
    if (paymentMethod !== "cod" && paymentConfig && !paymentConfig.enabled) {
      return "Online payment isn't available right now — please choose Cash on Delivery";
    }
    if (paymentMethod === "upi") {
      const typed = upiId.trim();
      if (typed && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(typed)) return "Enter a valid UPI ID (e.g. name@bank)";
      return null;
    }
    if (paymentMethod === "card") {
      if (!luhnValid(card.number)) return "Enter a valid card number";
      if (!card.name.trim()) return "Enter the name printed on the card";
      if (!expiryValid(card.expiry)) return "Enter a valid expiry date (MM/YY)";
      if (!/^\d{3,4}$/.test(card.cvv)) return "Enter the 3-digit CVV";
      return null;
    }
    if (paymentMethod === "netbanking" && !bank) return "Select a bank to continue";
    if (paymentMethod === "wallet" && !wallet) return "Select a wallet to continue";
    return null;
  }, [paymentMethod, upiId, card, bank, wallet, paymentConfig]);

  // ── Step navigation ───────────────────────────────────────────────────────
  const goStep = useCallback((step: Step) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goToPayment = useCallback(() => {
    if (addressError) {
      showToast(addressError, "warning");
      setShowNewAddress(true);
      return;
    }
    goStep(2);
  }, [addressError, goStep, showToast]);

  const goToReview = useCallback(() => {
    if (paymentError) {
      showToast(paymentError, "warning");
      return;
    }
    goStep(3);
  }, [goStep, paymentError, showToast]);

  // ── New address ───────────────────────────────────────────────────────────
  const handlePincode = (pin: string) => {
    const digits = pin.replace(/\D/g, "").slice(0, 6);
    setForm((current) => ({ ...current, pincode: digits }));
    const match = PINCODE_MAP[digits];
    if (digits.length === 6 && match) {
      setForm((current) => ({ ...current, city: match.city, state: match.state }));
      showToast(`Location detected: ${match.city}, ${match.state}`);
    }
  };

  const openNewAddress = () => {
    if (showNewAddress) {
      setShowNewAddress(false);
      return;
    }
    setForm((current) => ({
      ...current,
      name: current.name || `${profile.firstName} ${profile.lastName}`.trim(),
      phone: current.phone || profile.phone || "",
    }));
    setShowNewAddress(true);
  };

  const saveNewAddress = async () => {
    const phoneDigits = form.phone.replace(/\D/g, "");

    if (!form.name.trim()) return showToast("Full name is required", "warning");
    if (phoneDigits.length < 10) return showToast("Enter a valid 10-digit mobile number", "warning");
    if (!form.addr1.trim()) return showToast("Flat / house / building is required", "warning");
    if (form.pincode.length !== 6) return showToast("Enter a valid 6-digit pincode", "warning");
    if (!form.city.trim()) return showToast("City is required", "warning");
    if (!form.state.trim()) return showToast("State is required", "warning");

    setSavingAddress(true);
    const created = await addAddress({
      type: form.addrType,
      name: form.name.trim(),
      phone: phoneDigits.slice(-10),
      line1: form.addr1.trim(),
      line2: [form.addr2.trim(), form.landmark.trim()].filter(Boolean).join(", "),
      city: form.city.trim(),
      state: form.state.trim(),
      pinCode: form.pincode,
      isDefault: addresses.length === 0,
    });
    setSavingAddress(false);

    if (!created) {
      showToast("Could not save the address. Please try again.", "warning");
      return;
    }

    setSelectedAddressId(created.id);
    setShowNewAddress(false);
    setForm(EMPTY_FORM);
    showToast("Address saved and selected for this order");
  };

  // ── Place order ───────────────────────────────────────────────────────────
  const launchConfetti = useCallback(() => {
    const colors = ["#dc2626", "#ff6b35", "#22c55e", "#3b82f6", "#facc15", "#a855f7"];
    for (let i = 0; i < 60; i += 1) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.cssText = `
        left:${Math.random() * 100}vw;
        width:${Math.random() * 10 + 5}px;
        height:${Math.random() * 10 + 5}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:${Math.random() > 0.5 ? "50%" : "2px"};
        animation-duration:${Math.random() * 2 + 1.5}s;
        animation-delay:${Math.random() * 0.8}s;
      `;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 4000);
    }
  }, []);

  /** Success path shared by COD and by a verified online payment. */
  const finishOrder = useCallback(
    (order: CustomerOrder) => {
      setPlacedOrder(order);
      addOrder(orderFromApi(order));
      clearCart();
      clearCheckoutCoupon();
      setCouponCode(null);
      launchConfetti();
      void refreshOrders();
    },
    [addOrder, clearCart, launchConfetti, refreshOrders]
  );

  const placeOrder = useCallback(async () => {
    if (isProcessing) return;

    if (orderLines.length === 0) {
      showToast("Your cart is empty", "warning");
      return;
    }
    if (addressError) {
      showToast(addressError, "warning");
      goStep(1);
      return;
    }
    if (paymentError) {
      showToast(paymentError, "warning");
      goStep(2);
      return;
    }

    const payload: PlaceOrderPayload = {
      items: orderLines.map((item) => ({
        itemId: item.itemId ?? item.id,
        qty: Number(item.qty) || 1,
        unitPrice: Number(item.offerPrice) || 0,
        originalPrice: Number(item.originalPrice) || Number(item.offerPrice) || 0,
        itemName: item.itemName,
        brandName: item.brandName ?? null,
        categoryName: item.categoryName ?? null,
        variant: item.variant ?? null,
        colorName: item.colorName ?? null,
        primaryImage: item.primaryImage ?? null,
        gst: item.gst ?? null,
      })),
      addressId: selectedAddress?.id ?? null,
      address: selectedAddress
        ? {
            type: selectedAddress.type,
            name: selectedAddress.name,
            phone: selectedAddress.phone,
            line1: selectedAddress.line1,
            line2: selectedAddress.line2,
            city: selectedAddress.city,
            state: selectedAddress.state,
            pinCode: selectedAddress.pinCode,
          }
        : undefined,
      paymentMethod,
      paymentDetail,
      deliveryType,
      couponCode,
    };

    setIsProcessing(true);
    setProcessingLabel("Creating your order…");
    const response = await customerOrderAPI.place(payload);

    if (!response.success || !response.data) {
      setIsProcessing(false);
      showToast(response.message || "Could not place the order. Please try again.", "warning");
      return;
    }

    const order = response.data;

    if (order.unavailable && order.unavailable.length > 0) {
      showToast(`Skipped unavailable products: ${order.unavailable.join(", ")}`, "warning");
    }

    // ── Cash on delivery: nothing to collect, the order is already placed ──
    if (paymentMethod === "cod") {
      setIsProcessing(false);
      finishOrder(order);
      return;
    }

    // ── Everything else goes through Razorpay ─────────────────────────────
    setProcessingLabel("Opening secure payment…");

    const sessionResponse = await customerPaymentAPI.createRazorpayOrder(order.id);
    if (!sessionResponse.success || !sessionResponse.data) {
      setIsProcessing(false);
      showToast(
        sessionResponse.message || "Could not start the payment. Your order is saved as unpaid.",
        "warning"
      );
      return;
    }

    const session = sessionResponse.data;
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setIsProcessing(false);
      showToast("Could not reach the payment gateway. Check your connection and retry.", "warning");
      return;
    }

    const outcome = await openRazorpayCheckout({
      keyId: session.keyId,
      razorpayOrderId: session.razorpayOrderId,
      amount: session.amount,
      currency: session.currency,
      orderNumber: session.orderNumber,
      customerName: `${profile.firstName} ${profile.lastName}`.trim(),
      customerEmail: profile.email,
      customerPhone: selectedAddress?.phone || profile.phone,
    });

    if (outcome.status === "dismissed") {
      setIsProcessing(false);
      void customerPaymentAPI.reportRazorpayFailure({
        orderId: order.id,
        reason: "Customer closed the payment window",
      });
      void refreshOrders();
      showToast(`Payment cancelled. Order ${session.orderNumber} is saved — you can pay from My Orders.`, "warning");
      return;
    }

    if (outcome.status === "failed") {
      setIsProcessing(false);
      void customerPaymentAPI.reportRazorpayFailure({
        orderId: order.id,
        reason: outcome.error?.description || "Payment failed",
        razorpay_payment_id: outcome.error?.metadata?.payment_id,
      });
      void refreshOrders();
      showToast(outcome.error?.description || "Payment failed. Please try another method.", "warning");
      return;
    }

    setProcessingLabel("Confirming your payment…");
    const verification = await customerPaymentAPI.verifyRazorpayPayment({
      orderId: order.id,
      razorpay_order_id: outcome.payload.razorpay_order_id,
      razorpay_payment_id: outcome.payload.razorpay_payment_id,
      razorpay_signature: outcome.payload.razorpay_signature,
    });
    setIsProcessing(false);

    if (!verification.success) {
      void refreshOrders();
      showToast(
        verification.message ||
          "We could not confirm the payment. If money was debited, it will be refunded automatically.",
        "warning"
      );
      return;
    }

    finishOrder({
      ...order,
      status: "processing",
      statusLabel: "Order Placed",
      paymentStatus: "paid",
      providerPaymentId: verification.data?.paymentId ?? null,
    });
  }, [
    addressError,
    couponCode,
    deliveryType,
    finishOrder,
    goStep,
    isProcessing,
    orderLines,
    paymentDetail,
    paymentError,
    paymentMethod,
    profile.email,
    profile.firstName,
    profile.lastName,
    profile.phone,
    refreshOrders,
    selectedAddress,
    showToast,
  ]);

  const copyOrderId = () => {
    if (!placedOrder || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(placedOrder.orderNumber)
      .then(() => showToast("Order ID copied!"))
      .catch(() => showToast("Could not copy the order ID", "warning"));
  };

  const removeCoupon = () => {
    setCouponCode(null);
    saveCheckoutCoupon(null);
    showToast("Coupon removed", "warning");
  };

  const progressStep = currentStep + 1; // the cart itself is step 1 of the bar
  const showEmptyState = hydrated && authState === "member" && orderLines.length === 0 && !placedOrder;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Progress */}
      <div className="co-progress-wrap">
        <div className="co-progress">
          {PROGRESS_STEPS.map((label, index) => {
            const stepNum = index + 1;
            const isDone = placedOrder ? true : stepNum < progressStep;
            const isActive = !placedOrder && stepNum === progressStep;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center" }}>
                <div className="cp-step">
                  <div className={`cp-circle${isDone ? " done" : isActive ? " active" : ""}`}>
                    {isDone ? <i className="fas fa-check" /> : stepNum}
                  </div>
                  <div className={`cp-label${isDone ? " done" : isActive ? " active" : ""}`}>{label}</div>
                </div>
                {index < PROGRESS_STEPS.length - 1 && <div className={`cp-line${isDone ? " done" : ""}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <main style={{ background: "var(--bg)", minHeight: "60vh" }}>
        {!hydrated || authState === "checking" || (authState === "guest" && !placedOrder) ? (
          <div className="co-loading">
            <i className="fas fa-spinner fa-spin" />
            <span>{authState === "guest" ? "Redirecting to sign in…" : "Loading your checkout…"}</span>
          </div>
        ) : showEmptyState ? (
          <div className="co-empty">
            <div className="co-empty-icon"><i className="fas fa-bag-shopping" /></div>
            <h2>Nothing to check out yet</h2>
            <p>Your cart is empty, or none of the items in it are selected.</p>
            <div className="co-empty-actions">
              <Link href="/cart" className="co-empty-primary"><i className="fas fa-cart-shopping" /> Back to Cart</Link>
              <Link href="/products" className="co-empty-outline"><i className="fas fa-store" /> Continue Shopping</Link>
            </div>
          </div>
        ) : (
          <div className="co-page-inner">
            {/* LEFT: steps */}
            <div>
              {/* ─── STEP 1: ADDRESS ─── */}
              <div className={`co-panel${currentStep === 1 && !placedOrder ? " active" : ""}`}>
                <div className="co-card">
                  <div className="co-card-head">
                    <h2><div className="step-num">1</div> Delivery Address</h2>
                    <Link href="/cart" className="co-card-edit"><i className="fas fa-arrow-left" /> Back to cart</Link>
                  </div>
                  <div className="co-card-body">
                    <div className="co-section-label">
                      <i className="fas fa-location-dot" /> Choose a saved address
                    </div>

                    {addresses.length > 0 && (
                      <div className="saved-addresses">
                        {addresses.map((address) => (
                          <div
                            key={address.id}
                            className={`address-card${selectedAddressId === address.id ? " selected" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedAddressId(address.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedAddressId(address.id);
                              }
                            }}
                          >
                            <div className={`address-tag ${address.type}`}>
                              {address.type.charAt(0).toUpperCase() + address.type.slice(1)}
                              {address.isDefault ? " · Default" : ""}
                            </div>
                            <div className="address-name">{address.name}</div>
                            <div className="address-text">
                              {formatAddressLines(address).map((line, index) => (
                                <span key={index}>{line}<br /></span>
                              ))}
                            </div>
                            <div className="address-phone"><i className="fas fa-phone" /> {address.phone}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {addresses.length === 0 && (
                      <div className="field-hint" style={{ marginBottom: 18 }}>
                        <i className="fas fa-info-circle" /> No saved addresses yet — add one below to continue.
                      </div>
                    )}

                    <button className="add-new-address" type="button" onClick={openNewAddress}>
                      <i className={`fas ${showNewAddress ? "fa-times-circle" : "fa-plus-circle"}`} />
                      {showNewAddress ? "Cancel" : "Add a New Address"}
                    </button>

                    {showNewAddress && (
                      <div style={{ marginTop: 18, animation: "co-step-in 0.3s ease" }}>
                        <div className="co-section-label" style={{ marginTop: 0 }}>
                          <i className="fas fa-plus" /> New Delivery Address
                        </div>
                        <div className="form-grid">
                          <div className="form-group">
                            <label>Full Name <span className="req">*</span></label>
                            <input
                              className="form-input"
                              type="text"
                              placeholder="e.g. Saurabh Kapoor"
                              value={form.name}
                              onChange={(event) => setForm({ ...form, name: event.target.value })}
                            />
                          </div>
                          <div className="form-group">
                            <label>Mobile Number <span className="req">*</span></label>
                            <input
                              className="form-input"
                              type="tel"
                              inputMode="numeric"
                              placeholder="98765 43210"
                              maxLength={12}
                              value={form.phone}
                              onChange={(event) =>
                                setForm({ ...form, phone: event.target.value.replace(/[^\d\s]/g, "") })
                              }
                            />
                          </div>
                          <div className="form-group span-2">
                            <label>Flat / House No, Building <span className="req">*</span></label>
                            <input
                              className="form-input"
                              type="text"
                              placeholder="Flat 402, Sunrise Tower"
                              value={form.addr1}
                              onChange={(event) => setForm({ ...form, addr1: event.target.value })}
                            />
                          </div>
                          <div className="form-group span-2">
                            <label>Area, Street, Sector, Village</label>
                            <input
                              className="form-input"
                              type="text"
                              placeholder="Link Road, Malad West"
                              value={form.addr2}
                              onChange={(event) => setForm({ ...form, addr2: event.target.value })}
                            />
                          </div>
                          <div className="form-group">
                            <label>Pincode <span className="req">*</span></label>
                            <input
                              className="form-input"
                              type="text"
                              inputMode="numeric"
                              placeholder="400064"
                              maxLength={6}
                              value={form.pincode}
                              onChange={(event) => handlePincode(event.target.value)}
                            />
                            <div className="field-hint"><i className="fas fa-info-circle" /> City &amp; state auto-fill for known pincodes</div>
                          </div>
                          <div className="form-group">
                            <label>Landmark (Optional)</label>
                            <input
                              className="form-input"
                              type="text"
                              placeholder="Near Infinity Mall"
                              value={form.landmark}
                              onChange={(event) => setForm({ ...form, landmark: event.target.value })}
                            />
                          </div>
                          <div className="form-group">
                            <label>City <span className="req">*</span></label>
                            <input
                              className="form-input"
                              type="text"
                              placeholder="Mumbai"
                              value={form.city}
                              onChange={(event) => setForm({ ...form, city: event.target.value })}
                            />
                          </div>
                          <div className="form-group">
                            <label>State <span className="req">*</span></label>
                            <select
                              className="form-select"
                              value={form.state}
                              onChange={(event) => setForm({ ...form, state: event.target.value })}
                            >
                              <option value="">Select State</option>
                              {STATES.map((state) => <option key={state}>{state}</option>)}
                            </select>
                          </div>
                          <div className="form-group span-2">
                            <label>Address Type</label>
                            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                              {(["home", "work", "other"] as const).map((type) => (
                                <label key={type} className="co-radio-label">
                                  <input
                                    type="radio"
                                    name="addrType"
                                    value={type}
                                    checked={form.addrType === type}
                                    onChange={() => setForm({ ...form, addrType: type })}
                                    style={{ accentColor: "var(--brand)" }}
                                  />
                                  <i
                                    className={`fas ${type === "home" ? "fa-house" : type === "work" ? "fa-building" : "fa-location-dot"}`}
                                    style={{ color: type === "home" ? "var(--brand)" : type === "work" ? "var(--info)" : "var(--text-secondary)" }}
                                  />
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                          <button className="verify-btn" type="button" onClick={saveNewAddress} disabled={savingAddress}>
                            {savingAddress
                              ? <><i className="fas fa-spinner fa-spin" /> Saving…</>
                              : <><i className="fas fa-floppy-disk" /> Save Address</>}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Delivery speed */}
                    <div className="delivery-options-label"><i className="fas fa-truck" /> Choose Delivery Speed</div>
                    <div className="delivery-options">
                      {Object.values(DELIVERY_OPTIONS).map((option) => {
                        const cost = option.type === "free" ? totals.deliveryCharge : option.cost;
                        const isFree = option.type === "free" && totals.deliveryCharge === 0;
                        return (
                          <div
                            key={option.type}
                            className={`delivery-option${deliveryType === option.type ? " selected" : ""}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setDeliveryType(option.type)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setDeliveryType(option.type);
                              }
                            }}
                          >
                            <div className="do-radio" />
                            <div className="do-body">
                              <div className="do-title">
                                {option.label}
                                <span className={`do-badge ${option.badgeClass}`}>{isFree ? "FREE" : option.badge}</span>
                              </div>
                              <div className="do-desc">{option.desc}</div>
                            </div>
                            <div className={`do-price${cost === 0 ? " free" : ""}`}>
                              {cost === 0 ? "FREE" : `Rs ${formatRupees(cost)}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="step-actions">
                  <button className="btn-next" type="button" onClick={goToPayment}>
                    <i className="fas fa-arrow-right" /> Continue to Payment
                  </button>
                </div>
              </div>

              {/* ─── STEP 2: PAYMENT ─── */}
              <div className={`co-panel${currentStep === 2 && !placedOrder ? " active" : ""}`}>
                <div className="co-card">
                  <div className="co-card-head">
                    <h2><div className="step-num done"><i className="fas fa-check" /></div> Delivering to</h2>
                    <button className="co-card-edit" type="button" onClick={() => goStep(1)}><i className="fas fa-pen" /> Change</button>
                  </div>
                  <div className="co-card-body" style={{ padding: "14px 22px" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--ink)" }}>
                      <strong>{selectedAddress?.name}</strong> · {selectedAddress?.phone}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 4 }}>
                      {formatAddressLines(selectedAddress).join(", ")}
                    </div>
                    <div className="co-delivery-note">
                      <i className="fas fa-truck-fast" /> {DELIVERY_OPTIONS[deliveryType].label} ·{" "}
                      {totals.deliveryCharge === 0 ? "FREE" : `Rs ${formatRupees(totals.deliveryCharge)}`}
                    </div>
                  </div>
                </div>

                <div className="co-card">
                  <div className="co-card-head">
                    <h2><div className="step-num">2</div> Payment Method</h2>
                    <div className="co-secure-note"><i className="fas fa-lock" /> 100% Secure</div>
                  </div>
                  <div className="co-card-body">
                    <div className="payment-tabs">
                      {(["upi", "card", "netbanking", "wallet", "cod"] as PaymentMethod[]).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          className={`pay-tab${paymentMethod === tab ? " active" : ""}`}
                          onClick={() => setPaymentMethod(tab)}
                        >
                          <i className={`fas ${tab === "upi" ? "fa-qrcode" : tab === "card" ? "fa-credit-card" : tab === "netbanking" ? "fa-university" : tab === "wallet" ? "fa-wallet" : "fa-money-bill-wave"}`} />
                          {tab === "upi" ? "UPI" : tab === "card" ? "Cards" : tab === "netbanking" ? "Net Banking" : tab === "wallet" ? "Wallets" : "COD"}
                        </button>
                      ))}
                    </div>

                    {paymentConfig && !paymentConfig.enabled && paymentMethod !== "cod" && (
                      <div className="co-inline-error" style={{ marginTop: 0, marginBottom: 18 }}>
                        <i className="fas fa-circle-exclamation" />
                        Online payment isn&apos;t switched on yet. Pick <strong>COD</strong> to place this order.
                      </div>
                    )}

                    {paymentConfig?.enabled && paymentConfig.mode === "test" && paymentMethod !== "cod" && (
                      <div className="co-test-mode">
                        <i className="fas fa-flask" />
                        Test mode — use Razorpay test credentials. No real money is charged.
                      </div>
                    )}

                    {/* UPI */}
                    <div className={`pay-panel${paymentMethod === "upi" ? " active" : ""}`}>
                      <div className="pay-panel-label">Pay via UPI App</div>
                      <div className="upi-apps">
                        {UPI_APPS.map((app) => (
                          <button
                            key={app.name}
                            type="button"
                            className={`upi-app${upiApp === app.name && !upiId.trim() ? " selected" : ""}`}
                            onClick={() => {
                              setUpiApp(app.name);
                              setUpiId("");
                              setUpiVerified(false);
                            }}
                          >
                            <div className="upi-app-icon" style={app.style}>
                              {app.icon ? <i className={app.icon} /> : <span style={{ fontWeight: 800, fontSize: "1rem" }}>{app.text}</span>}
                            </div>
                            <div className="upi-app-name">{app.label}</div>
                          </button>
                        ))}
                      </div>
                      <div className="pay-panel-label">Or enter UPI ID manually</div>
                      <div className="upi-id-row">
                        <input
                          className="upi-id-input"
                          type="text"
                          placeholder="yourname@upi"
                          value={upiId}
                          onChange={(event) => {
                            setUpiId(event.target.value);
                            setUpiVerified(false);
                          }}
                        />
                        <button
                          className="verify-btn"
                          type="button"
                          onClick={() => {
                            const typed = upiId.trim();
                            if (!typed) {
                              showToast("Enter a UPI ID first", "warning");
                              return;
                            }
                            if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(typed)) {
                              setUpiVerified(false);
                              showToast("Invalid UPI ID format", "warning");
                              return;
                            }
                            setUpiVerified(true);
                            showToast(`UPI ID verified: ${typed}`);
                          }}
                        >
                          <i className="fas fa-check" /> Verify
                        </button>
                      </div>
                      <div className="upi-hint">
                        <i className={`fas ${upiVerified ? "fa-circle-check" : "fa-info-circle"}`} />
                        {upiVerified
                          ? "UPI ID verified — you'll approve the payment in your UPI app."
                          : "UPI payment is instant and secure."}
                      </div>
                    </div>

                    {/* Cards */}
                    <div className={`pay-panel${paymentMethod === "card" ? " active" : ""}`}>
                      <div className="pay-panel-label">Debit / Credit Card</div>
                      <div className="form-grid">
                        <div className="form-group span-2">
                          <label>Card Number <span className="req">*</span></label>
                          <input
                            className="form-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="1234 5678 9012 3456"
                            maxLength={19}
                            value={card.number}
                            onChange={(event) =>
                              setCard({
                                ...card,
                                number: event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 16)
                                  .replace(/(.{4})/g, "$1 ")
                                  .trim(),
                              })
                            }
                          />
                        </div>
                        <div className="form-group span-2">
                          <label>Name on Card <span className="req">*</span></label>
                          <input
                            className="form-input"
                            type="text"
                            placeholder="SAURABH KAPOOR"
                            value={card.name}
                            onChange={(event) => setCard({ ...card, name: event.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="form-group">
                          <label>Expiry Date <span className="req">*</span></label>
                          <input
                            className="form-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="MM / YY"
                            maxLength={5}
                            value={card.expiry}
                            onChange={(event) => {
                              const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
                              setCard({
                                ...card,
                                expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits,
                              });
                            }}
                          />
                        </div>
                        <div className="form-group">
                          <label>CVV <span className="req">*</span></label>
                          <input
                            className="form-input"
                            type="password"
                            inputMode="numeric"
                            placeholder="•••"
                            maxLength={4}
                            value={card.cvv}
                            onChange={(event) => setCard({ ...card, cvv: event.target.value.replace(/\D/g, "") })}
                          />
                          <div className="field-hint"><i className="fas fa-lock" /> Card details are never stored on our servers</div>
                        </div>
                      </div>
                      <div className="emi-info-box">
                        <i className="fas fa-tag" /> <strong>No-Cost EMI</strong> available from Rs{" "}
                        {formatRupees(Math.round(totals.total / 12))}/month on HDFC &amp; SBI cards
                      </div>
                    </div>

                    {/* Net banking */}
                    <div className={`pay-panel${paymentMethod === "netbanking" ? " active" : ""}`}>
                      <div className="pay-panel-label">Popular Banks</div>
                      <div className="netbanking-grid">
                        {BANKS.map((option) => (
                          <button
                            key={option.name}
                            type="button"
                            className={`nb-bank${bank === option.name ? " selected" : ""}`}
                            onClick={() => setBank(option.name)}
                          >
                            <div className="nb-bank-icon" style={option.style}>{option.short}</div>
                            <div className="nb-bank-name">{option.name}</div>
                          </button>
                        ))}
                      </div>
                      <div className="pay-panel-label">Other Banks</div>
                      <select
                        className="form-select"
                        value={OTHER_BANKS.includes(bank) ? bank : ""}
                        onChange={(event) => {
                          if (event.target.value) setBank(event.target.value);
                        }}
                      >
                        <option value="">Select your bank</option>
                        {OTHER_BANKS.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </div>

                    {/* Wallets */}
                    <div className={`pay-panel${paymentMethod === "wallet" ? " active" : ""}`}>
                      <div className="pay-panel-label">Choose Wallet</div>
                      <div className="wallet-grid">
                        {WALLETS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className={`wallet-opt${wallet === option ? " selected" : ""}`}
                            onClick={() => setWallet(option)}
                          >
                            <div className="wallet-icon">{WALLET_ICONS[option]}</div>
                            <div className="wallet-name">{option}</div>
                            <div className="wallet-bal">Linked account</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* COD */}
                    <div className={`pay-panel${paymentMethod === "cod" ? " active" : ""}`}>
                      <div className="cod-box selected">
                        <i className="fas fa-money-bill-wave" />
                        <h3>Cash on Delivery</h3>
                        <p>Pay in cash when your order arrives at your doorstep. No advance payment needed.</p>
                        <div className="cod-note">
                          <i className="fas fa-info-circle" />
                          {totals.codFee > 0
                            ? ` A COD handling fee of Rs ${formatRupees(totals.codFee)} applies on orders below Rs 1,000.`
                            : " This order qualifies for FREE Cash on Delivery."}
                        </div>
                      </div>
                    </div>

                    {paymentError && (
                      <div className="co-inline-error"><i className="fas fa-circle-exclamation" /> {paymentError}</div>
                    )}
                  </div>
                </div>

                <div className="step-actions">
                  <button className="btn-back" type="button" onClick={() => goStep(1)}><i className="fas fa-arrow-left" /> Back</button>
                  <button className="btn-next" type="button" onClick={goToReview}><i className="fas fa-eye" /> Review Order</button>
                </div>
              </div>

              {/* ─── STEP 3: REVIEW ─── */}
              <div className={`co-panel${currentStep === 3 && !placedOrder ? " active" : ""}`}>
                <div className="co-card">
                  <div className="co-card-head">
                    <h2><div className="step-num done"><i className="fas fa-check" /></div> Delivery Address</h2>
                    <button className="co-card-edit" type="button" onClick={() => goStep(1)}><i className="fas fa-pen" /> Change</button>
                  </div>
                  <div className="co-card-body" style={{ padding: "14px 22px" }}>
                    <div style={{ fontSize: "0.85rem", color: "var(--ink)" }}>
                      <strong>{selectedAddress?.name}</strong> · {selectedAddress?.phone}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 4 }}>
                      {formatAddressLines(selectedAddress).join(", ")}
                    </div>
                    <div className="co-delivery-note">
                      <i className="fas fa-truck-fast" /> {DELIVERY_OPTIONS[deliveryType].label} ·{" "}
                      {totals.deliveryCharge === 0 ? "FREE" : `Rs ${formatRupees(totals.deliveryCharge)}`}
                    </div>
                  </div>
                </div>

                <div className="co-card">
                  <div className="co-card-head">
                    <h2><div className="step-num done"><i className="fas fa-check" /></div> Payment Method</h2>
                    <button className="co-card-edit" type="button" onClick={() => goStep(2)}><i className="fas fa-pen" /> Change</button>
                  </div>
                  <div className="co-card-body co-payment-summary">
                    <div className="co-payment-icon">
                      <i className={`fas ${paymentMethod === "upi" ? "fa-qrcode" : paymentMethod === "card" ? "fa-credit-card" : paymentMethod === "netbanking" ? "fa-university" : paymentMethod === "wallet" ? "fa-wallet" : "fa-money-bill-wave"}`} />
                    </div>
                    <div>
                      <div className="co-payment-title">
                        {paymentMethod === "upi" ? "UPI" : paymentMethod === "card" ? "Card" : paymentMethod === "netbanking" ? "Net Banking" : paymentMethod === "wallet" ? "Wallet" : "Cash on Delivery"}
                        {" — "}
                        {paymentDetail}
                      </div>
                      <div className="co-payment-sub">
                        {paymentMethod === "cod" ? "Pay when your order arrives" : "You'll be asked to authorise this payment"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="co-card">
                  <div className="co-card-head">
                    <h2><div className="step-num">3</div> Order Items</h2>
                    <Link href="/cart" className="co-card-edit"><i className="fas fa-pen" /> Edit cart</Link>
                  </div>
                  <div className="co-card-body">
                    <div className="review-items">
                      {orderLines.map((item) => {
                        const qty = Number(item.qty) || 1;
                        const price = Number(item.offerPrice) || 0;
                        return (
                          <div key={item.id} className="ri-card">
                            <div className="ri-img">
                              <img
                                src={getImageUrl(item.primaryImage, "/placeholder.svg")}
                                alt={item.itemName}
                                loading="lazy"
                                onError={(event) => {
                                  const img = event.currentTarget;
                                  img.onerror = null;
                                  img.src = "/placeholder.svg";
                                }}
                              />
                            </div>
                            <div className="ri-body">
                              <div className="ri-brand">{item.brandName || "AppleNext"}</div>
                              <div className="ri-name">{item.itemName}</div>
                              <div className="ri-meta">
                                Qty: {qty}
                                {item.variant ? ` · ${item.variant}` : ""}
                                {item.colorName ? ` · ${item.colorName}` : ""}
                              </div>
                            </div>
                            <div className="ri-price">
                              <div className="rprice">Rs {formatRupees(price * qty)}</div>
                              <div className="rqty">Rs {formatRupees(price)} each</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="co-card notice-box">
                  <div className="co-card-body" style={{ padding: "16px 22px" }}>
                    <div className="notice-head"><i className="fas fa-triangle-exclamation" /> Please review before placing your order</div>
                    <div className="notice-item"><i className="fas fa-check" /> Returns accepted within 10 days of delivery</div>
                    <div className="notice-item"><i className="fas fa-check" /> All products come with manufacturer warranty</div>
                    <div className="notice-item"><i className="fas fa-check" /> By placing this order you agree to our <Link href="/faq">Terms &amp; Conditions</Link></div>
                  </div>
                </div>

                <div className="step-actions">
                  <button className="btn-back" type="button" onClick={() => goStep(2)}><i className="fas fa-arrow-left" /> Back</button>
                  <button className="btn-next" type="button" onClick={placeOrder} disabled={isProcessing}>
                    {isProcessing
                      ? <><i className="fas fa-spinner fa-spin" /> {processingLabel}</>
                      : <><i className="fas fa-lock" /> {paymentMethod === "cod" ? "Place Order" : `Pay Rs ${formatRupees(totals.total)}`}</>}
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: order summary */}
            <div className="co-os-card">
              <div className="co-os-title"><i className="fas fa-receipt" /> Order Summary</div>

              <div className="co-os-items">
                {orderLines.map((item) => {
                  const qty = Number(item.qty) || 1;
                  const price = Number(item.offerPrice) || 0;
                  return (
                    <div key={item.id} className="co-os-item">
                      <div className="co-os-item-img">
                        <img
                          src={getImageUrl(item.primaryImage, "/placeholder.svg")}
                          alt={item.itemName}
                          loading="lazy"
                          onError={(event) => {
                            const img = event.currentTarget;
                            img.onerror = null;
                            img.src = "/placeholder.svg";
                          }}
                        />
                      </div>
                      <div className="co-os-item-info">
                        <div className="co-os-item-name">{item.itemName}</div>
                        <div className="co-os-item-qty">Qty: {qty}</div>
                      </div>
                      <div className="co-os-item-price">Rs {formatRupees(price * qty)}</div>
                    </div>
                  );
                })}
              </div>

              <hr className="co-os-divider" />

              <div className="co-price-rows">
                <div className="co-price-row">
                  <span className="cpr-label">Subtotal ({totals.unitCount} item{totals.unitCount === 1 ? "" : "s"})</span>
                  <span className="cpr-val">Rs {formatRupees(totals.subtotal)}</span>
                </div>
                {totals.productDiscount > 0 && (
                  <div className="co-price-row saving">
                    <span className="cpr-label">Product Discount</span>
                    <span className="cpr-val">−Rs {formatRupees(totals.productDiscount)}</span>
                  </div>
                )}
                {couponCode && (
                  <div className="co-price-row saving">
                    <span className="cpr-label">
                      Coupon ({couponCode})
                      <button className="co-coupon-remove" type="button" onClick={removeCoupon} title="Remove coupon">
                        <i className="fas fa-xmark" />
                      </button>
                    </span>
                    <span className="cpr-val">−Rs {formatRupees(totals.couponDiscount)}</span>
                  </div>
                )}
                {totals.platformDiscount > 0 && (
                  <div className="co-price-row saving">
                    <span className="cpr-label">Platform Discount</span>
                    <span className="cpr-val">−Rs {formatRupees(totals.platformDiscount)}</span>
                  </div>
                )}
                <div className="co-price-row">
                  <span className="cpr-label">Delivery</span>
                  <span className="cpr-val" style={{ color: totals.deliveryCharge === 0 ? "var(--success)" : "var(--ink)" }}>
                    {totals.deliveryCharge === 0 ? "FREE" : `Rs ${formatRupees(totals.deliveryCharge)}`}
                  </span>
                </div>
                {totals.codFee > 0 && (
                  <div className="co-price-row">
                    <span className="cpr-label">COD Handling Fee</span>
                    <span className="cpr-val">Rs {formatRupees(totals.codFee)}</span>
                  </div>
                )}
                <div className="co-price-row">
                  <span className="cpr-label">GST</span>
                  <span className="cpr-val">Rs {formatRupees(totals.tax)}</span>
                </div>
                <div className="co-price-row total">
                  <span className="cpr-label">Total</span>
                  <span className="cpr-val">Rs {formatRupees(totals.total)}</span>
                </div>
              </div>

              {totals.totalSaving > 0 && (
                <div className="co-savings-note">
                  <i className="fas fa-tag" /> You save Rs {formatRupees(totals.totalSaving)} on this order!
                </div>
              )}

              {couponCode && COUPONS[couponCode] && (
                <div className="co-coupon-note">
                  <i className="fas fa-ticket" /> {COUPONS[couponCode].label} — applied from your cart
                </div>
              )}

              <button
                className="place-order-btn"
                type="button"
                onClick={currentStep === 3 ? placeOrder : currentStep === 1 ? goToPayment : goToReview}
                disabled={isProcessing || orderLines.length === 0}
              >
                {isProcessing
                  ? <><i className="fas fa-spinner fa-spin" /> {processingLabel}</>
                  : currentStep === 3
                    ? <><i className="fas fa-lock" /> {paymentMethod === "cod" ? "Place Order" : "Pay"} · Rs {formatRupees(totals.total)}</>
                    : <><i className="fas fa-arrow-right" /> {currentStep === 1 ? "Continue to Payment" : "Review Order"}</>}
              </button>

              <div className="co-trust-row">
                <div className="co-trust-item"><i className="fas fa-shield-halved" /> Secure</div>
                <div className="co-trust-item"><i className="fas fa-certificate" /> Genuine</div>
                <div className="co-trust-item"><i className="fas fa-rotate-left" /> Easy Return</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Success overlay */}
      <div className={`success-overlay${placedOrder ? " show" : ""}`}>
        <div className="success-modal">
          <div className="success-check"><i className="fas fa-check" /></div>
          <h2>Order Placed!</h2>
          <p>
            Thanks {profile.firstName || "there"} — your order for{" "}
            <strong>Rs {formatRupees(placedOrder?.totalAmount ?? 0)}</strong> is confirmed.
            You&apos;ll receive a confirmation on {profile.phone || "your registered number"} shortly.
          </p>
          <div className="order-id-box">
            Order ID: <strong>{placedOrder?.orderNumber}</strong>
            <button className="order-id-copy" type="button" onClick={copyOrderId} title="Copy">
              <i className="fas fa-copy" />
            </button>
          </div>
          <div className="delivery-promise">
            <i className="fas fa-truck-fast" />
            <div>
              {placedOrder?.deliveryLabel || "Standard Delivery"} ·{" "}
              {placedOrder?.paymentMethod === "cod" ? "Pay on delivery" : "Payment confirmed"}
              <br />
              Track your order anytime in My Account → Orders
            </div>
          </div>
          <div className="success-actions">
            <Link href="/account#orders" className="sa-track"><i className="fas fa-map-pin" /> Track Order</Link>
            <Link href="/" className="sa-home"><i className="fas fa-house" /> Continue Shopping</Link>
          </div>
        </div>
      </div>

      {/* Mini footer */}
      <div className="co-footer">
        <div className="co-footer-links">
          <Link href="/">© 2026 AppleNext Electronics</Link>
          <Link href="/faq">Privacy Policy</Link>
          <Link href="/faq">Terms &amp; Conditions</Link>
          <Link href="/faq">Contact Support</Link>
        </div>
        <div className="co-footer-copy">All rights reserved.</div>
      </div>

      {/* Toasts */}
      <div className="co-toast-wrap">
        {toasts.map((toast) => (
          <div key={toast.id} className={`co-toast ${toast.type}`}>
            <i className={`fas ${toast.type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`} />
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}
