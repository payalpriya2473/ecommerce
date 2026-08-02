"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  publicBrandAPI,
  publicItemAPI,
  getImageUrl,
  type Brand,
  type Item,
} from "@/lib/api/publicApi";
import { footerGroups, footerSocialIcons } from "@/lib/data/homePageData";
import "./BrandsPage.css";

const ALL_BRANDS = "All Brands";
const PAGE_SIZE = 12;

type SortValue = "featured" | "az" | "popular";

// Brands Master doesn't store a colour, so each logo-less brand gets one
// deterministically from its own id — the same brand always lands on the same
// gradient instead of shuffling between renders.
const GRADIENTS = [
  "linear-gradient(135deg, #2f6bff, #5b8cff)",
  "linear-gradient(135deg, #eb2d23, #ff6a5b)",
  "linear-gradient(135deg, #12b886, #4fe3b3)",
  "linear-gradient(135deg, #7c4dff, #a98bff)",
  "linear-gradient(135deg, #0ea5e9, #67d2ff)",
  "linear-gradient(135deg, #ef476f, #ff8fa3)",
  "linear-gradient(135deg, #f59e0b, #ffc85c)",
  "linear-gradient(135deg, #eb2d23, #ffc107)",
];

function gradientFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

interface BrandCardData {
  id: string;
  name: string;
  iconUrl?: string | null;
  category: string;
  productCount: number;
  gradient: string;
}

/** Small pill above a heading — "Brand Spotlight", "Flagship Partner", … */
function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span className={`bp-eyebrow${dark ? " bp-eyebrow-dark" : ""}`}>
      <i className="bp-eyebrow-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(ALL_BRANDS);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("featured");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    document.title = "All Brands | AppleNext Electronics";
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [brandRows, itemsRes] = await Promise.all([
          publicBrandAPI.getAll(),
          publicItemAPI.getAll({ limit: 500, page: 1 }),
        ]);
        if (cancelled) return;
        setBrands(brandRows);
        setItems(itemsRes.items);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load brands");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Product count + most common category come from the real catalogue, since
  // Brands Master itself only stores a name and a logo.
  const brandCards = useMemo<BrandCardData[]>(
    () =>
      brands.map((b) => {
        const ownItems = items.filter(
          (i) => i.brandId != null && String(i.brandId) === String(b.id),
        );
        const tally = new Map<string, number>();
        ownItems.forEach((i) => {
          const cat = i.categoryName?.trim();
          if (!cat) return;
          tally.set(cat, (tally.get(cat) ?? 0) + 1);
        });
        const category = [...tally.entries()].sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? "General";
        return {
          id: String(b.id),
          name: b.name,
          iconUrl: b.iconUrl,
          category,
          productCount: ownItems.length,
          gradient: gradientFor(String(b.id)),
        };
      }),
    [brands, items],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    brandCards.forEach((b) => {
      if (b.productCount > 0) set.add(b.category);
    });
    return [ALL_BRANDS, ...Array.from(set).sort()];
  }, [brandCards]);

  const filteredBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = brandCards.filter((b) => {
      const matchesCategory = activeCategory === ALL_BRANDS || b.category === activeCategory;
      const matchesQuery = !q || b.name.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
    if (sortBy === "az") return [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "popular")
      return [...result].sort(
        (a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name),
      );
    // featured: brands with a logo and more products surface first
    return [...result].sort((a, b) => {
      const logoScore = Number(!!b.iconUrl) - Number(!!a.iconUrl);
      if (logoScore !== 0) return logoScore;
      if (b.productCount !== a.productCount) return b.productCount - a.productCount;
      return a.name.localeCompare(b.name);
    });
  }, [brandCards, activeCategory, query, sortBy]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory, query, sortBy]);

  const visibleBrands = filteredBrands.slice(0, visibleCount);

  const featured = useMemo(() => {
    if (!brandCards.length) return null;
    return [...brandCards].sort((a, b) => b.productCount - a.productCount)[0];
  }, [brandCards]);

  return (
    <div className="bp-root">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="bp-hero">
        <div className="bp-hero-inner">
          <Eyebrow dark>{brands.length || "All"}+ authorised brands</Eyebrow>
          <h1 className="bp-hero-title">
            Every brand you trust, <span>under one roof</span>
          </h1>
          <p className="bp-hero-sub">
            We partner directly with the world&apos;s leading electronics
            manufacturers, so every product you buy from AppleNext is genuine,
            warrantied and fairly priced.
          </p>

          <div className="bp-hero-search">
            <i className="fas fa-search" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brands — e.g. Apple, Samsung, Sony..."
              aria-label="Search brands"
            />
            {query && (
              <button
                type="button"
                className="bp-hero-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="bp-hero-search-btn"
              onClick={() => setVisibleCount(PAGE_SIZE)}
            >
              Search
            </button>
          </div>
        </div>
      </section>

      {/* ── Category filter bar (overlaps the hero) ──────────────────────── */}
      {categories.length > 1 && (
        <div className="bp-filter-bar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`bp-filter-pill${activeCategory === cat ? " is-active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* ── Directory ────────────────────────────────────────────────────── */}
      <section className={`bp-directory${categories.length > 1 ? "" : " bp-directory-flush"}`}>
        <div className="bp-directory-head">
          <p className="bp-count">
            {loading ? (
              "Loading brands…"
            ) : (
              <>
                <strong>{filteredBrands.length}</strong> brand
                {filteredBrands.length === 1 ? "" : "s"} shown of {brandCards.length}
              </>
            )}
          </p>
          <label className="bp-sort">
            <span className="bp-sr-only">Sort brands</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortValue)}>
              <option value="featured">Sort: Featured</option>
              <option value="az">Sort: A–Z</option>
              <option value="popular">Sort: Most Popular</option>
            </select>
            <i className="fas fa-chevron-down" aria-hidden="true" />
          </label>
        </div>

        {loading ? (
          <div className="bp-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="bp-card bp-card-skeleton" key={i} aria-hidden="true">
                <span className="bp-skel bp-skel-logo" />
                <span className="bp-skel bp-skel-line" />
                <span className="bp-skel bp-skel-line bp-skel-short" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bp-empty">
            <i className="fas fa-triangle-exclamation" aria-hidden="true" />
            <h3>Couldn&apos;t load brands</h3>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="bp-empty">
            <i className="fas fa-magnifying-glass" aria-hidden="true" />
            <h3>No brands match your search</h3>
            <p>Try a different category or keyword.</p>
            {(query || activeCategory !== ALL_BRANDS) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveCategory(ALL_BRANDS);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="bp-grid">
            {visibleBrands.map((b) => (
              <article className="bp-card" key={b.id}>
                {b.iconUrl ? (
                  <span className="bp-card-logo has-image">
                    <img src={getImageUrl(b.iconUrl)} alt={b.name} loading="lazy" />
                  </span>
                ) : (
                  <span className="bp-card-logo" style={{ background: b.gradient }}>
                    {initialsFor(b.name)}
                  </span>
                )}
                <h3 className="bp-card-name">{b.name}</h3>
                <span className="bp-card-category">{b.category}</span>
                <p className="bp-card-copy">
                  Genuine {b.name} products, official warranty and after-sales
                  support from AppleNext.
                </p>
                <div className="bp-card-foot">
                  <span className="bp-card-count">
                    {b.productCount} product{b.productCount === 1 ? "" : "s"}
                  </span>
                  <Link href={`/products?brandId=${b.id}`} className="bp-card-shop">
                    Shop
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        {visibleCount < filteredBrands.length && (
          <div className="bp-more">
            <button type="button" onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
              Load more brands
            </button>
          </div>
        )}
      </section>

      {/* ── Featured spotlight ───────────────────────────────────────────── */}
      {featured && featured.productCount > 0 && (
        <section className="bp-spotlight">
          <div className="bp-spotlight-head">
            <Eyebrow>Brand spotlight</Eyebrow>
            <h2>Featured partner of the month</h2>
          </div>

          <div className="bp-spotlight-card">
            <span className="bp-spotlight-glow" aria-hidden="true" />
            <div className="bp-spotlight-copy">
              <Eyebrow dark>Flagship partner</Eyebrow>
              <h3>{featured.name} — genuine gear, backed by AppleNext</h3>
              <p>
                From everyday essentials to the latest releases, {featured.name}{" "}
                is one of our most stocked partners. AppleNext is an authorised{" "}
                {featured.name} reseller with full warranty support in store.
              </p>
              <dl className="bp-spotlight-stats">
                {[
                  [String(featured.productCount), "Products"],
                  [featured.category, "Category"],
                  ["Genuine", "Guarantee"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt>{value}</dt>
                    <dd>{label}</dd>
                  </div>
                ))}
              </dl>
              <Link href={`/products?brandId=${featured.id}`} className="bp-spotlight-cta">
                Shop {featured.name}
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </Link>
            </div>
            <div className="bp-spotlight-visual">
              <span className="bp-spotlight-plate">
                {featured.iconUrl ? (
                  <img src={getImageUrl(featured.iconUrl)} alt={featured.name} />
                ) : (
                  <b>{initialsFor(featured.name)}</b>
                )}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bp-footer">
        <div className="bp-footer-top">
          <div className="bp-footer-brand">
            <div className="bp-footer-logo">APPLENEXT</div>
            <p>
              Your trusted destination for genuine, next-generation electronics —
              mobiles, laptops, TVs and smart appliances, backed by real support.
            </p>
            <div className="bp-footer-social">
              {footerSocialIcons.map((icon) => (
                <a key={icon} href="#" aria-label={icon}>
                  <i className={`fab ${icon}`} />
                </a>
              ))}
            </div>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title} className="bp-footer-col">
              <h4>{group.title}</h4>
              {group.links.map((link) => (
                <Link key={link.label + link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="bp-footer-bottom">
          <p>&copy; 2026 AppleNext Electronics. All rights reserved.</p>
          <div className="bp-footer-payments">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
