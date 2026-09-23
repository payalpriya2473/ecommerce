"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { publicOfferAPI, bankOfferGradient, brandDealPastel, getImageUrl, type PublicOffer } from "@/lib/api/publicApi";
import "./Offerspage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
type BankKey = "hdfc" | "sbi" | "axis" | "icici" | "kotak" | "paytm";
type BankTab = "overview" | "how" | "emi" | "tc";
interface BankOffer {
  bank: string;
  abbr: string;
  offer: string;
  offerSub: string;
  desc: string;
  tags: string[];
  color: string;
}
interface BankDetail {
  key: BankKey;
  bank: string;
  logo: string;
  offer: string;
  offerSub: string;
  color: string;
  validity: string;
  minOrder: string;
  maxBenefit: string;
  categories: string[];
  eligibleCards: string[];
  steps: { title: string; desc: string; tip?: string; }[];
  terms: { text: string; highlight?: boolean; }[];
}
interface Toast { id: number; html: string; }

const navLinks = [
  { href: "/", icon: "fas fa-house", label: "Home" },
  { href: "/products?cat=mobiles", icon: "fas fa-mobile-screen", label: "Mobiles" },
  { href: "/products?cat=tvs", icon: "fas fa-tv", label: "TVs" },
  { href: "/products?cat=laptops", icon: "fas fa-laptop", label: "Laptops" },
  { href: "/products?cat=appliances", icon: "fas fa-blender", label: "Appliances" },
  { href: "/brands", icon: "fas fa-award", label: "Brands" },
  // { href: "/blog", icon: "fas fa-newspaper", label: "Blog" }, // Blog page not built yet
  { href: "/about", icon: "fas fa-building", label: "About" },
  { href: "/offers", icon: "fas fa-bolt", label: "Offers", highlight: true },
];

const announcementItems = [
  { icon: "fas fa-tag", text: "FREE Delivery on orders above Rs 999" },
  { icon: "fas fa-shield-halved", text: "2-Year Warranty on all products" },
  { icon: "fas fa-rotate-left", text: "10-Day Hassle-Free Returns" },
  { icon: "fas fa-credit-card", text: "No-Cost EMI on HDFC & SBI Cards" },
];

const offerTabs = [
  { id: "flashSale", icon: "fas fa-bolt", label: "Flash Sale", count: "5" },
  { id: "bankOffers", icon: "fas fa-university", label: "Bank Offers", count: "6" },
  { id: "brandDeals", icon: "fas fa-award", label: "Brand Deals", count: "6" },
  { id: "coupons", icon: "fas fa-ticket", label: "Coupons", count: "6" },
  { id: "comboDeals", icon: "fas fa-boxes-stacked", label: "Combos", count: "3" },
  { id: "clearance", icon: "fas fa-fire", label: "Clearance", count: "4" },
];

const fp = (n: number) => "Rs " + n.toLocaleString("en-IN");
const categoryIcons = ["fas fa-mobile-screen", "fas fa-laptop", "fas fa-tv", "fas fa-blender", "fas fa-headphones", "fas fa-gamepad"];

// ─── Countdown hook ─────────────────────────────────────────────────────────
// Counts down to `targetTimestamp` if given (e.g. the real endAt of the
// soonest-ending active Flash Sale offer); falls back to today's midnight
// when no real schedule is available yet.
function useCountdown(targetTimestamp?: number) {
  const [time, setTime] = useState({ h: "00", m: "00", s: "00" });
  useEffect(() => {
    const update = () => {
      const now = new Date();
      let end: Date
      if (targetTimestamp != null) {
        end = new Date(targetTimestamp)
      } else {
        end = new Date(now); end.setHours(23, 59, 59, 999);
      }
      const diff = Math.max(0, end.getTime() - now.getTime());
      const pad = (n: number) => String(n).padStart(2, "0");
      setTime({ h: pad(Math.floor(diff / 3600000)), m: pad(Math.floor((diff % 3600000) / 60000)), s: pad(Math.floor((diff % 60000) / 1000)) });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetTimestamp]);
  return time;
}

// Convert a dynamic PublicOffer (bank) into the modal's BankDetail shape
function offerToDetail(o: PublicOffer): BankDetail {
  const bank = o.bankName || "Bank";
  return {
    key: "hdfc",
    bank,
    logo: (o.bankAbbr || bank).slice(0, 3).toUpperCase(),
    offer: o.offerText || "",
    offerSub: o.offerSub || "",
    color: bankOfferGradient(o.colorTheme),
    validity: o.endAt
      ? `Valid till ${new Date(o.endAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
      : "Limited period offer",
    minOrder: "—",
    maxBenefit: "—",
    categories: [],
    eligibleCards: Array.isArray(o.tags) ? o.tags : [],
    steps: [
      { title: "Add Product to Cart", desc: "Choose any eligible product and add it to your cart." },
      { title: "Proceed to Checkout", desc: "Fill delivery details and continue to the payment page." },
      { title: `Pay with ${bank}`, desc: "Use an eligible card from this bank to complete payment.", tip: "The discount is auto-applied at checkout." },
      { title: "Enjoy the Savings", desc: "The offer benefit is applied as per the bank's terms." },
    ],
    terms: o.description ? [{ text: o.description }] : [],
  };
}

const OFFER_FALLBACK_IMG = "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&q=80";

// Small reusable premium empty-state block (icon + message) used whenever a
// section has no live offers yet, so the page never shows a bare gray line.
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="off-empty-state">
      <div className="off-empty-icon"><i className={icon} /></div>
      <p>{text}</p>
    </div>
  );
}

// Normalize a product-based PublicOffer into a uniform card view-model
function offerToCard(o: PublicOffer) {
  const price = Number(o.offerPrice ?? o.mrp ?? 0);
  const original = Number(o.mrp ?? 0);
  const pct = o.discountPercent && o.discountPercent > 0
    ? o.discountPercent
    : (original > price && original > 0 ? Math.round(((original - price) / original) * 100) : 0);
  return {
    id: o.id,
    brand: o.brandName || "",
    name: o.itemName || "",
    img: getImageUrl(o.primaryImage, OFFER_FALLBACK_IMG),
    price,
    original,
    pct,
    badge: o.badge || (pct ? `${pct}% Off` : ""),
    sold: o.soldPercent ?? null,
    stockLeft: o.stockLeft ?? null,
    couponCode: o.couponCode || "",
  };
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function OffersPage() {
  const [activeTab, setActiveTab] = useState("flashSale");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [email, setEmail] = useState("");
  const [activeBank, setActiveBank] = useState<BankDetail | null>(null);
  const [bankTab, setBankTab] = useState<BankTab>("overview");
  const [emiPrice, setEmiPrice] = useState(84999);
  const [emiTenure, setEmiTenure] = useState(6);
  const [emiRate, setEmiRate] = useState(0);
  const [emiDiscount, setEmiDiscount] = useState(10);
  const [bankOffers, setBankOffers] = useState<BankOffer[]>([]);
  const [dynamicDetails, setDynamicDetails] = useState<Record<string, BankDetail>>({});
  const [flashOffers, setFlashOffers] = useState<PublicOffer[]>([]);
  const [brandOffers, setBrandOffers] = useState<PublicOffer[]>([]);
  const [couponOffers, setCouponOffers] = useState<PublicOffer[]>([]);
  const [comboOffers, setComboOffers] = useState<PublicOffer[]>([]);
  const [clearanceOffers, setClearanceOffers] = useState<PublicOffer[]>([]);

  useEffect(() => {
    publicOfferAPI.getAll().then((rows) => {
      const by = (s: string) => rows.filter((o) => o.section === s);
      setFlashOffers(by("flash_sale"));
      setBrandOffers(by("brand_deal"));
      setCouponOffers(by("coupon"));
      setComboOffers(by("combo"));
      setClearanceOffers(by("clearance"));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    publicOfferAPI.getBySection("bank_offer").then((rows) => {
      if (!rows.length) return;
      const cards: BankOffer[] = rows.map((o) => ({
        bank: o.bankName || "Bank",
        abbr: o.bankAbbr || (o.bankName || "BANK").slice(0, 4).toUpperCase(),
        offer: o.offerText || "",
        offerSub: o.offerSub || "",
        desc: o.description || "",
        tags: Array.isArray(o.tags) ? o.tags : [],
        color: bankOfferGradient(o.colorTheme),
      }));
      setBankOffers(cards);

      const detailMap: Record<string, BankDetail> = {};
      rows.forEach((o) => { detailMap[o.bankName || "Bank"] = offerToDetail(o); });
      setDynamicDetails(detailMap);
    }).catch(() => {});
  }, []);

  // Flash & Clearance reuse the same normalized card shape derived from real offers
  const flashList = flashOffers.map((o) => {
    const c = offerToCard(o);
    const sold = c.sold ?? 0;
    const total = 100;
    // Use the real Stock Left the admin entered instead of deriving a fake
    // count from 100 - sold%, and show an illustrative EMI estimate so
    // dynamic cards don't lose the EMI line real product-based offers had.
    const left = c.stockLeft != null ? Number(c.stockLeft) : null;
    const emi = c.price > 0 ? `EMI from ${fp(Math.round(c.price / 12))}/mo` : "";
    return { id: Number(c.id), brand: c.brand, name: c.name, img: c.img, price: c.price, original: c.original, sold, total, left, emi, badge: c.badge };
  });

  const clearanceList = clearanceOffers.map((o) => {
    const c = offerToCard(o);
    return { brand: c.brand, name: c.name, img: c.img, price: c.price, original: c.original, badge: c.badge || "Clearance" };
  });

  const comboList = comboOffers.map((o) => {
    const items = (o.comboItems ?? []).map((ci) => ({ name: ci.itemName || "", price: Number(ci.price) || 0 }));
    const total = items.reduce((s, it) => s + it.price, 0);
    const combo = Number(o.offerPrice ?? 0);
    const saving = Math.max(0, total - combo);
    return { title: o.comboTitle || "Combo Deal", items, total, combo, img: getImageUrl(o.primaryImage, OFFER_FALLBACK_IMG), badge: o.badge || (saving > 0 ? `Save ${fp(saving)}` : "Combo") };
  });

  // Hero countdown targets the soonest end time among live Flash Sale offers;
  // falls back to today's midnight when none of them have a schedule set.
  const flashCountdownTarget = useMemo(() => {
    const times = flashOffers
      .map((o) => (o.endAt ? new Date(o.endAt).getTime() : NaN))
      .filter((t) => Number.isFinite(t) && t > Date.now());
    return times.length ? Math.min(...times) : undefined;
  }, [flashOffers]);
  const time = useCountdown(flashCountdownTarget);

  // Real hero stats derived from live offer data instead of hardcoded marketing copy.
  const flashMaxPct = useMemo(
    () => flashOffers.reduce((max, o) => Math.max(max, offerToCard(o).pct), 0),
    [flashOffers],
  );
  const totalLiveDeals =
    flashOffers.length + bankOffers.length + brandOffers.length + couponOffers.length + comboOffers.length + clearanceOffers.length;
  // First active coupon with a real code — used for the hero promo line.
  const promoCoupon = useMemo(
    () => couponOffers.find((o) => (o.couponCode || "").trim()),
    [couponOffers],
  );

  const discountedPrice = Math.max(emiPrice * (1 - emiDiscount / 100), emiPrice - 3000);
  const monthlyRate = emiRate / 12 / 100;
  const emiMonthly = emiRate === 0 ? discountedPrice / emiTenure : discountedPrice * monthlyRate * Math.pow(1 + monthlyRate, emiTenure) / (Math.pow(1 + monthlyRate, emiTenure) - 1);
  const emiTotal = emiRate === 0 ? discountedPrice : emiMonthly * emiTenure;
  const emiSaving = emiPrice - discountedPrice;

  const showToast = (html: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, html }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2900);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    showToast(`<i class="fas fa-check-circle"></i> Coupon <b>${code}</b> copied!`);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const scrollToSection = (id: string) => {
    setActiveTab(id);
    const el = document.getElementById(id);
    if (el) { const top = el.getBoundingClientRect().top + window.scrollY - 130; window.scrollTo({ top, behavior: "smooth" }); }
  };

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
      setShowTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveBank(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="off-root">
      {/* Hero */}
      <section className="off-hero">
        <div className="off-hero-bg" />
        <div className="off-hero-inner">
          <div className="off-hero-left">
            <div className="off-hero-tag"><span className="off-hero-tag-dot" /><i className="fas fa-fire" /> Mega Sale Live Now</div>
            <h1 className="off-hero-title">
              Unbeatable Deals &
              <span>
                <i className="off-hero-sparkle off-hero-sparkle-1 fas fa-star" />
                Exclusive Offers
                <i className="off-hero-sparkle off-hero-sparkle-2 fas fa-star" />
              </span>
            </h1>
            <p className="off-hero-sub">Up to 50% off on top brands. Bank discounts, coupons & combo deals waiting for you.</p>
            <div className="off-hero-stats">
              <div className="off-hero-stat"><i className="fas fa-layer-group" /><div className="off-hs-num">{totalLiveDeals}</div><div className="off-hs-label">Live Deals</div></div>
              <div className="off-hero-stat"><i className="fas fa-percent" /><div className="off-hs-num">{flashMaxPct}%</div><div className="off-hs-label">Max Discount</div></div>
              <div className="off-hero-stat"><i className="fas fa-university" /><div className="off-hs-num">{bankOffers.length}</div><div className="off-hs-label">Bank Offers</div></div>
            </div>
            <div className="off-hero-cta-row">
              <button className="off-hero-cta primary" onClick={() => scrollToSection("flashSale")}><i className="fas fa-bolt" /> Shop Flash Sale</button>
              <button className="off-hero-cta outline" onClick={() => scrollToSection("coupons")}><i className="fas fa-ticket" /> View Coupons</button>
            </div>
          </div>
          <div className="off-hero-countdown">
            <div className="off-hc-label"><i className="fas fa-clock" /> Flash Sale Ends In</div>
            <div className="off-hc-units">
              <div className="off-hc-unit"><div className="off-hc-box">{time.h}</div><div className="off-hc-name">Hours</div></div>
              <div className="off-hc-sep">:</div>
              <div className="off-hc-unit"><div className="off-hc-box">{time.m}</div><div className="off-hc-name">Mins</div></div>
              <div className="off-hc-sep">:</div>
              <div className="off-hc-unit"><div className="off-hc-box">{time.s}</div><div className="off-hc-name">Secs</div></div>
            </div>
            {promoCoupon && (
              <div className="off-hc-promo">
                🎉 Use code {promoCoupon.couponCode} for{" "}
                {promoCoupon.maxOff
                  ? `extra Rs ${Number(promoCoupon.maxOff).toLocaleString("en-IN")} off`
                  : (promoCoupon.couponTitle || "extra savings")}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Offer Tabs */}
      <div className="off-tabs-wrap">
        <div className="off-tabs">
          {offerTabs.map(tab => (
            <button key={tab.id} className={`off-tab${activeTab === tab.id ? " active" : ""}`} onClick={() => scrollToSection(tab.id)}>
              <i className={tab.icon} /> {tab.label}
              <span className="off-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Flash Sale */}
      <section id="flashSale" className="off-flash-section">
        <div className="off-section-inner">
          <div className="off-flash-header">
            <div className="off-flash-title-area">
              <h2 className="off-flash-title"><i className="fas fa-bolt" /> Flash Sale</h2>
              <div className="off-flash-mini-countdown">
                <div className="off-fmc-unit"><div className="off-fmc-box">{time.h}</div><div className="off-fmc-label">HRS</div></div>
                <div className="off-fmc-sep">:</div>
                <div className="off-fmc-unit"><div className="off-fmc-box">{time.m}</div><div className="off-fmc-label">MIN</div></div>
                <div className="off-fmc-sep">:</div>
                <div className="off-fmc-unit"><div className="off-fmc-box">{time.s}</div><div className="off-fmc-label">SEC</div></div>
              </div>
            </div>
            <Link href="/products" className="off-flash-cta"><i className="fas fa-arrow-right" /> View All</Link>
          </div>
          <div className="off-flash-grid">
            {flashList.length > 0 ? flashList.map((p, i) => {
              const pct = Math.round((p.sold / p.total) * 100);
              return (
                <div key={p.id} className="off-flash-card" style={{ animationDelay: `${i * 0.06}s` }}>
                  <div className="off-flash-badge">{p.badge}</div>
                  <div className="off-flash-img"><img src={p.img} alt={p.name} loading="lazy" /></div>
                  <div className="off-flash-info">
                    <div className="off-flash-brand">{p.brand}</div>
                    <div className="off-flash-name">{p.name}</div>
                    <div className="off-flash-progress-wrap">
                      <div className="off-flash-progress-label"><span>🔥 {p.sold}% sold</span><span>{p.left ?? (p.total - p.sold)} left</span></div>
                      <div className="off-flash-progress-bar"><div className="off-flash-progress-fill" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <div className="off-flash-price-row">
                      <span className="off-flash-price">{fp(p.price)}</span>
                      <span className="off-flash-orig">{fp(p.original)}</span>
                      <span className="off-flash-off">{p.badge}</span>
                    </div>
                    <div className="off-flash-emi">{p.emi}</div>
                    <button className="off-flash-btn" onClick={() => showToast(`<i class="fas fa-cart-plus"></i> Added to cart!`)}><i className="fas fa-cart-plus" /> Add to Cart</button>
                  </div>
                </div>
              );
            }) : (
              <EmptyState icon="fas fa-bolt" text="No flash sale offers available right now." />
            )}
          </div>
        </div>
      </section>

      {/* Bank Offers */}
      <section id="bankOffers" className="off-section off-section-white">
        <div className="off-section-inner">
          <div className="off-section-head">
            <div>
              <div className="off-section-eyebrow"><i className="fas fa-university" /> Exclusive Deals</div>
              <h2 className="off-section-title">Bank & Card <span>Offers</span></h2>
              <p className="off-section-subtitle">Save more with your bank cards. Instant discounts & cashback offers.</p>
            </div>
          </div>
          <div className="off-bank-grid">
            {bankOffers.length > 0 ? bankOffers.map((b, i) => (
              <div key={i} className="off-bank-card" style={{ background: b.color }} onClick={() => {
                const detail = dynamicDetails[b.bank];
                if (!detail) return;
                setActiveBank(detail);
                setBankTab("overview");
                setEmiDiscount(parseFloat((detail.offer || "").replace(/[^\d.]/g, "")) || 0);
              }}>
                <div className="off-bc-top">
                  <div className="off-bc-bank-name">{b.bank}</div>
                  <div className="off-bc-bank-logo">{b.abbr}</div>
                </div>
                <div className="off-bc-offer">{b.offer} <span>{b.offerSub}</span></div>
                <p className="off-bc-desc">{b.desc}</p>
                <div className="off-bc-tags">{b.tags.map(t => <span key={t} className="off-bc-tag">{t}</span>)}</div>
                <div className="off-bc-cta">View Offer Details <i className="fas fa-arrow-right" /></div>
              </div>
            )) : (
              <EmptyState icon="fas fa-university" text="No bank offers available right now." />
            )}
          </div>
        </div>
      </section>

      {/* Brand Deals */}
      <section id="brandDeals" className="off-section off-section-gray">
        <div className="off-section-inner">
          <div className="off-section-head">
            <div>
              <div className="off-section-eyebrow"><i className="fas fa-award" /> Top Brands</div>
              <h2 className="off-section-title">Brand <span>Deals</span></h2>
              <p className="off-section-subtitle">Exclusive discounts from your favourite brands.</p>
            </div>
          </div>
          {brandOffers.length > 0 ? (
            <div className="off-brand-grid">
              {brandOffers.map((o) => {
                const count = o.productCount ?? (Array.isArray(o.productIds) ? o.productIds.length : 0);
                const shopNowParams = new URLSearchParams();
                if (o.brandId != null) shopNowParams.set("brandId", String(o.brandId));
                if (Array.isArray(o.productIds) && o.productIds.length) {
                  shopNowParams.set("ids", o.productIds.map((x) => String(x)).join(","));
                }
                const shopNowHref = `/products?${shopNowParams.toString()}`;
                return (
                  <div key={o.id} className="off-brand-card" style={{ background: brandDealPastel(o.colorTheme) }}>
                    <div className="off-brand-logo">
                      {o.brandLogo ? (
                        <img src={getImageUrl(o.brandLogo)} alt={o.brandDealName || "Brand"} className="off-brand-logo-img" />
                      ) : (
                        (o.brandDealName || "B").slice(0, 1)
                      )}
                    </div>
                    <div className="off-brand-name">{o.brandDealName || "Brand"}</div>
                    <div className="off-brand-discount">{o.discountLabel || ""}</div>
                    <div className="off-brand-desc">{o.description || ""}</div>
                    {count > 0 && <div className="off-brand-count"><i className="fas fa-box" /> {count} products</div>}
                    <Link href={shopNowHref} className="off-brand-btn">Shop Now <i className="fas fa-arrow-right" /></Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="fas fa-award" text="No brand deals available right now." />
          )}
        </div>
      </section>

      {/* Coupons */}
      <section id="coupons" className="off-section off-section-white">
        <div className="off-section-inner">
          <div className="off-section-head">
            <div>
              <div className="off-section-eyebrow"><i className="fas fa-ticket" /> Promo Codes</div>
              <h2 className="off-section-title">Exclusive <span>Coupons</span></h2>
              <p className="off-section-subtitle">Copy & apply coupon codes at checkout for extra savings.</p>
            </div>
          </div>
          {couponOffers.length > 0 ? (
            <div className="off-coupon-grid">
              {couponOffers.map((o) => {
                const code = o.couponCode || "";
                const color = bankOfferGradient(o.colorTheme);
                const minO = o.minOrder ? fp(Number(o.minOrder)) : "—";
                const maxO = o.maxOff ? fp(Number(o.maxOff)) : "—";
                const valid = o.validTill ? new Date(o.validTill).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
                return (
                  <div key={o.id} className="off-coupon-card">
                    <div className="off-coupon-left" style={{ background: color }}>
                      <div className="off-coupon-cat">{o.categoryLabel || "All Products"}</div>
                      <div className="off-coupon-title">{o.couponTitle || code}</div>
                    </div>
                    <div className="off-coupon-right">
                      <div className="off-coupon-desc">{o.description || ""}</div>
                      <div className="off-coupon-meta">
                        <span><i className="fas fa-shopping-bag" /> Min: {minO}</span>
                        <span><i className="fas fa-tag" /> Max: {maxO}</span>
                        {valid && <span><i className="fas fa-calendar" /> Valid till {valid}</span>}
                      </div>
                      <button className={`off-coupon-copy${copiedCode === code ? " copied" : ""}`} onClick={() => copyCode(code)}>
                        <span className="off-code">{code}</span>
                        <span className="off-copy-label"><i className={`fas fa-${copiedCode === code ? "check" : "copy"}`} /> {copiedCode === code ? "Copied!" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="fas fa-ticket" text="No coupons available right now." />
          )}
        </div>
      </section>

      {/* Combo Deals */}
      <section id="comboDeals" className="off-section off-section-gray">
        <div className="off-section-inner">
          <div className="off-section-head">
            <div>
              <div className="off-section-eyebrow"><i className="fas fa-boxes-stacked" /> Bundle &amp; Save</div>
              <h2 className="off-section-title">Combo <span>Deals</span></h2>
              <p className="off-section-subtitle">Buy together and save big on curated product bundles.</p>
            </div>
          </div>
          <div className="off-combo-grid">
            {comboList.length > 0 ? comboList.map((c, i) => (
              <div key={i} className="off-combo-card">
                <div className="off-combo-img"><img src={c.img} alt={c.title} loading="lazy" /><div className="off-combo-badge">{c.badge}</div></div>
                <div className="off-combo-body">
                  <h3 className="off-combo-title">{c.title}</h3>
                  <div className="off-combo-items">
                    {c.items.map((item, j) => (
                      <div key={j} className="off-combo-item"><i className="fas fa-check" /><span>{item.name}</span><span>{fp(item.price)}</span></div>
                    ))}
                  </div>
                  <div className="off-combo-pricing">
                    <div className="off-combo-total">MRP Total: <span>{fp(c.total)}</span></div>
                    <div className="off-combo-price">Combo Price: <strong>{fp(c.combo)}</strong></div>
                  </div>
                  <button className="off-combo-btn" onClick={() => showToast(`<i class="fas fa-cart-plus"></i> ${c.title} added to cart!`)}><i className="fas fa-cart-plus" /> Add Bundle to Cart</button>
                </div>
              </div>
            )) : (
              <EmptyState icon="fas fa-boxes-stacked" text="No combo deals available right now." />
            )}
          </div>
        </div>
      </section>

      {/* Clearance */}
      <section id="clearance" className="off-section off-clearance-section">
        <div className="off-section-inner">
          <div className="off-section-head">
            <div>
              <div className="off-section-eyebrow" style={{ color: "#fca5a5" }}><i className="fas fa-fire" /> Limited Stock</div>
              <h2 className="off-section-title" style={{ color: "var(--on-accent)" }}>Clearance <span>Sale</span></h2>
              <p className="off-section-subtitle" style={{ color: "rgba(255,255,255,.6)" }}>Last pieces! Grab them before they're gone.</p>
            </div>
          </div>
          <div className="off-clearance-grid">
            {clearanceList.length > 0 ? clearanceList.map((p, i) => (
              <div key={i} className="off-clearance-card" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="off-cl-badge">{p.badge}</div>
                <div className="off-cl-img"><img src={p.img} alt={p.name} loading="lazy" /></div>
                <div className="off-cl-body">
                  <div className="off-cl-brand">{p.brand}</div>
                  <div className="off-cl-name">{p.name}</div>
                  <div className="off-cl-price-row">
                    <span className="off-cl-price">{fp(p.price)}</span>
                    <span className="off-cl-orig">{fp(p.original)}</span>
                  </div>
                  <button className="off-cl-btn" onClick={() => showToast(`<i class="fas fa-cart-plus"></i> Added to cart!`)}><i className="fas fa-cart-plus" /> Add to Cart</button>
                </div>
              </div>
            )) : (
              <EmptyState icon="fas fa-fire" text="No clearance items available right now." />
            )}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="off-newsletter">
        <div className="off-newsletter-inner">
          <div className="off-nl-icon"><i className="fas fa-bell" /></div>
          <h2>Never Miss a Deal!</h2>
          <p>Get exclusive offers, flash sale alerts & coupons delivered to your inbox.</p>
          <div className="off-nl-form">
            <input type="email" placeholder="Enter your email address" value={email} onChange={e => setEmail(e.target.value)} />
            <button onClick={() => {
              if (!email.includes("@")) { showToast('<i class="fas fa-exclamation-circle"></i> Please enter a valid email'); return; }
              setEmail(""); showToast('<i class="fas fa-check-circle"></i> Subscribed! Deal alerts incoming.');
            }}>Alert Me! <i className="fas fa-arrow-right" /></button>
          </div>
        </div>
      </section>

      {activeBank && (
        <div className="off-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setActiveBank(null); }}>
          <div className="off-master-modal">
            <div className="off-mm-header">
              <div>
                <div className="off-mm-kicker">Bank Offer Details</div>
                <h2>{activeBank.bank} - {activeBank.offer} {activeBank.offerSub}</h2>
              </div>
              <button className="off-mm-close" onClick={() => setActiveBank(null)}><i className="fas fa-times" /></button>
            </div>

            <div className="off-mm-body">
              <div className="off-bom-hero" style={{ background: activeBank.color }}>
                <div>
                  <div className="off-bom-bank-name">{activeBank.bank}</div>
                  <div className="off-bom-main-offer">{activeBank.offer} <span>{activeBank.offerSub}</span></div>
                  <div className="off-bom-validity"><i className="fas fa-calendar-check" /> {activeBank.validity}</div>
                </div>
                <div className="off-bom-hero-logo">{activeBank.logo}</div>
              </div>

              <div className="off-bom-tabs">
                {([
                  { key: "overview", icon: "fas fa-circle-info", label: "Overview" },
                  { key: "how", icon: "fas fa-list-ol", label: "How to Avail" },
                  { key: "emi", icon: "fas fa-calculator", label: "EMI Calculator" },
                  { key: "tc", icon: "fas fa-file-lines", label: "Terms & Conditions" },
                ] as { key: BankTab; icon: string; label: string; }[]).map((tab) => (
                  <button key={tab.key} className={`off-bom-tab${bankTab === tab.key ? " active" : ""}`} onClick={() => setBankTab(tab.key)}>
                    <i className={tab.icon} /> {tab.label}
                  </button>
                ))}
              </div>

              {bankTab === "overview" && (
                <div className="off-bom-panel">
                  <div className="off-bom-highlights">
                    {[
                      { icon: "fas fa-percent", value: `${activeBank.offer} ${activeBank.offerSub}`, label: "Offer" },
                      { icon: "fas fa-indian-rupee-sign", value: activeBank.maxBenefit, label: "Max Benefit" },
                      { icon: "fas fa-shopping-cart", value: activeBank.minOrder, label: "Min Order" },
                    ].map((item) => (
                      <div key={item.label} className="off-bom-highlight">
                        <i className={item.icon} />
                        <div className="off-bh-val">{item.value}</div>
                        <div className="off-bh-label">{item.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="off-bom-section">
                    <h4><i className="fas fa-credit-card" /> Eligible Cards</h4>
                    <div className="off-bom-card-chips">
                      {activeBank.eligibleCards.map((card) => <div key={card} className="off-bom-card-chip"><i className="fas fa-credit-card" />{card}</div>)}
                    </div>
                  </div>

                  <div className="off-bom-section">
                    <h4><i className="fas fa-tag" /> Valid on Categories</h4>
                    <div className="off-bom-cat-pills">
                      {activeBank.categories.map((category, index) => (
                        <div key={category} className="off-bom-cat-pill"><i className={categoryIcons[index % categoryIcons.length]} />{category}</div>
                      ))}
                    </div>
                  </div>

                  <div className="off-bom-apply-banner">
                    <div>
                      <div className="off-bom-apply-code">No code needed - <span>Auto-applied at checkout</span></div>
                      <p>Simply add product to cart and pay with an eligible method.</p>
                    </div>
                    <button className="off-bom-apply-btn" onClick={() => setActiveBank(null)}><i className="fas fa-shopping-cart" /> Shop Now</button>
                  </div>
                </div>
              )}

              {bankTab === "how" && (
                <div className="off-bom-panel">
                  <div className="off-bom-steps">
                    {activeBank.steps.map((step, index) => (
                      <div key={step.title} className="off-bom-step">
                        <div className="off-bom-step-num">{index + 1}</div>
                        <div className="off-bom-step-body">
                          <h4>{step.title}</h4>
                          <p>{step.desc}</p>
                          {step.tip && <div className="off-bom-tip"><i className="fas fa-lightbulb" /><span>{step.tip}</span></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bankTab === "emi" && (
                <div className="off-bom-panel">
                  <div className="off-emi-calc">
                    <h4><i className="fas fa-calculator" /> EMI Calculator</h4>
                    <div className="off-emi-form">
                      <div className="off-emi-field">
                        <label>Product Price (Rs)</label>
                        <input type="number" value={emiPrice} onChange={(e) => setEmiPrice(Number(e.target.value) || 0)} />
                      </div>
                      <div className="off-emi-field">
                        <label>Tenure (Months)</label>
                        <select value={emiTenure} onChange={(e) => setEmiTenure(Number(e.target.value))}>
                          {[3, 6, 9, 12, 18, 24].map((month) => <option key={month} value={month}>{month} Months</option>)}
                        </select>
                      </div>
                      <div className="off-emi-field">
                        <label>Interest Rate</label>
                        <select value={emiRate} onChange={(e) => setEmiRate(Number(e.target.value))}>
                          <option value={0}>0% - No Cost EMI</option>
                          <option value={12}>12% p.a.</option>
                          <option value={14}>14% p.a.</option>
                          <option value={16}>16% p.a.</option>
                        </select>
                      </div>
                      <div className="off-emi-field">
                        <label>Bank Discount</label>
                        <select value={emiDiscount} onChange={(e) => setEmiDiscount(Number(e.target.value))}>
                          {[0, 5, 7, 8, 10, 12].map((discount) => <option key={discount} value={discount}>{discount}% instant off</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="off-emi-result">
                      <div className="off-emi-res-item"><div className="off-erv">{fp(Math.round(discountedPrice))}</div><div className="off-erk">Discounted Price</div></div>
                      <div className="off-emi-res-item"><div className="off-erv">{fp(Math.round(emiMonthly))}/mo</div><div className="off-erk">Monthly EMI</div></div>
                      <div className="off-emi-res-item"><div className="off-erv">{fp(Math.round(emiTotal))}</div><div className="off-erk">Total Payable</div></div>
                      <div className="off-emi-res-item"><div className="off-erv">{fp(Math.round(emiSaving))}</div><div className="off-erk">You Save</div></div>
                    </div>
                  </div>
                </div>
              )}

              {bankTab === "tc" && (
                <div className="off-bom-panel">
                  <div className="off-bom-tc-list">
                    {activeBank.terms.map((term) => (
                      <div key={term.text} className={`off-bom-tc-item${term.highlight ? " highlight" : ""}`}>
                        <i className={`fas fa-${term.highlight ? "circle-exclamation" : "circle-check"}`} />
                        <span>{term.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="off-footer">
        <div className="off-footer-inner">
          <div className="off-fb-brand">
            <div className="off-fb-logo">APPLENEXT</div>
            <p>Your one-stop destination for the latest electronics, mobile phones, laptops, and home appliances at the best prices with genuine warranty.</p>
          </div>
          {[
            { title: "Quick Links", links: [{ href: "/", label: "Home" }, { href: "/about", label: "About Us" }, { href: "/brands", label: "Brands" }, /* { href: "/blog", label: "Blog" }, */ { href: "/offers", label: "Offers" }] },
            { title: "Customer Service", links: [{ href: "/faq", label: "Help Center" }, { href: "/account", label: "Track Order" }, { href: "/faq", label: "Return Policy" }, { href: "/faq", label: "Warranty Info" }, { href: "/faq", label: "EMI Options" }] },
            { title: "My Account", links: [{ href: "/login", label: "Login / Register" }, { href: "/account", label: "My Orders" }, { href: "/cart", label: "My Cart" }, { href: "/account", label: "Wishlist" }, { href: "/search", label: "Search Products" }] },
          ].map(col => (
            <div key={col.title} className="off-fc">
              <h4>{col.title}</h4>
              {col.links.map(l => <Link key={l.href + l.label} href={l.href}>{l.label}</Link>)}
            </div>
          ))}
        </div>
        <div className="off-footer-bottom">
          <p>&copy; 2026 AppleNext Electronics. All rights reserved.</p>
          <div className="off-pay-tags"><span>Visa</span><span>Mastercard</span><span>UPI</span><span>Net Banking</span><span>EMI</span></div>
        </div>
      </footer>

      {/* Back to Top */}
      {showTop && <button className="off-back-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><i className="fas fa-chevron-up" /></button>}

      {/* Toasts */}
      <div className="off-toast-wrap">
        {toasts.map(t => <div key={t.id} className="off-toast" dangerouslySetInnerHTML={{ __html: t.html }} />)}
      </div>
    </div>
  );
}
