"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { publicOfferAPI, bankOfferGradient, type PublicOffer } from "@/lib/api/publicApi";
import "./Offerspage.css";

// ─── Types ────────────────────────────────────────────────────────────────────
interface FlashProduct { id: number; brand: string; name: string; img: string; price: number; original: number; sold: number; total: number; emi: string; badge: string; }
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
interface BrandDeal { brand: string; logo: string; discount: string; desc: string; products: number; bg: string; }
interface Coupon { code: string; title: string; desc: string; minOrder: string; maxOff: string; valid: string; category: string; color: string; }
interface ComboItem { name: string; price: number; }
interface ComboProduct { title: string; items: ComboItem[]; total: number; combo: number; img: string; badge: string; }
interface ClearanceProduct { brand: string; name: string; img: string; price: number; original: number; badge: string; }
interface Toast { id: number; html: string; }

// ─── Data ─────────────────────────────────────────────────────────────────────
const FLASH_PRODUCTS: FlashProduct[] = [
  { id: 1, brand: "Apple", name: "iPhone 16 Pro Max 256GB Natural Titanium", img: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&q=80", price: 134900, original: 159900, sold: 78, total: 100, emi: "EMI from Rs 4,996/mo", badge: "15% Off" },
  { id: 2, brand: "Samsung", name: "Galaxy S24 Ultra 256GB Titanium Black", img: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=300&q=80", price: 109999, original: 129999, sold: 62, total: 80, emi: "EMI from Rs 4,074/mo", badge: "15% Off" },
  { id: 3, brand: "Apple", name: "MacBook Pro M3 Pro 14-inch 18GB", img: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=300&q=80", price: 198900, original: 249900, sold: 45, total: 60, emi: "EMI from Rs 7,374/mo", badge: "20% Off" },
  { id: 4, brand: "Sony", name: "BRAVIA XR 65\" OLED 4K TV", img: "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=300&q=80", price: 189990, original: 249990, sold: 30, total: 50, emi: "EMI from Rs 7,044/mo", badge: "24% Off" },
  { id: 5, brand: "Apple", name: "AirPods Pro 2nd Gen with MagSafe", img: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=300&q=80", price: 21900, original: 26900, sold: 90, total: 100, emi: "No Cost EMI", badge: "19% Off" },
];

const BANK_OFFERS: BankOffer[] = [
  { bank: "HDFC Bank", abbr: "HDFC", offer: "10%", offerSub: "Instant Discount", desc: "Up to Rs 10,000 off on HDFC Credit/Debit Cards & EMI on orders above Rs 15,000", tags: ["Credit Card", "Debit Card", "EMI", "No Cost EMI"], color: "linear-gradient(135deg,#0052cc,#003d99)" },
  { bank: "SBI Card", abbr: "SBI", offer: "8%", offerSub: "Cashback Offer", desc: "Get flat 8% cashback on SBI SimplyCLICK & SimplySAVE Cards. Max Rs 6,000", tags: ["SimplyCLICK", "SimplySAVE", "PRIME", "Elite"], color: "linear-gradient(135deg,#1a6b3a,#145230)" },
  { bank: "ICICI Bank", abbr: "ICICI", offer: "5%", offerSub: "Unlimited Cashback", desc: "Unlimited 5% cashback on Amazon Pay ICICI Card. No minimum order value", tags: ["Amazon Pay", "Coral", "Platinum"], color: "linear-gradient(135deg,#b45309,#92400e)" },
  { bank: "Axis Bank", abbr: "AXIS", offer: "12%", offerSub: "Discount on EMI", desc: "12% off on Axis Bank EMI on orders above Rs 20,000. Max discount Rs 12,000", tags: ["Flipkart Card", "Magnus", "SELECT", "ACE"], color: "linear-gradient(135deg,#7c3aed,#5b21b6)" },
  { bank: "Kotak Bank", abbr: "KBL", offer: "7.5%", offerSub: "Instant Off", desc: "7.5% instant discount on Kotak 811 & Standard Credit Cards. Max Rs 5,000", tags: ["811", "Standard CC", "Signature", "Debit Card"], color: "linear-gradient(135deg,#dc2626,#991b1b)" },
  { bank: "Yes Bank", abbr: "YES", offer: "6%", offerSub: "Cashback", desc: "6% cashback on Yes Bank Credit Cards on purchases above Rs 10,000. Max Rs 4,000", tags: ["Reserv", "Marquee", "Wellness+"], color: "linear-gradient(135deg,#0369a1,#075985)" },
];

const BANK_DETAILS: BankDetail[] = [
  {
    key: "hdfc", bank: "HDFC Bank", logo: "HD", offer: "10%", offerSub: "Instant Discount", color: "linear-gradient(135deg,#1a237e,#283593)",
    validity: "Valid till 30 June 2026", minOrder: "Rs 5,000", maxBenefit: "Rs 2,500",
    categories: ["Smartphones", "Laptops", "Televisions", "Appliances", "Audio", "Gaming"],
    eligibleCards: ["HDFC Regalia Credit Card", "HDFC Millennia Credit Card", "HDFC Moneyback+ Credit Card", "HDFC Platinum Debit Card", "HDFC Business Debit Card", "HDFC EasyEMI Card"],
    steps: [
      { title: "Add Product to Cart", desc: "Choose any eligible product and add it to your cart. The offer activates on orders above Rs 5,000." },
      { title: "Proceed to Checkout", desc: "Fill delivery details and continue to the payment page." },
      { title: "Pay with HDFC Card", desc: "Select credit or debit card and use an eligible HDFC card to complete payment.", tip: "The discount is auto-applied. No coupon code needed." },
      { title: "Discount Applied Instantly", desc: "The final payable amount shows the 10% instant discount up to Rs 2,500 before you confirm payment." }
    ],
    terms: [
      { text: "Offer applicable on select HDFC Bank Credit and Debit cards." },
      { text: "Minimum transaction value: Rs 5,000.", highlight: true },
      { text: "Maximum discount per transaction: Rs 2,500.", highlight: true },
      { text: "Discount is applied instantly at checkout on Motabhai website and app only." },
      { text: "If an order is cancelled or returned, the discount amount is adjusted from the refund.", highlight: true }
    ]
  },
  {
    key: "sbi", bank: "SBI Cards", logo: "SBI", offer: "8%", offerSub: "Cashback", color: "linear-gradient(135deg,#1b5e20,#2e7d32)",
    validity: "Valid till 31 May 2026", minOrder: "Rs 3,000", maxBenefit: "Rs 2,000",
    categories: ["Smartphones", "Laptops", "Televisions", "Appliances", "Audio"],
    eligibleCards: ["SBI SimplyCLICK Credit Card", "SBI SimplySAVE Credit Card", "SBI Card PRIME", "SBI Card ELITE", "SBI Cashback Credit Card"],
    steps: [
      { title: "Choose Eligible Product", desc: "Select a product from electronics or appliances and add it to cart." },
      { title: "Checkout with SBI Card", desc: "Use an eligible SBI credit card on the payment page." },
      { title: "Pay Full Amount", desc: "Cashback is not instant. Pay the full amount shown on checkout." },
      { title: "Receive Cashback", desc: "Cashback up to Rs 2,000 is credited to your SBI statement within 7 working days.", tip: "Check SBI Card app or statement for credit confirmation." }
    ],
    terms: [
      { text: "Cashback valid only on eligible SBI credit cards." },
      { text: "Minimum order value: Rs 3,000.", highlight: true },
      { text: "Maximum cashback per transaction: Rs 2,000.", highlight: true },
      { text: "Cashback is credited after successful purchase and can take up to 7 working days." },
      { text: "Returned or cancelled orders are not eligible for cashback.", highlight: true }
    ]
  },
  {
    key: "axis", bank: "Axis Bank", logo: "AX", offer: "12%", offerSub: "Extra Off", color: "linear-gradient(135deg,#4a148c,#6a1b9a)",
    validity: "Valid till 15 May 2026", minOrder: "Rs 4,000", maxBenefit: "Rs 3,000",
    categories: ["Smartphones", "Laptops", "Televisions", "Appliances", "Audio", "Gaming"],
    eligibleCards: ["Axis Bank Buzz Credit Card", "Axis Bank ACE Credit Card", "Axis Bank MY ZONE Card", "Axis Flipkart Credit Card", "Axis Magnus Credit Card"],
    steps: [
      { title: "Add Product to Cart", desc: "Any eligible product above Rs 4,000 qualifies for this offer." },
      { title: "Choose Axis Card", desc: "On checkout, use an eligible Axis Bank credit card." },
      { title: "Select EMI if Needed", desc: "For no-cost EMI, select the EMI option before placing the order.", tip: "EMI tenure is available from 3 to 24 months on supported cards." },
      { title: "Confirm Discount", desc: "The 12% discount is applied before final payment, capped at Rs 3,000." }
    ],
    terms: [
      { text: "Offer valid on select Axis Bank credit cards only." },
      { text: "Minimum transaction: Rs 4,000.", highlight: true },
      { text: "Maximum discount: Rs 3,000 per transaction.", highlight: true },
      { text: "No-cost EMI is available on eligible cards and tenures only." },
      { text: "Axis Bank Debit Cards are not eligible for this promotion.", highlight: true }
    ]
  },
  {
    key: "icici", bank: "ICICI Bank", logo: "IC", offer: "7%", offerSub: "Cashback", color: "linear-gradient(135deg,#b71c1c,#c62828)",
    validity: "Valid till 30 June 2026", minOrder: "Rs 2,500", maxBenefit: "Rs 1,500",
    categories: ["Smartphones", "Laptops", "Televisions", "Appliances", "Audio", "Cameras"],
    eligibleCards: ["ICICI Bank Coral Credit Card", "ICICI Bank Rubyx Credit Card", "ICICI Bank Sapphiro Card", "ICICI Platinum Chip Credit Card"],
    steps: [
      { title: "Select Product", desc: "All product categories are eligible on the offers page." },
      { title: "Proceed to Checkout", desc: "Add items to cart and continue with shipping details." },
      { title: "Pay with ICICI Card", desc: "Use an eligible ICICI credit card to complete payment." },
      { title: "Cashback Credit", desc: "Cashback is credited to your statement within 5 working days.", tip: "You can track rewards in iMobile or ICICI netbanking." }
    ],
    terms: [
      { text: "Offer applies to select ICICI Bank credit cards." },
      { text: "Minimum transaction value: Rs 2,500.", highlight: true },
      { text: "Maximum cashback: Rs 1,500 per transaction.", highlight: true },
      { text: "Cashback is not instant and is credited after purchase confirmation." },
      { text: "Cancelled and returned orders are not eligible for cashback.", highlight: true }
    ]
  },
  {
    key: "kotak", bank: "Kotak Bank", logo: "KO", offer: "5%", offerSub: "Off + Free EMI", color: "linear-gradient(135deg,#e65100,#f57c00)",
    validity: "Valid till 31 May 2026", minOrder: "Rs 2,000", maxBenefit: "Rs 1,500",
    categories: ["Smartphones", "Laptops", "Televisions", "Appliances", "Audio"],
    eligibleCards: ["Kotak 811 Credit Card", "Kotak PVR Platinum Credit Card", "Kotak Royale Signature Credit Card", "Kotak Urbane Gold Credit Card"],
    steps: [
      { title: "Choose Product", desc: "Select any eligible product above Rs 2,000." },
      { title: "Proceed to Payment", desc: "Fill shipping details and continue to payment." },
      { title: "Use Kotak Card", desc: "Pay with an eligible Kotak card and optionally choose no-cost EMI.", tip: "EMI is available on supported tenures from 3 to 24 months." },
      { title: "Get Instant Benefit", desc: "The 5% discount is applied before the amount is split into EMI." }
    ],
    terms: [
      { text: "Offer valid on select Kotak Bank credit cards." },
      { text: "Minimum purchase value: Rs 2,000.", highlight: true },
      { text: "Maximum instant discount: Rs 1,500.", highlight: true },
      { text: "No-cost EMI is subject to bank approval and supported tenures." },
      { text: "Kotak debit cards are not eligible for no-cost EMI.", highlight: true }
    ]
  },
  {
    key: "paytm", bank: "Paytm UPI", logo: "UPI", offer: "Rs 200", offerSub: "Cashback", color: "linear-gradient(135deg,#0d47a1,#1565c0)",
    validity: "Valid daily 8 AM to 8 PM", minOrder: "Rs 2,000", maxBenefit: "Rs 200",
    categories: ["Smartphones", "Laptops", "Televisions", "Appliances", "Audio", "Gaming"],
    eligibleCards: ["Paytm UPI", "Paytm Wallet", "Paytm Postpaid"],
    steps: [
      { title: "Add Items to Cart", desc: "Choose products above Rs 2,000 total cart value." },
      { title: "Proceed to Payment", desc: "On the payment page, choose Paytm UPI or Paytm Wallet." },
      { title: "Complete Payment", desc: "Approve the payment in the Paytm app or with UPI PIN." },
      { title: "Receive Cashback", desc: "Cashback is credited to your Paytm Wallet within 24 hours.", tip: "This offer is valid only for transactions made between 8 AM and 8 PM." }
    ],
    terms: [
      { text: "Flat Rs 200 cashback on Paytm UPI, Wallet, or Postpaid payments." },
      { text: "Minimum transaction value: Rs 2,000.", highlight: true },
      { text: "Offer valid only between 8 AM and 8 PM.", highlight: true },
      { text: "Cashback is credited within 24 hours to the linked Paytm account." },
      { text: "Only one cashback per account per day is allowed.", highlight: true }
    ]
  }
];

const BRAND_DEALS: BrandDeal[] = [
  { brand: "Apple", logo: "🍎", discount: "Up to 20% off", desc: "iPhones, MacBooks, iPads & Accessories", products: 124, bg: "#f1f5f9" },
  { brand: "Samsung", logo: "📱", discount: "Up to 30% off", desc: "Galaxy phones, TVs, Tablets & Smart Appliances", products: 218, bg: "#eff6ff" },
  { brand: "Sony", logo: "🎮", discount: "Up to 35% off", desc: "BRAVIA TVs, Headphones, PlayStation & Cameras", products: 156, bg: "#fdf4ff" },
  { brand: "LG", logo: "📺", discount: "Up to 40% off", desc: "OLED TVs, Washing Machines, Refrigerators & ACs", products: 189, bg: "#f0fdf4" },
  { brand: "Dyson", logo: "🌀", discount: "Up to 25% off", desc: "Vacuum Cleaners, Air Purifiers & Styling Tools", products: 43, bg: "#fefce8" },
  { brand: "OnePlus", logo: "⚡", discount: "Up to 28% off", desc: "Flagship & Nord series phones, TVs & earbuds", products: 67, bg: "#fff7ed" },
];

const COUPONS: Coupon[] = [
  { code: "MOTAB10", title: "Flat Rs 1,000 Off", desc: "On all orders above Rs 15,000", minOrder: "Rs 15,000", maxOff: "Rs 1,000", valid: "30 Apr 2026", category: "All Products", color: "#dc2626" },
  { code: "MOBILE500", title: "Rs 500 on Mobiles", desc: "Extra Rs 500 off on Mobile phones", minOrder: "Rs 10,000", maxOff: "Rs 500", valid: "30 Apr 2026", category: "Mobiles", color: "#2563eb" },
  { code: "TV3000", title: "Rs 3,000 on TVs", desc: "Exclusive TV discount coupon", minOrder: "Rs 40,000", maxOff: "Rs 3,000", valid: "30 Apr 2026", category: "TVs", color: "#7c3aed" },
  { code: "HDFC1500", title: "HDFC Extra Rs 1,500", desc: "With HDFC Bank credit/debit cards", minOrder: "Rs 20,000", maxOff: "Rs 1,500", valid: "30 Apr 2026", category: "All Products", color: "#0052cc" },
  { code: "NEWUSER300", title: "New User Bonus", desc: "First purchase discount for new users", minOrder: "Rs 5,000", maxOff: "Rs 300", valid: "30 Apr 2026", category: "All Products", color: "#16a34a" },
  { code: "LAPTOP2K", title: "Laptop Mega Deal", desc: "Extra Rs 2,000 off on Laptops", minOrder: "Rs 35,000", maxOff: "Rs 2,000", valid: "30 Apr 2026", category: "Laptops", color: "#b45309" },
];

const COMBOS: ComboProduct[] = [
  { title: "Work From Home Bundle", items: [{ name: "MacBook Air M3", price: 114900 }, { name: "Magic Mouse", price: 7900 }, { name: "AirPods Pro 2nd Gen", price: 21900 }], total: 144700, combo: 124999, img: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80", badge: "Save Rs 19,701" },
  { title: "Gaming Beast Pack", items: [{ name: "PlayStation 5", price: 54990 }, { name: 'Sony 55" 4K TV', price: 74990 }, { name: "PS5 Controller", price: 6990 }], total: 136970, combo: 114999, img: "https://images.unsplash.com/photo-1635002962487-2c1d4d2f63c2?w=400&q=80", badge: "Save Rs 21,971" },
  { title: "Smart Home Starter", items: [{ name: "LG 1.5T Split AC", price: 45990 }, { name: "Alexa Echo Dot", price: 4499 }, { name: "Smart LED Strip", price: 1999 }], total: 52488, combo: 44999, img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80", badge: "Save Rs 7,489" },
];

const CLEARANCE: ClearanceProduct[] = [
  { brand: "Samsung", name: "Galaxy S23 5G 128GB (Refurbished Grade A)", img: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=300&q=80", price: 39999, original: 74999, badge: "47% Off" },
  { brand: "Apple", name: "iPad 9th Gen 64GB Wi-Fi (Open Box)", img: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=300&q=80", price: 24999, original: 44900, badge: "44% Off" },
  { brand: "Sony", name: "WH-1000XM4 Headphones (Display Unit)", img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&q=80", price: 14999, original: 29990, badge: "50% Off" },
  { brand: "LG", name: '43" Full HD Smart TV (Last Year Model)', img: "https://images.unsplash.com/photo-1461151304267-38535e780c79?w=300&q=80", price: 21999, original: 38990, badge: "44% Off" },
];

const navLinks = [
  { href: "/", icon: "fas fa-house", label: "Home" },
  { href: "/products?cat=mobiles", icon: "fas fa-mobile-screen", label: "Mobiles" },
  { href: "/products?cat=tvs", icon: "fas fa-tv", label: "TVs" },
  { href: "/products?cat=laptops", icon: "fas fa-laptop", label: "Laptops" },
  { href: "/products?cat=appliances", icon: "fas fa-blender", label: "Appliances" },
  { href: "/brands", icon: "fas fa-award", label: "Brands" },
  { href: "/blog", icon: "fas fa-newspaper", label: "Blog" },
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
function useCountdown() {
  const [time, setTime] = useState({ h: "00", m: "00", s: "00" });
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const midnight = new Date(now); midnight.setHours(23, 59, 59, 999);
      const diff = midnight.getTime() - now.getTime();
      const pad = (n: number) => String(n).padStart(2, "0");
      setTime({ h: pad(Math.floor(diff / 3600000)), m: pad(Math.floor((diff % 3600000) / 60000)), s: pad(Math.floor((diff % 60000) / 1000)) });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
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
    img: o.primaryImage || OFFER_FALLBACK_IMG,
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
  const time = useCountdown();
  const [bankOffers, setBankOffers] = useState<BankOffer[]>(BANK_OFFERS);
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

  // Flash & Clearance reuse existing card shapes; fall back to static demo data
  const flashList = flashOffers.length
    ? flashOffers.map((o) => {
        const c = offerToCard(o);
        const sold = c.sold ?? 0;
        const total = 100;
        return { id: Number(c.id), brand: c.brand, name: c.name, img: c.img, price: c.price, original: c.original, sold, total, emi: "", badge: c.badge };
      })
    : FLASH_PRODUCTS;

  const clearanceList = clearanceOffers.length
    ? clearanceOffers.map((o) => {
        const c = offerToCard(o);
        return { brand: c.brand, name: c.name, img: c.img, price: c.price, original: c.original, badge: c.badge || "Clearance" };
      })
    : CLEARANCE;

  const comboList = comboOffers.length
    ? comboOffers.map((o) => {
        const items = (o.comboItems ?? []).map((ci) => ({ name: ci.itemName || "", price: Number(ci.price) || 0 }));
        const total = items.reduce((s, it) => s + it.price, 0);
        const combo = Number(o.offerPrice ?? 0);
        const saving = Math.max(0, total - combo);
        return { title: o.comboTitle || "Combo Deal", items, total, combo, img: o.primaryImage || OFFER_FALLBACK_IMG, badge: o.badge || (saving > 0 ? `Save ${fp(saving)}` : "Combo") };
      })
    : COMBOS;

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

  const openBankModal = (bankName: string) => {
    const detail = BANK_DETAILS.find((item) => item.bank === bankName);
    if (!detail) return;
    setActiveBank(detail);
    setBankTab("overview");
    setEmiDiscount(parseFloat(detail.offer.replace(/[^\d.]/g, "")) || 0);
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
            <div className="off-hero-tag"><i className="fas fa-fire" /> Mega Sale Live Now</div>
            <h1 className="off-hero-title">Unbeatable Deals &<span>Exclusive Offers</span></h1>
            <p className="off-hero-sub">Up to 50% off on top brands. Bank discounts, coupons & combo deals waiting for you.</p>
            <div className="off-hero-stats">
              <div className="off-hero-stat"><div className="off-hs-num">500+</div><div className="off-hs-label">Live Deals</div></div>
              <div className="off-hero-stat-div" />
              <div className="off-hero-stat"><div className="off-hs-num">50%</div><div className="off-hs-label">Max Discount</div></div>
              <div className="off-hero-stat-div" />
              <div className="off-hero-stat"><div className="off-hs-num">6</div><div className="off-hs-label">Bank Offers</div></div>
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
            <div className="off-hc-promo">🎉 Use code MOTAB10 for extra Rs 1,000 off</div>
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
            {flashList.map((p, i) => {
              const pct = Math.round((p.sold / p.total) * 100);
              return (
                <div key={p.id} className="off-flash-card" style={{ animationDelay: `${i * 0.06}s` }}>
                  <div className="off-flash-badge">{p.badge}</div>
                  <div className="off-flash-img"><img src={p.img} alt={p.name} loading="lazy" /></div>
                  <div className="off-flash-info">
                    <div className="off-flash-brand">{p.brand}</div>
                    <div className="off-flash-name">{p.name}</div>
                    <div className="off-flash-progress-wrap">
                      <div className="off-flash-progress-label"><span>🔥 {p.sold}% sold</span><span>{p.total - p.sold} left</span></div>
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
            })}
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
            {bankOffers.map((b, i) => (
              <div key={i} className="off-bank-card" style={{ background: b.color }} onClick={() => {
                const detail =
                  dynamicDetails[b.bank] ||
                  BANK_DETAILS.find((d) => d.bank === b.bank) ||
                  BANK_DETAILS[[0, 1, 3, 2, 4, 5][i] ?? 0];
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
            ))}
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
                const count = Array.isArray(o.productIds) ? o.productIds.length : 0;
                return (
                  <div key={o.id} className="off-brand-card" style={{ background: bankOfferGradient(o.colorTheme), color: "#fff" }}>
                    <div className="off-brand-logo" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>{(o.brandDealName || "B").slice(0, 1)}</div>
                    <div className="off-brand-name" style={{ color: "#fff" }}>{o.brandDealName || "Brand"}</div>
                    <div className="off-brand-discount" style={{ color: "#fff" }}>{o.discountLabel || ""}</div>
                    <div className="off-brand-desc" style={{ color: "rgba(255,255,255,.85)" }}>{o.description || ""}</div>
                    {count > 0 && <div className="off-brand-count" style={{ color: "rgba(255,255,255,.85)" }}><i className="fas fa-box" /> {count} products</div>}
                    <button className="off-brand-btn" onClick={() => showToast(`<i class="fas fa-arrow-right"></i> Opening ${o.brandDealName} deals...`)}>Shop Now <i className="fas fa-arrow-right" /></button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="off-brand-grid">
              {BRAND_DEALS.map((b, i) => (
                <div key={i} className="off-brand-card" style={{ background: b.bg }}>
                  <div className="off-brand-logo">{b.logo}</div>
                  <div className="off-brand-name">{b.brand}</div>
                  <div className="off-brand-discount">{b.discount}</div>
                  <div className="off-brand-desc">{b.desc}</div>
                  <div className="off-brand-count"><i className="fas fa-box" /> {b.products} products</div>
                  <button className="off-brand-btn" onClick={() => showToast(`<i class="fas fa-arrow-right"></i> Opening ${b.brand} deals...`)}>Shop Now <i className="fas fa-arrow-right" /></button>
                </div>
              ))}
            </div>
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
            <div className="off-coupon-grid">
              {COUPONS.map((c, i) => (
                <div key={i} className="off-coupon-card">
                  <div className="off-coupon-left" style={{ background: c.color }}>
                    <div className="off-coupon-cat">{c.category}</div>
                    <div className="off-coupon-title">{c.title}</div>
                  </div>
                  <div className="off-coupon-right">
                    <div className="off-coupon-desc">{c.desc}</div>
                    <div className="off-coupon-meta">
                      <span><i className="fas fa-shopping-bag" /> Min: {c.minOrder}</span>
                      <span><i className="fas fa-tag" /> Max: {c.maxOff}</span>
                      <span><i className="fas fa-calendar" /> Valid till {c.valid}</span>
                    </div>
                    <button className={`off-coupon-copy${copiedCode === c.code ? " copied" : ""}`} onClick={() => copyCode(c.code)}>
                      <span className="off-code">{c.code}</span>
                      <span className="off-copy-label"><i className={`fas fa-${copiedCode === c.code ? "check" : "copy"}`} /> {copiedCode === c.code ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
            {comboList.map((c, i) => (
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
            ))}
          </div>
        </div>
      </section>

      {/* Clearance */}
      <section id="clearance" className="off-section off-clearance-section">
        <div className="off-section-inner">
          <div className="off-section-head">
            <div>
              <div className="off-section-eyebrow" style={{ color: "#fca5a5" }}><i className="fas fa-fire" /> Limited Stock</div>
              <h2 className="off-section-title" style={{ color: "#fff" }}>Clearance <span>Sale</span></h2>
              <p className="off-section-subtitle" style={{ color: "rgba(255,255,255,.6)" }}>Last pieces! Grab them before they're gone.</p>
            </div>
          </div>
          <div className="off-clearance-grid">
            {clearanceList.map((p, i) => (
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
            ))}
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
            <div className="off-fb-logo">MOTABHAI</div>
            <p>Your one-stop destination for the latest electronics, mobile phones, laptops, and home appliances at the best prices with genuine warranty.</p>
          </div>
          {[
            { title: "Quick Links", links: [{ href: "/", label: "Home" }, { href: "/about", label: "About Us" }, { href: "/brands", label: "Brands" }, { href: "/blog", label: "Blog" }, { href: "/offers", label: "Offers" }] },
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
          <p>&copy; 2026 Motabhai Electronics. All rights reserved.</p>
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
