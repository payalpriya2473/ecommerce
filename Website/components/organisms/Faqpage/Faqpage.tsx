"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { buildApiUrl } from "@/lib/api/config";
import "./Faqpage.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FAQItem { q: string; a: string; }
interface FAQSection { id: string; icon: string; title: string; items: FAQItem[]; }

// ─── Data ─────────────────────────────────────────────────────────────────────

const announcementItems = [
  "Free shipping on orders above Rs 499",
  "2-Year Warranty on all products",
  "10-Day Hassle-Free Returns",
  "No-Cost EMI on HDFC & SBI Cards",
];

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Mobiles" },
  { href: "/offers", label: "Offers" },
  { href: "/brands", label: "Brands" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ", active: true },
];

const helpCategories = [
  { id: "orders-delivery", icon: "fas fa-shopping-bag", title: "Orders & Delivery", count: 6 },
  { id: "returns-refunds", icon: "fas fa-sync", title: "Returns & Refunds", count: 5 },
  { id: "payments-emi", icon: "fas fa-credit-card", title: "Payments & EMI", count: 5 },
  { id: "products-warranty", icon: "fas fa-shield-alt", title: "Products & Warranty", count: 5 },
  { id: "account-profile", icon: "fas fa-user-circle", title: "Account & Profile", count: 5 },
  { id: "bulk-orders", icon: "fas fa-building", title: "Bulk Orders", count: 4 },
];

const faqSections: FAQSection[] = [
  {
    id: "orders-delivery", icon: "fas fa-shopping-bag", title: "Orders & Delivery",
    items: [
      { q: "How long does delivery take?", a: "We offer Same-Day delivery in major cities like Mumbai, Delhi, and Bangalore for orders placed before 12 PM. Standard delivery takes 2-3 business days across India. Express delivery is available in select cities and takes 24 hours from order confirmation." },
      { q: "Can I change my address after ordering?", a: "Yes, you can change your delivery address within 2 hours of placing the order. After 2 hours, the order enters the packing phase and address changes are not possible. If you need to change the address after this, you can cancel and place a new order." },
      { q: "How do I track my order?", a: "You can track your order in real-time through your AppleNext account under \"My Orders\" or via SMS/Email notifications we send. Click on any order to see detailed tracking with delivery partner information, estimated arrival time, and live location updates." },
      { q: "What if my item is delayed?", a: "If your order is delayed beyond the promised delivery date, contact our support team immediately. We'll investigate the delay and offer you a 10% refund or an extended 15-day return window as compensation." },
      { q: "Do you deliver on Sundays?", a: "Yes, we deliver 7 days a week across most areas. Deliveries are scheduled between 10 AM to 8 PM. You can specify your preferred delivery time slot while placing the order. Some remote areas may have limited delivery schedules." },
      { q: "Is there a fee for same-day delivery?", a: "Same-day delivery is absolutely free for orders above Rs 499. For orders below this amount, there's a small delivery fee of Rs 49. This service is available for most pin codes in metros and tier-1 cities." },
    ],
  },
  {
    id: "returns-refunds", icon: "fas fa-sync", title: "Returns & Refunds",
    items: [
      { q: "What is the return policy?", a: "We offer a hassle-free 10-day return policy on all products. Items must be in original, unused condition with all original packaging, accessories, and documentation. Returns initiated within 10 days are eligible for full refund minus applicable charges." },
      { q: "How do I initiate a return?", a: "Log into your AppleNext account, go to \"My Orders\", select the product you want to return, and click \"Return Item\". Fill in the reason for return and we'll send you a prepaid return label. Pack the item securely and drop it off at any nearby collection point." },
      { q: "When will I get my refund?", a: "Once your returned item is received and inspected at our warehouse (typically 3-5 days after pickup), the refund is processed. You'll receive your refund within 2-3 business days to your original payment method." },
      { q: "Can I exchange instead of return?", a: "Absolutely! You can exchange your product for the same item or an equivalent item within 10 days. If the new product costs more, you'll need to pay the difference. Exchanges are usually processed faster than returns, typically within 7 days." },
      { q: "What items cannot be returned?", a: "Items used beyond normal testing, items with visible damage caused by the buyer, items without original packaging, custom-made or personalized products, and items purchased on final sale or clearance cannot be returned. Faulty products are always returnable within warranty period." },
    ],
  },
  {
    id: "payments-emi", icon: "fas fa-credit-card", title: "Payments & EMI",
    items: [
      { q: "What payment methods are accepted?", a: "We accept all major payment methods: Credit Cards (Visa, Mastercard, Amex), Debit Cards, UPI, Net Banking, Mobile Wallets (Google Pay, PhonePe, PayTM), and Cash on Delivery (available in selected areas). You can also use EMI options on eligible products." },
      { q: "How does No-Cost EMI work?", a: "No-Cost EMI allows you to pay for products in monthly installments without any extra interest. We offer 3, 6, 9, and 12-month EMI options on purchases above Rs 5,000. The option is available with select credit cards and is processed instantly at checkout." },
      { q: "Is it safe to save my card?", a: "Yes, completely safe. We use industry-standard 256-bit SSL encryption and PCI DSS compliance for all card data. Only the last 4 digits and card type are stored. Your full card details are never stored on our servers and are tokenized by our payment partner for security." },
      { q: "Can I pay via UPI?", a: "Yes, we support UPI payments through all major UPI apps including Google Pay, PhonePe, and PayTM. UPI payments are instant and secure. You'll get an immediate confirmation, and the amount will be debited from your linked bank account instantly." },
      { q: "What if my payment fails?", a: "If your payment fails, you'll see an error message and the order won't be placed. Your payment won't be deducted. Try the transaction again with the same or a different payment method. If you continue to face issues, contact our support team at 1800-123-4567." },
    ],
  },
  {
    id: "products-warranty", icon: "fas fa-shield-alt", title: "Products & Warranty",
    items: [
      { q: "Are all products genuine?", a: "100% yes. All products on AppleNext are sourced directly from authorized distributors and manufacturers. We provide an official authenticity guarantee with every purchase. If any product is found to be counterfeit, we offer a full refund plus compensation." },
      { q: "How do I claim warranty?", a: "To claim warranty, visit the service center authorized by the manufacturer with your product and original bill/receipt from AppleNext. Service is free for manufacturer defects. You can also contact us and we'll arrange doorstep service for high-value items." },
      { q: "What does the warranty cover?", a: "Manufacturer warranty covers manufacturing defects, faulty components, and hardware failures. It does NOT cover physical damage, water damage, misuse, or wear and tear from normal use. AppleNext offers additional extended warranty protection for accidental damage on select products." },
      { q: "How do I get service for my device?", a: "You can visit any authorized service center listed on the manufacturer's website. For convenience, AppleNext arranges on-call service for gadgets in major cities. Contact our customer support and we'll schedule a service appointment and arrange pickup from your location." },
      { q: "Do you sell open-box items?", a: "Yes, we offer certified open-box and refurbished products at discounted prices. These items have been tested, cleaned, and repackaged. They come with full warranty and are sold with the same return policy as new products. They're clearly marked as open-box in the product listing." },
    ],
  },
  {
    id: "account-profile", icon: "fas fa-user-circle", title: "Account & Profile",
    items: [
      { q: "How do I create an account?", a: "Click \"Sign Up\" on our website or app and enter your email or mobile number. Verify with the OTP sent to you, set a password, and provide basic details. You can also sign up with your Google, Facebook, or Apple account for quick registration." },
      { q: "I forgot my password. How do I reset it?", a: "On the login page, click \"Forgot Password\" and enter your registered email or mobile number. You'll receive a reset link or OTP. Click the link or enter the OTP to create a new password. The link expires in 30 minutes for security." },
      { q: "How do I change my mobile number?", a: "Go to your account settings, click \"Mobile Number\", enter your new number, and verify with an OTP. Your old number will be replaced immediately. You can also contact customer support to change your mobile number." },
      { q: "How do I delete my account?", a: "You can request account deletion from Settings > Account Settings > Delete Account. We'll ask you to confirm the reason. Your account will be deactivated immediately and all personal data will be deleted within 30 days per our privacy policy." },
      { q: "What are AppleNext Reward Points?", a: "AppleNext Reward Points are loyalty points you earn with every purchase. For every Rs 100 spent, you get 10 points. Points can be redeemed for discounts, free shipping, or exclusive products. Points expire after 2 years if not used. You can track and redeem them from your account dashboard." },
    ],
  },
  {
    id: "bulk-orders", icon: "fas fa-building", title: "Bulk Orders",
    items: [
      { q: "Do you offer bulk discounts?", a: "Yes! We offer special pricing for bulk orders (10+ units). The discount varies based on quantity and product category. For bulk inquiries, contact our B2B team at bulk@applenext.in or call 1800-123-4567 ext. 5." },
      { q: "What's the minimum quantity for bulk orders?", a: "Minimum order quantity is 10 units per SKU. However, we can discuss custom quantities depending on the product and availability. For unique requirements, please reach out to our B2B team with your specifications." },
      { q: "Can I get customized invoicing for bulk orders?", a: "Absolutely. For bulk orders, we provide customized invoicing with your company details, purchase order numbers, and specific delivery requirements. You can also arrange credit terms with our B2B team based on credit verification." },
      { q: "Do you provide B2B support?", a: "Yes, our dedicated B2B team provides end-to-end support for corporate and bulk orders. We handle custom quotes, purchase orders, delivery coordination, and after-sales support. Email bulk@applenext.in or call our B2B hotline for assistance." },
    ],
  },
];

// Store contact details. Phone and email are real links so a tap dials or
// opens the mail client rather than just showing text.
const contactDetails: Array<{
  icon: string;
  label: string;
  value: string;
  meta: string;
  href?: string;
}> = [
  {
    icon: "fas fa-location-dot",
    label: "Our address",
    value: "D/103, Shubham Heights",
    meta: "Opp. Narayan Garden, New Alkapuri, Vadodara, Gujarat 390023",
  },
  {
    icon: "fas fa-phone",
    label: "Call us",
    value: "+91 99985 61006",
    meta: "Mon–Sat: 10 AM – 8 PM  |  Emergency: Available 24/7",
    href: "tel:+919998561006",
  },
  {
    icon: "fas fa-envelope",
    label: "Email us",
    value: "support@applenext.in",
    meta: "We reply within 2 business hours",
    href: "mailto:support@applenext.in",
  },
  {
    icon: "fas fa-clock",
    label: "Business hours",
    value: "Mon – Sat: 10:00 AM – 8:00 PM",
    meta: "Sunday: Closed  |  Emergency support available",
  },
];

// Must stay in step with the whitelist in Backend/routes/contactRoutes.js —
// the server rejects a service it doesn't recognise.
const SERVICE_OPTIONS = [
  "Apple Repair",
  "MacBook / iMac Service",
  "iPhone / iPad Repair",
  "Data Recovery",
  "IT Services & Support",
  "Networking & Wi-Fi",
  "Software & Cloud",
  "Other",
];
const CONTACT_TIME_OPTIONS = [
  "Anytime",
  "Morning (10 AM – 1 PM)",
  "Afternoon (1 PM – 5 PM)",
  "Evening (5 PM – 8 PM)",
];
const VISIT_TYPE_OPTIONS = ["Walk-in to Store", "Pickup & Drop", "On-site Visit", "Remote Support"];

const STORE_ADDRESS = "D/103, Shubham Heights, Opp. Narayan Garden, New Alkapuri, Vadodara, Gujarat 390023";
const MAPS_QUERY = encodeURIComponent("Shubham Heights, New Alkapuri, Vadodara, Gujarat 390023");
const WHATSAPP_NUMBER = "919998561006";

const popularArticles = [
  { icon: "fas fa-box", title: "How to track your order in real-time", desc: "Step-by-step guide to tracking orders from placement to delivery" },
  { icon: "fas fa-undo", title: "Complete return process step-by-step", desc: "Everything you need to know about returning items within 10 days" },
  { icon: "fas fa-calculator", title: "No-Cost EMI calculator and guide", desc: "How EMI works and calculate your monthly payments easily" },
  { icon: "fas fa-shield-alt", title: "Warranty claim made easy", desc: "Step-by-step process to claim warranty for your product" },
  { icon: "fas fa-exchange-alt", title: "Exchange your old device", desc: "Get the best value for your old phone with our trade-in program" },
  { icon: "fas fa-user-plus", title: "Setting up your AppleNext account", desc: "Create account, verify, and start saving with AppleNext Reward Points" },
];

// ─── Accordion Item ───────────────────────────────────────────────────────────

function AccordionItem({ q, a }: FAQItem) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-accordion-item${open ? " open" : ""}`}>
      <button className={`faq-accordion-header${open ? " active" : ""}`} onClick={() => setOpen((v) => !v)}>
        <span>{q}</span>
        <i className={`fas fa-chevron-down faq-chevron${open ? " rotated" : ""}`} />
      </button>
      <div className={`faq-accordion-content${open ? " open" : ""}`}>
        <div className="faq-accordion-body">{a}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Contact form ─────────────────────────────────────────────────────────────

type FieldErrors = Partial<Record<"name" | "phone" | "email" | "service" | "message", string>>;

function ContactForm() {
  const [values, setValues] = useState({
    name: "",
    phone: "",
    email: "",
    service: "",
    device: "",
    message: "",
    contactTime: CONTACT_TIME_OPTIONS[0],
    visitType: VISIT_TYPE_OPTIONS[0],
    company: "", // honeypot — hidden from real users
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [notice, setNotice] = useState("");

  const set = (field: keyof typeof values) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // Mirrors the server rules so the customer gets feedback without a round trip.
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (values.name.trim().length < 2) next.name = "Please enter your name.";
    if (!/^(?:\+?91[- ]?|0)?[6-9]\d{9}$/.test(values.phone.replace(/\s+/g, "")))
      next.phone = "Enter a valid 10-digit mobile number.";
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim()))
      next.email = "That email address doesn't look right.";
    if (!values.service) next.service = "Please choose a service.";
    if (values.message.trim().length < 10)
      next.message = "Please describe the issue in a little more detail.";
    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setStatus("error");
      setNotice("Please fix the highlighted fields.");
      return;
    }

    setStatus("sending");
    setNotice("");
    try {
      const res = await fetch(buildApiUrl("contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        if (data?.errors) setErrors(data.errors as FieldErrors);
        setStatus("error");
        setNotice(data?.message || "We couldn't send that just now. Please call or WhatsApp us.");
        return;
      }

      setStatus("sent");
      setNotice(data.message || "Thanks — we'll get back to you within 2 business hours.");
      setValues((v) => ({
        ...v,
        name: "", phone: "", email: "", service: "", device: "", message: "",
      }));
    } catch {
      setStatus("error");
      setNotice("Couldn't reach the server. Please call or WhatsApp us on +91 99985 61006.");
    }
  };

  const sending = status === "sending";

  return (
    <form className="faq-form-card" onSubmit={handleSubmit} noValidate>
      <h2 className="faq-form-title">
        Send Us a <em>Message</em>
      </h2>
      <p className="faq-form-sub">
        Fill out the form and our team will get back within 2 business hours. For
        urgent repairs, please call directly.
      </p>

      <div className="faq-form-row">
        <div className="faq-field">
          <label htmlFor="cf-name">Your Name <span aria-hidden="true">*</span></label>
          <input
            id="cf-name" type="text" placeholder="Full Name" value={values.name}
            onChange={(e) => set("name")(e.target.value)}
            aria-invalid={!!errors.name} aria-describedby={errors.name ? "cf-name-err" : undefined}
            className={errors.name ? "has-error" : ""} autoComplete="name" required
          />
          {errors.name && <span className="faq-field-err" id="cf-name-err">{errors.name}</span>}
        </div>

        <div className="faq-field">
          <label htmlFor="cf-phone">Phone Number <span aria-hidden="true">*</span></label>
          <input
            id="cf-phone" type="tel" placeholder="+91 XXXXX XXXXX" value={values.phone}
            onChange={(e) => set("phone")(e.target.value)}
            aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "cf-phone-err" : undefined}
            className={errors.phone ? "has-error" : ""} autoComplete="tel" required
          />
          {errors.phone && <span className="faq-field-err" id="cf-phone-err">{errors.phone}</span>}
        </div>
      </div>

      <div className="faq-field">
        <div className="faq-field-head">
          <label htmlFor="cf-email">Email Address</label>
          <span className="faq-field-hint">Optional — but we&apos;ll send a confirmation</span>
        </div>
        <input
          id="cf-email" type="email" placeholder="your@email.com" value={values.email}
          onChange={(e) => set("email")(e.target.value)}
          aria-invalid={!!errors.email} aria-describedby={errors.email ? "cf-email-err" : undefined}
          className={errors.email ? "has-error" : ""} autoComplete="email"
        />
        {errors.email && <span className="faq-field-err" id="cf-email-err">{errors.email}</span>}
      </div>

      <div className="faq-field">
        <label htmlFor="cf-service">Service Needed <span aria-hidden="true">*</span></label>
        <div className="faq-select">
          <select
            id="cf-service" value={values.service}
            onChange={(e) => set("service")(e.target.value)}
            aria-invalid={!!errors.service} aria-describedby={errors.service ? "cf-service-err" : undefined}
            className={errors.service ? "has-error" : ""} required
          >
            <option value="">Select a Service</option>
            {SERVICE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <i className="fas fa-chevron-down" aria-hidden="true" />
        </div>
        {errors.service && <span className="faq-field-err" id="cf-service-err">{errors.service}</span>}
      </div>

      <div className="faq-field">
        <label htmlFor="cf-device">Device Model (if applicable)</label>
        <input
          id="cf-device" type="text" placeholder="e.g. iPhone 15 Pro, MacBook Air M2"
          value={values.device} onChange={(e) => set("device")(e.target.value)}
        />
      </div>

      <div className="faq-field">
        <label htmlFor="cf-message">Describe Your Issue <span aria-hidden="true">*</span></label>
        <textarea
          id="cf-message" rows={5}
          placeholder="Please describe the problem or what service you need in detail..."
          value={values.message} onChange={(e) => set("message")(e.target.value)}
          aria-invalid={!!errors.message} aria-describedby={errors.message ? "cf-message-err" : undefined}
          className={errors.message ? "has-error" : ""} required
        />
        {errors.message && <span className="faq-field-err" id="cf-message-err">{errors.message}</span>}
      </div>

      <div className="faq-form-row">
        <div className="faq-field">
          <label htmlFor="cf-time">Preferred Contact Time</label>
          <div className="faq-select">
            <select id="cf-time" value={values.contactTime} onChange={(e) => set("contactTime")(e.target.value)}>
              {CONTACT_TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <i className="fas fa-chevron-down" aria-hidden="true" />
          </div>
        </div>
        <div className="faq-field">
          <label htmlFor="cf-visit">Visit Type</label>
          <div className="faq-select">
            <select id="cf-visit" value={values.visitType} onChange={(e) => set("visitType")(e.target.value)}>
              {VISIT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <i className="fas fa-chevron-down" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Honeypot — off-screen, never announced, never focusable. */}
      <div className="faq-hp" aria-hidden="true">
        <label htmlFor="cf-company">Company</label>
        <input
          id="cf-company" type="text" tabIndex={-1} autoComplete="off"
          value={values.company} onChange={(e) => set("company")(e.target.value)}
        />
      </div>

      <button type="submit" className="faq-form-submit" disabled={sending}>
        <i className={sending ? "fas fa-circle-notch fa-spin" : "fas fa-paper-plane"} aria-hidden="true" />
        {sending ? "Sending…" : "Send Message"}
      </button>

      {notice && (
        <p className={`faq-form-notice ${status === "sent" ? "is-ok" : "is-err"}`} role="status">
          <i className={`fas ${status === "sent" ? "fa-circle-check" : "fa-circle-exclamation"}`} aria-hidden="true" />
          {notice}
        </p>
      )}

      <p className="faq-form-legal">
        By submitting this form, you agree to be contacted by our team about your inquiry.
      </p>
    </form>
  );
}

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cartCount] = useState(0);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    // Expand matching accordions
    const lower = searchQuery.toLowerCase();
    faqSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.q.toLowerCase().includes(lower) || item.a.toLowerCase().includes(lower)) {
          const el = document.getElementById(section.id);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  };

  const quickActions = [
    { icon: "fas fa-box", label: "Track Order", sectionId: "orders-delivery" },
    { icon: "fas fa-undo", label: "Return Item", sectionId: "returns-refunds" },
    { icon: "fas fa-credit-card", label: "EMI Help", sectionId: "payments-emi" },
    { icon: "fas fa-phone", label: "Contact Us", href: "/about#contact" },
  ];

  return (
    <div className="faq-root">
      <main className="faq-main">
        {/* Hero */}
        <div className="faq-hero">
          <h1>How can we help you?</h1>
          <div className="faq-hero-search">
            <input type="text" placeholder="Search your question or issue..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />
            <button onClick={handleSearch}><i className="fas fa-search" /> Search</button>
          </div>
          <div className="faq-quick-actions">
            {quickActions.map((a, i) =>
              a.href ? (
                <Link key={i} href={a.href} className="faq-quick-action"><i className={a.icon} /> {a.label}</Link>
              ) : (
                <button key={i} className="faq-quick-action" onClick={() => a.sectionId && scrollToSection(a.sectionId)}><i className={a.icon} /> {a.label}</button>
              )
            )}
          </div>
        </div>

        {/* Browse Categories */}
        <section className="faq-section">
          <h2>Browse by Category</h2>
          <div className="faq-categories-grid">
            {helpCategories.map((cat) => (
              <div key={cat.id} className="faq-category-card" onClick={() => scrollToSection(cat.id)}>
                <i className={`${cat.icon} faq-category-icon`} />
                <h3>{cat.title}</h3>
                <div className="faq-category-count">{cat.count} questions</div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Sections */}
        {faqSections.map((section) => (
          <section key={section.id} id={section.id} className="faq-faq-section">
            <div className="faq-section-title">
              <i className={`${section.icon} faq-section-icon`} />
              {section.title}
            </div>
            {section.items.map((item, i) => (
              <AccordionItem key={i} {...item} />
            ))}
          </section>
        ))}

        {/* Contact details + message form */}
        <section className="faq-contact-section" id="contact">
          <div className="faq-contact-grid">
            {/* Left: store details */}
            <div className="faq-contact-col">
              <h2 className="faq-contact-title">AppleNext, Vadodara</h2>
              <p className="faq-contact-sub">
                Computer Support and Services — Available Mon to Sat, 10 AM to 8 PM
              </p>

              <div className="faq-contact-list">
                {contactDetails.map((detail) => (
                  <div className="faq-contact-card" key={detail.label}>
                    <span className="faq-contact-icon" aria-hidden="true">
                      <i className={detail.icon} />
                    </span>
                    <div className="faq-contact-body">
                      <span className="faq-contact-label">{detail.label}</span>
                      {detail.href ? (
                        <a className="faq-contact-value" href={detail.href}>
                          {detail.value}
                        </a>
                      ) : (
                        <span className="faq-contact-value">{detail.value}</span>
                      )}
                      <span className="faq-contact-meta">{detail.meta}</span>
                    </div>
                  </div>
                ))}
              </div>

              <a
                className="faq-whatsapp"
                href={`https://wa.me/${WHATSAPP_NUMBER}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="faq-whatsapp-icon" aria-hidden="true">
                  <i className="fab fa-whatsapp" />
                </span>
                <span className="faq-whatsapp-body">
                  <span className="faq-whatsapp-label">Chat on WhatsApp — Fastest Response</span>
                  <span className="faq-whatsapp-value">+91 99985 61006 → Quick Support</span>
                </span>
              </a>

              <div className="faq-map">
                <a
                  className="faq-map-open"
                  href={`https://www.google.com/maps/search/?api=1&query=${MAPS_QUERY}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Maps <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
                </a>
                <iframe
                  title={`Map showing ${STORE_ADDRESS}`}
                  src={`https://www.google.com/maps?q=${MAPS_QUERY}&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>

            {/* Right: message form */}
            <ContactForm />
          </div>
        </section>

        {/* Popular Articles */}
        <section className="faq-section faq-articles-section">
          <h2>Popular Articles</h2>
          <div className="faq-articles-grid">
            {popularArticles.map((a, i) => (
              <a key={i} href="#" className="faq-article-card">
                <div className="faq-article-icon"><i className={a.icon} /></div>
                <div className="faq-article-content">
                  <h4>{a.title}</h4>
                  <p>{a.desc}</p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="faq-footer">
        <div className="faq-footer-inner">
          <div className="faq-fb-brand">
            <div className="faq-fb-logo">APPLENEXT</div>
            <p>Your one-stop destination for the latest electronics, mobile phones, laptops, and home appliances at the best prices with genuine warranty.</p>
          </div>
          {[
            { title: "Quick Links", links: [{ href: "/", label: "Home" }, { href: "/about", label: "About Us" }, { href: "/brands", label: "Brands" }, { href: "/blog", label: "Blog" }, { href: "/offers", label: "Offers" }] },
            { title: "Customer Service", links: [{ href: "/faq", label: "Help Center" }, { href: "/account", label: "Track Order" }, { href: "/faq", label: "Return Policy" }, { href: "/faq", label: "Warranty Info" }, { href: "/faq", label: "EMI Options" }] },
            { title: "My Account", links: [{ href: "/login", label: "Login / Register" }, { href: "/account", label: "My Orders" }, { href: "/cart", label: "My Cart" }, { href: "/account", label: "Wishlist" }, { href: "/products", label: "Search Products" }] },
          ].map((col) => (
            <div key={col.title} className="faq-fc">
              <h4>{col.title}</h4>
              {col.links.map((l) => <Link key={l.href + l.label} href={l.href}>{l.label}</Link>)}
            </div>
          ))}
        </div>
        <div className="faq-footer-bottom">
          <p>&copy; 2026 AppleNext Electronics. All rights reserved.</p>
          <div className="faq-pay-tags"><span>Visa</span><span>Mastercard</span><span>UPI</span><span>Net Banking</span><span>EMI</span></div>
        </div>
      </footer>
    </div>
  );
}
