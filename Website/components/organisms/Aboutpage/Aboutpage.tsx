"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import "./Aboutpage.css";

// ─────────────────────────────────────────────────────────────────────────────
//  Reusable building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Small pill above a section heading — "OUR STORY", "WHAT WE BELIEVE", … */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="abt-eyebrow">
      <i className="abt-eyebrow-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/** Section wrapper that fades its content in the first time it scrolls into view. */
function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  as?: "div" | "section" | "article" | "li";
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No IntersectionObserver (or reduced motion) → show immediately.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );

    observer.observe(node);

    // Safety net: content must never stay invisible if the observer misses.
    const fallback = window.setTimeout(() => setShown(true), 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`abt-reveal ${shown ? "is-visible" : ""} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/** Centred section header: eyebrow + title + optional lead paragraph. */
function SectionHead({
  eyebrow,
  title,
  lead,
  align = "center",
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: string;
  align?: "center" | "left";
}) {
  return (
    <Reveal className={`abt-head abt-head-${align}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="abt-head-title">{title}</h2>
      {lead && <p className="abt-head-lead">{lead}</p>}
    </Reveal>
  );
}

/** Icon + title + copy card, used by Why Us / Values / Commitment grids. */
function InfoCard({
  icon,
  title,
  copy,
  delay = 0,
}: {
  icon: string;
  title: string;
  copy: string;
  delay?: number;
}) {
  return (
    <Reveal as="article" className="abt-card" delay={delay}>
      <span className="abt-card-icon" aria-hidden="true">
        <i className={icon} />
      </span>
      <h3 className="abt-card-title">{title}</h3>
      <p className="abt-card-copy">{copy}</p>
    </Reveal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Content
// ─────────────────────────────────────────────────────────────────────────────

const stats = [
  { value: "12+", label: "Years in electronics retail" },
  { value: "4.2 Lakh+", label: "Orders delivered" },
  { value: "2.8 Lakh+", label: "Happy customers" },
  { value: "97%", label: "On-time delivery" },
];

const values = [
  {
    icon: "fas fa-box-open",
    title: "Genuine stock, always",
    copy: "Every unit is sourced from the brand or its authorised national distributor. Sealed boxes, valid IMEI, brand warranty registered to your name — never grey-market imports.",
  },
  {
    icon: "fas fa-tag",
    title: "The price you see is the price you pay",
    copy: "No surprise handling fee at checkout, no inflated MRP to fake a discount. Delivery, GST and EMI costs are all shown before you confirm the order.",
  },
  {
    icon: "fas fa-headset",
    title: "Customers, not transactions",
    copy: "Most of our orders come from people who bought before or were told about us. We would rather keep one customer for a decade than win ten one-time sales.",
  },
  {
    icon: "fas fa-rotate-left",
    title: "Easy to undo",
    copy: "Changed your mind? A 15-day return window, a free pickup, and a refund to your original payment method. No restocking charge, no argument.",
  },
];

const expertise = [
  {
    icon: "fas fa-mobile-screen",
    title: "Mobiles & wearables",
    copy: "Flagships, mid-range and budget phones, smartwatches and earbuds from every major brand — with live stock so you never order something we cannot ship.",
  },
  {
    icon: "fas fa-laptop",
    title: "Laptops & computing",
    copy: "Thin-and-lights, creator machines, gaming rigs, monitors and peripherals, with spec guidance from people who actually use them.",
  },
  {
    icon: "fas fa-tv",
    title: "Televisions & audio",
    copy: "4K and QLED panels, soundbars and home theatre. Installation and wall-mounting are arranged with the brand's own engineer.",
  },
  {
    icon: "fas fa-blender",
    title: "Home appliances",
    copy: "Refrigerators, washing machines, air conditioners and kitchen appliances, delivered with demo and first installation included.",
  },
  {
    icon: "fas fa-credit-card",
    title: "Finance & EMI",
    copy: "No-cost EMI on major bank cards, cardless EMI, exchange value for your old device, and GST invoicing for business buyers.",
  },
  {
    icon: "fas fa-truck-fast",
    title: "Delivery & after-sales",
    copy: "Same-day dispatch in metros, tracked shipping nationwide, and a team that stays with you through warranty claims and service centre visits.",
  },
];

const commitments = [
  {
    icon: "fas fa-shield-halved",
    title: "Warranty we stand behind",
    copy: "Full manufacturer warranty on everything, and we handle the paperwork if a claim is ever needed.",
  },
  {
    icon: "fas fa-lock",
    title: "Payments you can trust",
    copy: "Cards, UPI and net banking run through a PCI-DSS compliant gateway. We never see or store your card details.",
  },
  {
    icon: "fas fa-clock-rotate-left",
    title: "Answers within the hour",
    copy: "Support is live 10 AM – 8 PM, seven days a week, and every ticket gets a real reply — not a template.",
  },
  {
    icon: "fas fa-user-shield",
    title: "Your data stays yours",
    copy: "We never sell customer information, and you can delete your account and its history whenever you want.",
  },
];

const team = [
  {
    initials: "PR",
    name: "Product & sourcing",
    role: "Curating the catalogue",
    copy: "Decides what earns a place on the site, negotiates with distributors, and pulls anything that stops meeting our standard.",
  },
  {
    initials: "CX",
    name: "Customer experience",
    role: "Before and after the sale",
    copy: "Answers calls, chats and emails, follows up on every delivery, and chases service centres when a warranty claim stalls.",
  },
  {
    initials: "OP",
    name: "Operations & logistics",
    role: "Getting it to your door",
    copy: "Packs, dispatches and tracks every order, and arranges installation for large appliances and televisions.",
  },
  {
    initials: "EN",
    name: "Engineering",
    role: "Building the storefront",
    copy: "Keeps stock, pricing and offers accurate in real time so the site always tells you the truth.",
  },
];

const milestones = [
  { year: "2014", title: "One counter, one city", copy: "We opened as a single electronics counter with a simple rule — no product goes out unless we would buy it ourselves." },
  { year: "2018", title: "Online, on our own terms", copy: "We built our own storefront instead of renting a stall on a marketplace, so pricing and service stayed in our hands." },
  { year: "2021", title: "Nationwide delivery", copy: "Tracked shipping to every serviceable pin code in India, with same-day dispatch across the metros." },
  { year: "2026", title: "Four lakh orders on", copy: "Six categories, hundreds of brands and a support team that still answers the phone. The rule has not changed." },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="abt-root">
      <noscript>
        <style>{`.abt-reveal{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="abt-hero">
        <div className="abt-shell">
          <Reveal className="abt-hero-copy">
            <Eyebrow>Our story</Eyebrow>
            <h1 className="abt-hero-title">
              We started because buying electronics online{" "}
              <em>stopped feeling honest.</em>
            </h1>
            <p className="abt-hero-lead">
              Inflated MRPs, refurbished units sold as new, warranty cards that
              nobody would honour. AppleNext exists to sell the same products
              everyone else does — with none of that attached.
            </p>
            <div className="abt-hero-actions">
              <Link href="/products" className="abt-btn abt-btn-primary">
                Browse products
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
              <Link href="/faq" className="abt-btn abt-btn-ghost">
                <i className="fas fa-headset" aria-hidden="true" />
                Talk to support
              </Link>
            </div>
          </Reveal>
        </div>

        {/* Stats plate, overlapping the section below like the reference */}
        <div className="abt-shell">
          <Reveal className="abt-stats" delay={120}>
            {stats.map((stat) => (
              <div className="abt-stat" key={stat.label}>
                <span className="abt-stat-value">{stat.value}</span>
                <span className="abt-stat-label">{stat.label}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Company overview ─────────────────────────────────────────────── */}
      <section className="abt-section abt-section-story">
        <div className="abt-shell abt-shell-narrow">
          <Reveal className="abt-head abt-head-left">
            <Eyebrow>The longer version</Eyebrow>
            <h2 className="abt-head-title">
              From a single counter to a storefront that ships nationwide.
            </h2>
          </Reveal>

          <Reveal className="abt-prose" delay={80}>
            <p>
              We opened with one counter, a small shelf of phones, and a promise
              we could keep: if we would not buy it ourselves, we would not sell
              it to you. No box openings behind the counter. No &ldquo;this model
              is out of stock, take this one instead.&rdquo;
            </p>
            <p>
              The first year was quiet. Then people started sending their
              families. A customer who got a genuine replacement panel when three
              other shops quoted a full unit. A student whose laptop needed a
              &#8377;900 part, not a new machine. A small business that got its
              twelve-desk order delivered and invoiced in two days.
            </p>
            <p>
              Today AppleNext handles over four lakh orders across mobiles,
              laptops, televisions, appliances, audio and accessories. The
              catalogue is far bigger. The rule behind it has not moved: every
              order gets the care we would want for our own.
            </p>
            <p>
              We are still independent. Still the team you can reach on a phone
              call. And we still believe the best marketing is an order that
              arrives exactly as described.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Milestones ───────────────────────────────────────────────────── */}
      <section className="abt-section abt-section-alt">
        <div className="abt-shell">
          <SectionHead
            eyebrow="How we got here"
            title="Twelve years, four turning points."
          />
          <ol className="abt-timeline">
            {milestones.map((item, i) => (
              <Reveal as="li" className="abt-tl-item" key={item.year} delay={i * 90}>
                <span className="abt-tl-year">{item.year}</span>
                <div className="abt-tl-body">
                  <h3 className="abt-tl-title">{item.title}</h3>
                  <p className="abt-tl-copy">{item.copy}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Why choose us ────────────────────────────────────────────────── */}
      <section className="abt-section">
        <div className="abt-shell">
          <SectionHead
            eyebrow="What we believe"
            title="Four things that shape every order."
          />
          <div className="abt-grid abt-grid-2">
            {values.map((item, i) => (
              <InfoCard key={item.title} {...item} delay={i * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Mission & vision ─────────────────────────────────────────────── */}
      <section className="abt-section abt-section-alt">
        <div className="abt-shell">
          <SectionHead
            eyebrow="Where we're headed"
            title="Our mission and vision."
          />
          <div className="abt-grid abt-grid-2">
            <Reveal as="article" className="abt-panel">
              <span className="abt-panel-icon" aria-hidden="true">
                <i className="fas fa-bullseye" />
              </span>
              <h3 className="abt-panel-title">Our mission</h3>
              <p className="abt-panel-copy">
                To make buying electronics in India straightforward — honest
                pricing, genuine stock, and a support team that stays reachable
                long after the invoice is paid. Every listing should tell you
                exactly what arrives, and every price should be the one you pay.
              </p>
            </Reveal>
            <Reveal as="article" className="abt-panel" delay={100}>
              <span className="abt-panel-icon" aria-hidden="true">
                <i className="fas fa-eye" />
              </span>
              <h3 className="abt-panel-title">Our vision</h3>
              <p className="abt-panel-copy">
                To become the store people recommend without being asked — where
                a first-time buyer gets the same attention as a bulk order, and
                where trust, not discounting, is the reason customers come back
                for their next device.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Expertise ────────────────────────────────────────────────────── */}
      <section className="abt-section">
        <div className="abt-shell">
          <SectionHead
            eyebrow="What we do"
            title="Six categories, one standard."
            lead="We stock deep rather than wide — enough range to give you a real choice, curated tightly enough that we can vouch for every listing."
          />
          <div className="abt-grid abt-grid-3">
            {expertise.map((item, i) => (
              <InfoCard key={item.title} {...item} delay={i * 70} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Team ─────────────────────────────────────────────────────────── */}
      <section className="abt-section abt-section-alt">
        <div className="abt-shell">
          <SectionHead
            eyebrow="The people behind it"
            title="Small team. No call centre."
            lead="When you contact us, you reach one of these four groups directly — not an outsourced desk reading from a script."
          />
          <div className="abt-grid abt-grid-4">
            {team.map((member, i) => (
              <Reveal as="article" className="abt-member" key={member.name} delay={i * 80}>
                <span className="abt-member-avatar" aria-hidden="true">
                  {member.initials}
                </span>
                <h3 className="abt-member-name">{member.name}</h3>
                <span className="abt-member-role">{member.role}</span>
                <p className="abt-member-copy">{member.copy}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Customer commitment ──────────────────────────────────────────── */}
      <section className="abt-section">
        <div className="abt-shell">
          <SectionHead
            eyebrow="Our commitment"
            title="What you get on every order."
          />
          <div className="abt-grid abt-grid-2">
            {commitments.map((item, i) => (
              <InfoCard key={item.title} {...item} delay={i * 80} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Visit us ─────────────────────────────────────────────────────── */}
      <section className="abt-section abt-section-alt">
        <div className="abt-shell">
          <div className="abt-visit">
            <Reveal className="abt-visit-copy">
              <h2 className="abt-visit-title">
                Drop in.
                <br />
                <em>We&apos;d love to meet you.</em>
              </h2>
              <p className="abt-visit-lead">
                Walk in any time during business hours. Try the device in your
                hands before you decide, ask us anything, and leave with a
                written quote — no appointment needed.
              </p>
              <Link href="/faq" className="abt-btn abt-btn-primary">
                Get in touch
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </Reveal>

            <Reveal as="article" className="abt-visit-card" delay={120}>
              <span className="abt-visit-kicker">Find us</span>
              <h3 className="abt-visit-place">AppleNext Electronics</h3>
              <address className="abt-visit-address">
                D/103, Shubham Heights
                <br />
                Opp. Narayan Garden, New Alkapuri
                <br />
                Vadodara, Gujarat 390023
              </address>

              <div className="abt-visit-divider" />

              <dl className="abt-visit-meta">
                <div>
                  <dt>Open</dt>
                  <dd>Mon–Sat, 10 AM – 8 PM</dd>
                </div>
                <div>
                  <dt>Sunday</dt>
                  <dd>Closed*</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>+91 99985 61006</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>support@applenext.in</dd>
                </div>
              </dl>

              <p className="abt-visit-note">
                *Order support stays available 7 days a week over phone and chat.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="abt-section abt-section-cta">
        <div className="abt-shell">
          <Reveal className="abt-cta">
            <div className="abt-cta-copy">
              <h2 className="abt-cta-title">Not sure which one to buy?</h2>
              <p className="abt-cta-lead">
                Tell us your budget and what you need it for. We&apos;ll shortlist
                two or three options and explain the trade-offs — usually within
                the hour.
              </p>
            </div>
            <div className="abt-cta-actions">
              <Link href="/products" className="abt-btn abt-btn-primary abt-btn-lg">
                Shop all products
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
              <Link href="/offers" className="abt-btn abt-btn-ghost abt-btn-lg">
                <i className="fas fa-bolt" aria-hidden="true" />
                Today&apos;s offers
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="abt-footer">
        <div className="abt-footer-inner">
          <div className="abt-footer-brand">
            <div className="abt-footer-logo">APPLENEXT</div>
            <p>
              Your one-stop destination for the latest electronics, mobile
              phones, laptops and home appliances at the best prices with genuine
              warranty.
            </p>
          </div>
          {[
            {
              title: "Quick Links",
              links: [
                { href: "/", label: "Home" },
                { href: "/about", label: "About Us" },
                { href: "/brands", label: "Brands" },
                { href: "/offers", label: "Offers" },
              ],
            },
            {
              title: "Customer Service",
              links: [
                { href: "/faq", label: "Help Center" },
                { href: "/account", label: "Track Order" },
                { href: "/faq", label: "Return Policy" },
                { href: "/faq", label: "Warranty Info" },
                { href: "/faq", label: "EMI Options" },
              ],
            },
            {
              title: "My Account",
              links: [
                { href: "/login", label: "Login / Register" },
                { href: "/account", label: "My Orders" },
                { href: "/cart", label: "My Cart" },
                { href: "/wishlist", label: "Wishlist" },
                { href: "/search", label: "Search Products" },
              ],
            },
          ].map((col) => (
            <div key={col.title} className="abt-footer-col">
              <h4>{col.title}</h4>
              {col.links.map((l) => (
                <Link key={l.href + l.label} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="abt-footer-bottom">
          <p>&copy; 2026 AppleNext Electronics. All rights reserved.</p>
          <div className="abt-pay-tags">
            <span>Visa</span>
            <span>Mastercard</span>
            <span>UPI</span>
            <span>Net Banking</span>
            <span>EMI</span>
          </div>
        </div>
      </footer>

      {showTop && (
        <button
          type="button"
          className="abt-back-top"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <i className="fas fa-chevron-up" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
