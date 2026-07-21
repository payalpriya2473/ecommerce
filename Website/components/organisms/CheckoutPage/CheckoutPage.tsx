"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { useAccount } from "@/lib/account/account-context";
import "./CheckoutPage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;
type PayTab = "upi" | "card" | "netbanking" | "wallet" | "cod";

interface Toast {
  id: number;
  message: string;
  type: "success" | "warning";
}

interface OrderItem {
  id: number;
  brand: string;
  name: string;
  img: string;
  price: number;
  original: number;
  qty: number;
}

interface DeliveryOption {
  type: string;
  label: string;
  cost: number;
}

// ─── Static Data ──────────────────────────────────────────────────────────────
const ORDER_ITEMS: OrderItem[] = [
  { id: 1, brand: "Apple", name: "iPhone 16 Pro Max 256GB Natural Titanium", img: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&q=80", price: 134900, original: 139900, qty: 1 },
  { id: 2, brand: "Samsung", name: "Galaxy S24 Ultra 256GB Titanium Black", img: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&q=80", price: 109999, original: 124999, qty: 1 },
  { id: 3, brand: "Sony", name: "WH-1000XM5 Wireless Headphones", img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80", price: 24990, original: 29990, qty: 2 },
];

const STATES = ["Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "Gujarat", "Rajasthan", "Telangana", "West Bengal", "Uttar Pradesh", "Madhya Pradesh", "Kerala", "Punjab"];

const PINCODE_MAP: Record<string, { city: string; state: string }> = {
  "400064": { city: "Mumbai", state: "Maharashtra" },
  "400001": { city: "Mumbai", state: "Maharashtra" },
  "110001": { city: "New Delhi", state: "Delhi" },
  "560001": { city: "Bengaluru", state: "Karnataka" },
  "600001": { city: "Chennai", state: "Tamil Nadu" },
};

const ANN_ITEMS = [
  { icon: "fa-shield-halved", text: "100% Secure Checkout — All data encrypted" },
  { icon: "fa-credit-card", text: "No-Cost EMI on HDFC, SBI & Axis Bank" },
  { icon: "fa-truck-fast", text: "Free Express Delivery on this order" },
  { icon: "fa-rotate-left", text: "10-Day Easy Return Policy" },
];

// ─── Progress Config ──────────────────────────────────────────────────────────
const PROGRESS_STEPS = ["Cart", "Address", "Payment", "Confirm"];

// ─── Component ────────────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOption>({ type: "free", label: "Standard Delivery", cost: 0 });
  const [selectedAddr, setSelectedAddr] = useState<number>(-1);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [activePayTab, setActivePayTab] = useState<PayTab>("upi");
  const [selectedUpiApp, setSelectedUpiApp] = useState("GPay");
  const [selectedCard, setSelectedCard] = useState<number>(0);
  const [selectedNB, setSelectedNB] = useState<number>(0);
  const [selectedWallet, setSelectedWallet] = useState<number>(0);
  const [showNewCard, setShowNewCard] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { profile, addresses, addAddress } = useAccount();

  // ── New address form state ──
  const [form, setForm] = useState({ name: "", phone: "", addr1: "", addr2: "", pincode: "", landmark: "", city: "", state: "", addrType: "home" });
  const selectedAddress = addresses[selectedAddr] ?? addresses.find((address) => address.isDefault) ?? null;

  // ── Pricing ──
  const subtotal = ORDER_ITEMS.reduce((s, i) => s + i.price * i.qty, 0);
  const originalTotal = ORDER_ITEMS.reduce((s, i) => s + i.original * i.qty, 0);
  const productDisc = originalTotal - subtotal;
  const couponDisc = 3000;
  const tax = Math.round((subtotal - couponDisc) * 0.018);
  const total = subtotal - couponDisc + selectedDelivery.cost + tax;

  // ── Toast ──
  const showToast = useCallback((message: string, type: "success" | "warning" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2900);
  }, []);

  // ── Step navigation ──
  const goStep = (step: Step) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Pincode lookup ──
  const handlePincode = (pin: string) => {
    setForm((f) => ({ ...f, pincode: pin }));
    if (pin.length === 6 && PINCODE_MAP[pin]) {
      const { city, state } = PINCODE_MAP[pin];
      setForm((f) => ({ ...f, city, state }));
      showToast(`Location: ${city}, ${state}`);
    }
  };

  const saveNewAddress = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.addr1.trim()) {
      showToast("Name, phone, and address are required", "warning");
      return;
    }

    await addAddress({
      type: form.addrType as "home" | "work" | "other",
      name: form.name.trim(),
      phone: form.phone.trim(),
      line1: form.addr1.trim(),
      line2: [form.addr2.trim(), form.landmark.trim()].filter(Boolean).join(", "),
      city: form.city.trim(),
      state: form.state.trim(),
      pinCode: form.pincode.trim(),
      isDefault: addresses.length === 0,
    });

    setSelectedAddr(addresses.length);
    setShowNewAddress(false);
    setForm({ name: "", phone: "", addr1: "", addr2: "", pincode: "", landmark: "", city: "", state: "", addrType: "home" });
    showToast("Address saved for checkout");
  };

  // ── Place Order ──
  const placeOrder = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const id = `MB-2025-${Math.floor(Math.random() * 900000 + 100000)}`;
      setOrderId(id);
      setShowSuccess(true);
      launchConfetti();
      setIsProcessing(false);
    }, 1800);
  };

  const launchConfetti = () => {
    const colors = ["#dc2626", "#ff6b35", "#22c55e", "#3b82f6", "#facc15", "#a855f7"];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement("div");
      el.className = "confetti-piece";
      el.style.cssText = `
        left:${Math.random() * 100}vw;
        width:${Math.random() * 10 + 5}px;
        height:${Math.random() * 10 + 5}px;
        background:${colors[Math.floor(Math.random() * colors.length)]};
        border-radius:${Math.random() > 0.5 ? "50%" : "2px"};
        animation-duration:${Math.random() * 2 + 1.5}s;
        animation-delay:${Math.random() * 0.8}s;
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  };

  const copyOrderId = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(orderId).then(() => showToast("Order ID copied!"));
  };

  // ── Progress indicators ──
  const progressStep = currentStep + 1; // cart is step 1 in progress bar

  return (
    <>
      {/* Progress */}
      <div className="co-progress-wrap">
        <div className="co-progress">
          {PROGRESS_STEPS.map((label, i) => {
            const stepNum = i + 1;
            const isDone = stepNum < progressStep;
            const isActive = stepNum === progressStep;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center" }}>
                <div className="cp-step">
                  <div className={`cp-circle${isDone ? " done" : isActive ? " active" : ""}`}>
                    {isDone ? <i className="fas fa-check" /> : stepNum}
                  </div>
                  <div className={`cp-label${isDone ? " done" : isActive ? " active" : ""}`}>{label}</div>
                </div>
                {i < PROGRESS_STEPS.length - 1 && <div className={`cp-line${isDone ? " done" : ""}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main */}
      <main style={{ background: "#f8fafc", minHeight: "60vh" }}>
        <div className="co-page-inner">
          {/* LEFT: Steps */}
          <div>
            {/* ─── STEP 1: ADDRESS ─── */}
            <div className={`co-panel${currentStep === 1 ? " active" : ""}`}>
              <div className="co-card">
                <div className="co-card-head">
                  <h2><div className="step-num">1</div> Delivery Address</h2>
                </div>
                <div className="co-card-body">
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <i className="fas fa-location-dot" style={{ color: "#dc2626" }} /> Choose a saved address
                  </div>

                  <div className="saved-addresses">
                    {addresses.map((addr, i) => (
                      <div key={addr.id} className={`address-card${selectedAddr === i ? " selected" : ""}`} onClick={() => setSelectedAddr(i)}>
                        <div className={`address-tag ${addr.type}`}>{addr.type.charAt(0).toUpperCase() + addr.type.slice(1)}</div>
                        <div className="address-name">{addr.name}</div>
                        <div className="address-text">
                          {[addr.line1, addr.line2, [addr.city, addr.state, addr.pinCode].filter(Boolean).join(", ")].filter(Boolean).map((line, j) => <span key={j}>{line}<br /></span>)}
                        </div>
                        <div className="address-phone"><i className="fas fa-phone" /> {addr.phone}</div>
                      </div>
                    ))}
                  </div>

                  {addresses.length === 0 ? (
                    <div className="field-hint" style={{ marginBottom: 18 }}>
                      <i className="fas fa-info-circle" /> No saved addresses yet. Add one below or manage them in My Account.
                    </div>
                  ) : null}

                  <button className="add-new-address" onClick={() => {
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
                  }}>
                    <i className={`fas ${showNewAddress ? "fa-times-circle" : "fa-plus-circle"}`} />
                    {showNewAddress ? "Cancel" : "Add a New Address"}
                  </button>

                  {showNewAddress && (
                    <div style={{ marginTop: 18, animation: "stepIn 0.3s ease" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                        <i className="fas fa-plus" style={{ color: "#dc2626" }} /> New Delivery Address
                      </div>
                      <div className="form-grid">
                        <div className="form-group">
                          <label>Full Name <span className="req">*</span></label>
                          <input className="form-input" type="text" placeholder="e.g. Saurabh Kapoor" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label>Mobile Number <span className="req">*</span></label>
                          <input className="form-input" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={13} />
                        </div>
                        <div className="form-group span-2">
                          <label>Flat / House No, Building <span className="req">*</span></label>
                          <input className="form-input" type="text" placeholder="Flat 402, Sunrise Tower" value={form.addr1} onChange={(e) => setForm({ ...form, addr1: e.target.value })} />
                        </div>
                        <div className="form-group span-2">
                          <label>Area, Street, Sector, Village</label>
                          <input className="form-input" type="text" placeholder="Link Road, Malad West" value={form.addr2} onChange={(e) => setForm({ ...form, addr2: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label>Pincode <span className="req">*</span></label>
                          <input className="form-input" type="text" placeholder="400064" maxLength={6} value={form.pincode} onChange={(e) => handlePincode(e.target.value)} />
                          <div className="field-hint"><i className="fas fa-info-circle" /> City & State auto-fill on valid pincode</div>
                        </div>
                        <div className="form-group">
                          <label>Landmark (Optional)</label>
                          <input className="form-input" type="text" placeholder="Near Infinity Mall" value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label>City <span className="req">*</span></label>
                          <input className="form-input" type="text" placeholder="Mumbai" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label>State <span className="req">*</span></label>
                          <select className="form-select" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                            <option value="">Select State</option>
                            {STATES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div className="form-group span-2">
                          <label>Address Type</label>
                          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                            {["home", "work", "other"].map((type) => (
                              <label key={type} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                                <input type="radio" name="addrType" value={type} checked={form.addrType === type} onChange={() => setForm({ ...form, addrType: type })} style={{ accentColor: "#dc2626" }} />
                                <i className={`fas ${type === "home" ? "fa-house" : type === "work" ? "fa-building" : "fa-location-dot"}`} style={{ color: type === "home" ? "#dc2626" : type === "work" ? "#3b82f6" : "#64748b" }} />
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                        <button className="verify-btn" type="button" onClick={saveNewAddress}>
                          <i className="fas fa-floppy-disk" /> Save Address
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Delivery Options */}
                  <div className="delivery-options-label"><i className="fas fa-truck" /> Choose Delivery Speed</div>
                  <div className="delivery-options">
                    {[
                      { type: "free", label: "Standard Delivery", badge: "FREE", badgeClass: "free", desc: "Delivered by Tomorrow · Between 9 AM – 9 PM", price: "FREE", cost: 0 },
                      { type: "express", label: "Express Delivery", badge: "FAST", badgeClass: "fast", desc: "Delivered by Today by 10 PM · Priority handling", price: "Rs 79", cost: 79 },
                      { type: "scheduled", label: "Scheduled Delivery", badge: "CHOOSE SLOT", badgeClass: "premium", desc: "Pick a 2-hour delivery window that suits you", price: "Rs 49", cost: 49 },
                    ].map((opt) => (
                      <div
                        key={opt.type}
                        className={`delivery-option${selectedDelivery.type === opt.type ? " selected" : ""}`}
                        onClick={() => { setSelectedDelivery({ type: opt.type, label: opt.label, cost: opt.cost }); showToast(`${opt.label} selected`); }}
                      >
                        <div className="do-radio" />
                        <div className="do-body">
                          <div className="do-title">{opt.label} <span className={`do-badge ${opt.badgeClass}`}>{opt.badge}</span></div>
                          <div className="do-desc">{opt.desc}</div>
                        </div>
                        <div className={`do-price${opt.cost === 0 ? " free" : ""}`}>{opt.price}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="step-actions">
                <button className="btn-next" onClick={() => {
                  if (!selectedAddress) {
                    showToast("Please add or select a delivery address", "warning");
                    return;
                  }
                  goStep(2);
                }}><i className="fas fa-arrow-right" /> Continue to Payment</button>
              </div>
            </div>

            {/* ─── STEP 2: PAYMENT ─── */}
            <div className={`co-panel${currentStep === 2 ? " active" : ""}`}>
              {/* Address summary */}
              <div className="co-card">
                <div className="co-card-head">
                  <h2><div className="step-num done"><i className="fas fa-check" /></div> Delivering to</h2>
                  <button className="co-card-edit" onClick={() => goStep(1)}><i className="fas fa-pen" /> Change</button>
                </div>
                <div className="co-card-body" style={{ padding: "14px 22px" }}>
                  <div style={{ fontSize: "0.85rem", color: "#0f172a" }}><strong>Saurabh Kapoor</strong> · +91 98765 43210</div>
                  <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 4 }}>402, Sunrise Tower, Link Road, Malad West, Mumbai - 400064, Maharashtra</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 700, color: "#16a34a", marginTop: 8 }}>
                    <i className="fas fa-truck-fast" /> {selectedDelivery.label} · {selectedDelivery.cost === 0 ? "FREE" : `Rs ${selectedDelivery.cost}`} · Arriving Tomorrow
                  </div>
                </div>
              </div>

              {/* Payment Methods */}
              <div className="co-card">
                <div className="co-card-head">
                  <h2><div className="step-num">2</div> Payment Method</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "#16a34a", fontWeight: 700 }}><i className="fas fa-lock" /> 100% Secure</div>
                </div>
                <div className="co-card-body">
                  {/* Tabs */}
                  <div className="payment-tabs">
                    {(["upi", "card", "netbanking", "wallet", "cod"] as PayTab[]).map((tab) => (
                      <button key={tab} className={`pay-tab${activePayTab === tab ? " active" : ""}`} onClick={() => setActivePayTab(tab)}>
                        <i className={`fas ${tab === "upi" ? "fa-qrcode" : tab === "card" ? "fa-credit-card" : tab === "netbanking" ? "fa-university" : tab === "wallet" ? "fa-wallet" : "fa-money-bill-wave"}`} />
                        {tab === "upi" ? "UPI" : tab === "card" ? "Cards" : tab === "netbanking" ? "Net Banking" : tab === "wallet" ? "Wallets" : "COD"}
                      </button>
                    ))}
                  </div>

                  {/* UPI */}
                  <div className={`pay-panel${activePayTab === "upi" ? " active" : ""}`}>
                    <div className="pay-panel-label">Pay via UPI App</div>
                    <div className="upi-apps">
                      {[
                        { name: "GPay", label: "Google Pay", style: { background: "#e8f5e9", color: "#34a853" }, icon: "fab fa-google-pay" },
                        { name: "PhonePe", label: "PhonePe", style: { background: "#f3e8ff", color: "#7c3aed" }, icon: "fas fa-bolt" },
                        { name: "Paytm", label: "Paytm", style: { background: "#eff6ff", color: "#1d4ed8" }, text: "Pay" },
                        { name: "BHIM", label: "BHIM UPI", style: { background: "#fff1f2", color: "#dc2626" }, text: "BHIM" },
                      ].map((app) => (
                        <button key={app.name} className={`upi-app${selectedUpiApp === app.name ? " selected" : ""}`} onClick={() => { setSelectedUpiApp(app.name); showToast(`${app.label} selected`); }}>
                          <div className="upi-app-icon" style={app.style}>{app.icon ? <i className={app.icon} /> : <span style={{ fontWeight: 800, fontSize: "1rem" }}>{app.text}</span>}</div>
                          <div className="upi-app-name">{app.label}</div>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: 10 }}>Or enter UPI ID manually</div>
                    <div className="upi-id-row">
                      <input className="upi-id-input" type="text" placeholder="yourname@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
                      <button className="verify-btn" onClick={() => {
                        if (!upiId) { showToast("Enter a UPI ID first", "warning"); return; }
                        if (upiId.includes("@")) {
                          showToast(`UPI ID verified: ${upiId}`);
                        } else {
                          showToast("Invalid UPI ID format", "warning");
                        }
                      }}><i className="fas fa-check" /> Verify</button>
                    </div>
                    <div className="upi-hint"><i className="fas fa-info-circle" /> UPI payment is instant and secure</div>
                  </div>

                  {/* Cards */}
                  <div className={`pay-panel${activePayTab === "card" ? " active" : ""}`}>
                    <div className="pay-panel-label">Saved Cards</div>
                    <div className="saved-cards">
                      {[
                        { type: "visa", num: "4512", sub: "Saurabh Kapoor · Expires 09/27", emi: "No-Cost EMI" },
                        { type: "mastercard", num: "7890", sub: "Saurabh Kapoor · Expires 03/26", emi: "" },
                      ].map((card, i) => (
                        <div key={i} className={`saved-card-row${selectedCard === i ? " selected" : ""}`} onClick={() => setSelectedCard(i)}>
                          <div className={`card-brand-icon ${card.type}`}>{card.type === "visa" ? "VISA" : "MC"}</div>
                          <div className="card-info">
                            <div className="card-num">•••• •••• •••• {card.num}</div>
                            <div className="card-sub">{card.sub}</div>
                          </div>
                          {card.emi && <div className="card-emi-badge">{card.emi}</div>}
                        </div>
                      ))}
                    </div>
                    <button className="add-new-card-btn" onClick={() => setShowNewCard(!showNewCard)}>
                      <i className="fas fa-plus-circle" /> Add New Debit/Credit Card
                    </button>
                    {showNewCard && (
                      <div className="add-card-form">
                        <div className="form-grid" style={{ marginTop: 16 }}>
                          <div className="form-group span-2">
                            <label>Card Number <span className="req">*</span></label>
                            <input className="form-input" type="text" placeholder="1234 5678 9012 3456" maxLength={19} />
                          </div>
                          <div className="form-group span-2">
                            <label>Name on Card <span className="req">*</span></label>
                            <input className="form-input" type="text" placeholder="SAURABH KAPOOR" />
                          </div>
                          <div className="form-group">
                            <label>Expiry Date <span className="req">*</span></label>
                            <input className="form-input" type="text" placeholder="MM / YY" maxLength={7} />
                          </div>
                          <div className="form-group">
                            <label>CVV <span className="req">*</span></label>
                            <input className="form-input" type="password" placeholder="•••" maxLength={4} />
                            <div className="field-hint"><i className="fas fa-info-circle" /> 3-digit code on back of card</div>
                          </div>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", fontWeight: 600, color: "#475569", marginTop: 10, cursor: "pointer" }}>
                          <input type="checkbox" defaultChecked style={{ accentColor: "#dc2626" }} /> Save this card securely for future payments
                        </label>
                      </div>
                    )}
                    <div className="emi-info-box">
                      <i className="fas fa-tag" /> <strong>No-Cost EMI</strong> available from Rs 4,231/month on HDFC & SBI cards
                    </div>
                  </div>

                  {/* Net Banking */}
                  <div className={`pay-panel${activePayTab === "netbanking" ? " active" : ""}`}>
                    <div className="pay-panel-label">Popular Banks</div>
                    <div className="netbanking-grid">
                      {[
                        { name: "HDFC Bank", short: "HDFC", style: { background: "linear-gradient(135deg, #003399, #0066cc)" } },
                        { name: "State Bank", short: "SBI", style: { background: "linear-gradient(135deg, #003399, #1565c0)" } },
                        { name: "Axis Bank", short: "AXIS", style: { background: "linear-gradient(135deg, #8b0000, #cc0000)" } },
                        { name: "ICICI Bank", short: "ICICI", style: { background: "linear-gradient(135deg, #ff6600, #cc5200)" } },
                      ].map((bank, i) => (
                        <button key={i} className={`nb-bank${selectedNB === i ? " selected" : ""}`} onClick={() => { setSelectedNB(i); showToast(`${bank.name} selected`); }}>
                          <div className="nb-bank-icon" style={bank.style}>{bank.short}</div>
                          <div className="nb-bank-name">{bank.name}</div>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#475569", marginBottom: 10 }}>Other Banks</div>
                    <select className="form-select">
                      <option>Select your bank</option>
                      {["Kotak Mahindra Bank", "Yes Bank", "Bank of Baroda", "Punjab National Bank", "Canara Bank", "IndusInd Bank", "Federal Bank"].map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </div>

                  {/* Wallets */}
                  <div className={`pay-panel${activePayTab === "wallet" ? " active" : ""}`}>
                    <div className="pay-panel-label">Choose Wallet</div>
                    <div className="wallet-grid">
                      {[
                        { emoji: "💙", name: "Paytm Wallet", bal: "Rs 1,250" },
                        { emoji: "💜", name: "PhonePe Wallet", bal: "Rs 800" },
                        { emoji: "🟢", name: "Amazon Pay", bal: "Rs 0" },
                        { emoji: "🔵", name: "Mobikwik", bal: "Rs 320" },
                        { emoji: "🟠", name: "Ola Money", bal: "Rs 150" },
                        { emoji: "🔴", name: "Airtel Money", bal: "Rs 0" },
                      ].map((wallet, i) => (
                        <button key={i} className={`wallet-opt${selectedWallet === i ? " selected" : ""}`} onClick={() => setSelectedWallet(i)}>
                          <div className="wallet-icon">{wallet.emoji}</div>
                          <div className="wallet-name">{wallet.name}</div>
                          <div className="wallet-bal">Bal: {wallet.bal}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* COD */}
                  <div className={`pay-panel${activePayTab === "cod" ? " active" : ""}`}>
                    <div className="cod-box selected">
                      <i className="fas fa-money-bill-wave" />
                      <h3>Cash on Delivery</h3>
                      <p>Pay in cash when your order arrives at your doorstep. No advance payment needed.</p>
                      <div className="cod-note"><i className="fas fa-info-circle" /> COD fee of Rs 29 applies on orders below Rs 1,000. This order qualifies for FREE COD!</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="step-actions">
                <button className="btn-back" onClick={() => goStep(1)}><i className="fas fa-arrow-left" /> Back</button>
                <button className="btn-next" onClick={() => goStep(3)}><i className="fas fa-eye" /> Review Order</button>
              </div>
            </div>

            {/* ─── STEP 3: REVIEW ─── */}
            <div className={`co-panel${currentStep === 3 ? " active" : ""}`}>
              {/* Address summary */}
              <div className="co-card">
                <div className="co-card-head">
                  <h2><div className="step-num done"><i className="fas fa-check" /></div> Delivery Address</h2>
                  <button className="co-card-edit" onClick={() => goStep(1)}><i className="fas fa-pen" /> Change</button>
                </div>
                <div className="co-card-body" style={{ padding: "14px 22px" }}>
                  <div style={{ fontSize: "0.85rem", color: "#0f172a" }}><strong>Saurabh Kapoor</strong> · +91 98765 43210</div>
                  <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 4 }}>402, Sunrise Tower, Link Road, Malad West, Mumbai - 400064, Maharashtra</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 700, color: "#16a34a", marginTop: 8 }}>
                    <i className="fas fa-truck-fast" /> {selectedDelivery.label} · {selectedDelivery.cost === 0 ? "FREE" : `Rs ${selectedDelivery.cost}`} · Arriving Tomorrow
                  </div>
                </div>
              </div>

              {/* Payment summary */}
              <div className="co-card">
                <div className="co-card-head">
                  <h2><div className="step-num done"><i className="fas fa-check" /></div> Payment Method</h2>
                  <button className="co-card-edit" onClick={() => goStep(2)}><i className="fas fa-pen" /> Change</button>
                </div>
                <div className="co-card-body" style={{ padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
                  {activePayTab === "upi" ? (
                    <><div style={{ width: 44, height: 44, borderRadius: 10, background: "#e8f5e9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", color: "#34a853" }}><i className="fab fa-google-pay" /></div>
                    <div><div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>UPI — {selectedUpiApp}</div><div style={{ fontSize: "0.72rem", color: "#64748b" }}>Instant & secure payment</div></div></>
                  ) : activePayTab === "card" ? (
                    <><div className="card-brand-icon visa">VISA</div>
                    <div><div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>Visa Credit Card ending in 4512</div><div style={{ fontSize: "0.72rem", color: "#64748b" }}>No-Cost EMI · 12 months · Rs 16,574/mo</div></div></>
                  ) : activePayTab === "cod" ? (
                    <><div style={{ fontSize: "1.8rem" }}>💵</div><div><div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>Cash on Delivery</div><div style={{ fontSize: "0.72rem", color: "#64748b" }}>Pay when order arrives</div></div></>
                  ) : (
                    <><i className="fas fa-university" style={{ fontSize: "1.5rem", color: "#dc2626" }} /><div><div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0f172a" }}>{activePayTab.charAt(0).toUpperCase() + activePayTab.slice(1)} payment selected</div></div></>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div className="co-card">
                <div className="co-card-head">
                  <h2><div className="step-num">3</div> Order Items</h2>
                </div>
                <div className="co-card-body">
                  <div className="review-items">
                    {ORDER_ITEMS.map((item) => (
                      <div key={item.id} className="ri-card">
                        <div className="ri-img"><img src={item.img} alt={item.name} loading="lazy" /></div>
                        <div className="ri-body">
                          <div className="ri-brand">{item.brand}</div>
                          <div className="ri-name">{item.name}</div>
                          <div className="ri-meta">Qty: {item.qty} · <span style={{ color: "#16a34a", fontWeight: 700 }}>In Stock</span></div>
                        </div>
                        <div className="ri-price">
                          <div className="rprice">Rs {(item.price * item.qty).toLocaleString()}</div>
                          <div className="rqty">Rs {item.price.toLocaleString()} each</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notices */}
              <div className="co-card notice-box">
                <div className="co-card-body" style={{ padding: "16px 22px" }}>
                  <div className="notice-head"><i className="fas fa-triangle-exclamation" /> Please Review Before Placing Order</div>
                  <div className="notice-item"><i className="fas fa-check" /> Returns accepted within 10 days of delivery</div>
                  <div className="notice-item"><i className="fas fa-check" /> All products come with manufacturer warranty</div>
                  <div className="notice-item"><i className="fas fa-check" /> By placing order, you agree to our <a href="#">Terms & Conditions</a> and <a href="#">Privacy Policy</a></div>
                </div>
              </div>

              <div className="step-actions">
                <button className="btn-back" onClick={() => goStep(2)}><i className="fas fa-arrow-left" /> Back</button>
                <button className="btn-next" onClick={placeOrder} disabled={isProcessing}>
                  {isProcessing ? <><i className="fas fa-spinner fa-spin" /> Processing...</> : <><i className="fas fa-lock" /> Place Order Securely</>}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Order Summary */}
          <div className="co-os-card">
            <div className="co-os-title"><i className="fas fa-receipt" /> Order Summary</div>

            <div className="co-os-items">
              {ORDER_ITEMS.map((item) => (
                <div key={item.id} className="co-os-item">
                  <div className="co-os-item-img"><img src={item.img} alt={item.name} loading="lazy" /></div>
                  <div className="co-os-item-info">
                    <div className="co-os-item-name">{item.name}</div>
                    <div className="co-os-item-qty">Qty: {item.qty}</div>
                  </div>
                  <div className="co-os-item-price">Rs {(item.price * item.qty).toLocaleString()}</div>
                </div>
              ))}
            </div>

            <hr className="co-os-divider" />

            <div className="co-price-rows">
              <div className="co-price-row"><span className="cpr-label">Subtotal (4 items)</span><span className="cpr-val">Rs {subtotal.toLocaleString()}</span></div>
              <div className="co-price-row saving"><span className="cpr-label">Product Discount</span><span className="cpr-val">−Rs {productDisc.toLocaleString()}</span></div>
              <div className="co-price-row saving"><span className="cpr-label">Coupon (MOTAB10)</span><span className="cpr-val">−Rs {couponDisc.toLocaleString()}</span></div>
              <div className="co-price-row"><span className="cpr-label">Delivery</span><span className="cpr-val" style={{ color: selectedDelivery.cost === 0 ? "#16a34a" : "#0f172a" }}>{selectedDelivery.cost === 0 ? "FREE" : `Rs ${selectedDelivery.cost}`}</span></div>
              <div className="co-price-row"><span className="cpr-label">GST</span><span className="cpr-val">Rs {tax.toLocaleString()}</span></div>
              <div className="co-price-row total"><span className="cpr-label">Total</span><span className="cpr-val">Rs {total.toLocaleString()}</span></div>
            </div>
            <div style={{ fontSize: "0.72rem", color: "#16a34a", fontWeight: 700, textAlign: "center", marginTop: -8 }}>
              <i className="fas fa-tag" /> You save Rs {(productDisc + couponDisc - tax).toLocaleString()} on this order!
            </div>

            <button
              className="place-order-btn"
              onClick={currentStep === 3 ? placeOrder : () => goStep(Math.min(currentStep + 1, 3) as Step)}
              disabled={isProcessing}
            >
              {isProcessing
                ? <><i className="fas fa-spinner fa-spin" /> Processing...</>
                : currentStep === 3
                  ? <><i className="fas fa-lock" /> Place Order Securely</>
                  : <><i className="fas fa-arrow-right" /> {currentStep === 1 ? "Continue to Payment" : "Review Order"}</>
              }
            </button>

            <div className="co-trust-row">
              <div className="co-trust-item"><i className="fas fa-shield-halved" /> Secure</div>
              <div className="co-trust-item"><i className="fas fa-certificate" /> Genuine</div>
              <div className="co-trust-item"><i className="fas fa-rotate-left" /> Easy Return</div>
            </div>
          </div>
        </div>
      </main>

      {/* Success Overlay */}
      <div className={`success-overlay${showSuccess ? " show" : ""}`}>
        <div className="success-modal">
          <div className="success-check"><i className="fas fa-check" /></div>
          <h2>Order Placed!</h2>
          <p>Your order has been placed successfully. You&apos;ll receive a confirmation SMS and email shortly.</p>
          <div className="order-id-box">
            Order ID: <strong>{orderId}</strong>
            <button className="order-id-copy" onClick={copyOrderId} title="Copy">
              <i className="fas fa-copy" />
            </button>
          </div>
          <div className="delivery-promise">
            <i className="fas fa-truck-fast" />
            <div>Expected delivery: <strong>Tomorrow</strong><br />Track your order anytime in My Account → Orders</div>
          </div>
          <div className="success-actions">
            <a href="#" className="sa-track"><i className="fas fa-map-pin" /> Track Order</a>
            <Link href="/" className="sa-home"><i className="fas fa-house" /> Continue Shopping</Link>
          </div>
        </div>
      </div>

      {/* Mini Footer */}
      <div className="co-footer">
        <div className="co-footer-links">
          <Link href="/">© 2026 Motabhai Electronics</Link>
          <Link href="#">Privacy Policy</Link>
          <Link href="#">Terms & Conditions</Link>
          <Link href="#">Contact Support</Link>
        </div>
        <div className="co-footer-copy">All rights reserved.</div>
      </div>

      {/* Toasts */}
      <div className="co-toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`co-toast ${t.type}`}>
            <i className={`fas ${t.type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`} />
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
