"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useBrands } from "@/lib/hooks/usePublicData";
import { getImageUrl } from "@/lib/api/publicApi";
import { footerGroups, footerSocialIcons } from "@/lib/data/homePageData";
import "./BrandsPage.css";

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function BrandsPage() {
  const { data: brands, loading, error } = useBrands();

  const [search, setSearch] = useState("");
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    document.title = "All Brands | Motabhai Electronics";
  }, []);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const sortedBrands = useMemo(
    () => [...brands].sort((a, b) => a.name.localeCompare(b.name)),
    [brands],
  );

  const filteredBrands = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedBrands;
    return sortedBrands.filter((brand) => brand.name.toLowerCase().includes(q));
  }, [sortedBrands, search]);

  return (
    <div className="brands-page">
      {/* Breadcrumb */}
      <div className="bp-breadcrumb-bar">
        <nav className="bp-breadcrumb">
          <Link href="/">Home</Link>
          <span className="bp-sep">
            <i className="fas fa-chevron-right" />
          </span>
          <span className="bp-current">Brands</span>
        </nav>
      </div>

      {/* Banner */}
      <div className="bp-banner">
        <div className="bp-banner-inner">
          <div>
            <h1 className="bp-banner-title">
              All <span>Brands</span>
            </h1>
            <p className="bp-banner-subtitle">
              Shop genuine products from {brands.length || "your favorite"}+
              trusted brands, all in one place.
            </p>
          </div>
          <div className="bp-banner-stats">
            <div className="bp-banner-stat">
              <div className="bp-stat-num">{brands.length}</div>
              <div className="bp-stat-label">Brands</div>
            </div>
            <div className="bp-banner-stat">
              <div className="bp-stat-num">100%</div>
              <div className="bp-stat-label">Genuine</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bp-section bp-search-section">
        <div className="bp-search-box">
          <i className="fas fa-search" />
          <input
            type="text"
            placeholder="Search brands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="bp-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <i className="fas fa-times" />
            </button>
          )}
        </div>
        <span className="bp-results-count">
          Showing <b>{filteredBrands.length}</b> of <b>{brands.length}</b> brands
        </span>
      </div>

      {/* Grid */}
      <div className="bp-section bp-grid-section">
        {loading ? (
          <div className="bp-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bp-brand-card" style={{ opacity: 0.4 }}>
                <div className="bp-brand-logo" style={{ background: "#f1f5f9" }} />
                <div
                  style={{
                    height: 12,
                    background: "#f1f5f9",
                    borderRadius: 4,
                    width: "70%",
                    margin: "14px auto 0",
                  }}
                />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bp-empty">
            <i className="fas fa-exclamation-circle" />
            <h3>Failed to load brands</h3>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="bp-empty">
            <i className="fas fa-search" />
            <h3>No brands found</h3>
            <p>Try a different search term.</p>
            {search && (
              <button type="button" onClick={() => setSearch("")}>
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="bp-grid">
            {filteredBrands.map((brand) => {
              const image = brand.iconUrl ? getImageUrl(brand.iconUrl) : null;
              return (
                <Link
                  key={brand.id}
                  href={`/category?brandId=${brand.id}`}
                  className="bp-brand-card"
                >
                  <div className={`bp-brand-logo${image ? " has-image" : ""}`}>
                    {image ? (
                      <img src={image} alt={brand.name} />
                    ) : (
                      getInitials(brand.name)
                    )}
                  </div>
                  <h4>{brand.name}</h4>
                  <p>Shop all products</p>
                  <span className="bp-brand-cta">
                    Explore <i className="fas fa-arrow-right" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bp-footer">
        <div className="bp-footer-top">
          <div className="bp-footer-brand">
            <div className="bp-footer-logo">MOTABHAI</div>
            <p>
              Your one-stop destination for the latest electronics, mobile
              phones, laptops, and home appliances at the best prices with
              genuine warranty.
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
                <Link key={link.label} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="bp-footer-bottom">
          <p>© 2026 Motabhai Electronics. All rights reserved.</p>
          <div className="bp-footer-payments">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </footer>

      {/* Back to Top */}
      <button
        className={`bp-back-to-top${showTop ? " visible" : ""}`}
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
      >
        <i className="fas fa-arrow-up" />
      </button>
    </div>
  );
}
