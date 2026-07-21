"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ProductCard,
  ProductCardData,
  ProductCardSkeleton,
} from "@/components/atoms/ProductCard";
import { SectionHeader } from "@/components/molecules/SectionHeader";
import {
  useCategories,
  useBrands,
  useItems,
  useCountdown,
} from "@/lib/hooks/usePublicData";
import {
  Category,
  getCategoryUrl,
  getImageUrl,
  Item,
  slugifyCategoryName,
  publicOfferAPI,
} from "@/lib/api/publicApi";
import { cartItemFromItem, useCart } from "@/lib/cart/cart-context";
import {
  useWishlist,
  wishlistItemFromItem,
} from "@/lib/wishlist/wishlist-context";
import { buildProductDetailUrlForItem } from "@/lib/product/variant-utils";
import {
  announcementItems,
  bannerCards,
  dealFeatures,
  features,
  footerGroups,
  footerSocialIcons,
  headerActions,
  heroSlides,
  navLinks,
  newsletterContent,
  pageCopy,
  rightPromoCards,
  sections,
} from "@/lib/data/homePageData";
import "./HomePage.css";

// Fallback icon mapping for categories
const CAT_ICON_MAP: Record<string, string> = {
  mobile: "fa-mobile-screen-button",
  phone: "fa-mobile-screen-button",
  laptop: "fa-laptop",
  computer: "fa-laptop",
  tv: "fa-tv",
  television: "fa-tv",
  audio: "fa-headphones",
  headphone: "fa-headphones",
  speaker: "fa-volume-high",
  camera: "fa-camera",
  watch: "fa-clock",
  gaming: "fa-gamepad",
  appliance: "fa-blender",
  ac: "fa-snowflake",
  refrigerator: "fa-box-open",
  washing: "fa-shirt",
  accessory: "fa-plug",
};

const CAT_COLORS = [
  "ci-red",
  "ci-blue",
  "ci-purple",
  "ci-orange",
  "ci-green",
  "ci-pink",
  "ci-indigo",
  "ci-cyan",
  "ci-teal",
  "ci-amber",
  "ci-slate",
  "ci-rose",
];

function getCatIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(CAT_ICON_MAP)) {
    if (lower.includes(key)) return icon;
  }
  return "fa-tag";
}

function getCategoryLinkByLabel(categories: Category[], label: string): string {
  const normalizedLabel = slugifyCategoryName(label);
  const keywordMap: Record<string, string[]> = {
    mobiles: ["mobile", "phone", "smartphone"],
    tvs: ["tv", "television"],
    laptops: ["laptop", "pc", "computer"],
    appliances: [
      "appliance",
      "refrigerator",
      "washing-machine",
      "air-conditioner",
      "ac",
    ],
  };

  const keywords = keywordMap[normalizedLabel] ?? [normalizedLabel];
  const matched = categories.find((category) => {
    const slug = slugifyCategoryName(category.slug || category.name);
    return keywords.some(
      (keyword) => slug.includes(keyword) || keyword.includes(slug),
    );
  });

  return matched ? getCategoryUrl(matched) : "/products";
}

function itemToCard(
  item: Item,
  badge: string,
  badgeType: string,
): ProductCardData & { itemId: string | number; rawItem: Item } {
  return {
    badge,
    badgeType,
    image: getImageUrl(item.primaryImage, "..."),
    brand: item.brandName ?? "",
    name: item.itemName,
    stars: 4,
    halfStar: true,
    reviews: "(In Stock)",
    current: item.offerPrice
      ? `Rs ${item.offerPrice.toLocaleString("en-IN")}`
      : "Price on request",
    original:
      item.nlc && item.nlc > (item.offerPrice ?? 0)
        ? `Rs ${item.nlc.toLocaleString("en-IN")}`
        : undefined,
    save: item.margin ? `${Math.round(item.margin)}% off` : undefined,
    href: buildProductDetailUrlForItem(item, item.primaryImage ?? null),
    itemId: item.id,
    rawItem: item,
  };
}

export default function HomePage() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<
    (ProductCardData & { itemId?: string | number; rawItem?: Item }) | null
  >(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [bankPromo, setBankPromo] = useState<typeof rightPromoCards[number] | null>(null);
  const autoRotateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const timer = useCountdown();
  const { addItem, totalQuantity } = useCart();
  const { itemCount: wishlistCount, hasItem, toggleItem } = useWishlist();

  // ── Live API data ──────────────────────────────────────────────────────────
  const {
    data: liveCategories,
    loading: catsLoading,
    error: catsError,
  } = useCategories({ showOnWebsite: true });
  const {
    data: liveBrands,
    loading: brandsLoading,
    error: brandsError,
  } = useBrands();
  const {
    data: liveProducts,
    loading: productsLoading,
    error: productsError,
  } = useItems({ limit: 12 });

  // ── Dynamic bank offer for the right-side promo card ────────────────────────
  useEffect(() => {
    publicOfferAPI.getBySection("bank_offer").then((rows) => {
      const top = rows[0];
      if (!top) return;
      setBankPromo({
        badge: "BANK OFFER",
        title: [top.offerText, top.offerSub, top.bankName ? `with ${top.bankName}` : ""].filter(Boolean).join(" "),
        subtitle: top.description || top.bankName || "",
        linkText: "Grab Now",
        linkIcon: "fa-arrow-right",
        variant: "red",
      });
    }).catch(() => {});
  }, []);

  // Replace the static BANK OFFER card with the admin-managed one when available
  const promoCards = rightPromoCards.map((card) =>
    card.variant === "red" && bankPromo ? bankPromo : card
  );

  const flashItems = liveProducts.slice(0, 5).map((item, i) => {
    const badges = ["HOT", "-35%", "NEW", "-40%", "BEST"];
    const types = ["hot", "sale", "new", "sale", "best"];
    return itemToCard(item, badges[i] ?? "", types[i] ?? "new");
  });

  const trendItems = liveProducts.slice(5, 10).map((item, i) => {
    const badges = ["HOT", "-25%", "NEW", "BEST", "-30%"];
    const types = ["hot", "sale", "new", "best", "sale"];
    return itemToCard(item, badges[i] ?? "", types[i] ?? "new");
  });

  const sidebarItems = liveCategories.slice(0, 9).map((cat) => ({
    id: cat.id,
    icon: getCatIcon(cat.name),
    title: cat.name,
    href: getCategoryUrl(cat),
  }));

  const categoryCards = liveCategories.map((cat, i) => ({
    id: cat.id,
    title: cat.name,
    subtitle: cat.description || "Shop now",
    icon: getCatIcon(cat.name),
    colorClass: CAT_COLORS[i % CAT_COLORS.length],
    href: getCategoryUrl(cat),
    image: cat.categoryImage ? getImageUrl(cat.categoryImage) : null,
  }));

  const navItems = navLinks.map((item) => ({
    ...item,
    href: ["Mobiles", "TVs", "Laptops", "Appliances"].includes(item.label)
      ? getCategoryLinkByLabel(liveCategories, item.label)
      : item.href === "/category"
        ? "/products"
        : item.href,
  }));

  const brandCards = liveBrands.slice(0, 16).map((brand) => ({
    id: brand.id,
    label: brand.name.slice(0, 2).toUpperCase(),
    name: brand.name,
    description: "Shop all products",
    logoClass: brand.name.toLowerCase().replace(/\s+/g, "-"),
    image: brand.iconUrl ? getImageUrl(brand.iconUrl) : null,
    href: `/category?brandId=${brand.id}`,
  }));

  // Deal of the day: first live product or static
  const dealProduct = liveProducts[0];

  // ── Slider effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (sliderTrackRef.current) {
      sliderTrackRef.current.style.setProperty(
        "--slider-translate",
        `translateX(-${slideIndex * 100}%)`,
      );
    }
  }, [slideIndex]);

  useEffect(() => {
    autoRotateRef.current = setInterval(
      () => setSlideIndex((c) => (c + 1) % heroSlides.length),
      5000,
    );
    return () => {
      if (autoRotateRef.current) clearInterval(autoRotateRef.current);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 50);
      setShowTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const items = Array.from(document.querySelectorAll(".animate-on-scroll"));
    if (!items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -50px 0px" },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!quickViewProduct) {
      document.body.style.removeProperty("overflow");
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickViewProduct(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.removeProperty("overflow");
      window.removeEventListener("keydown", onKey);
    };
  }, [quickViewProduct]);

  function resetAutoRotation() {
    if (autoRotateRef.current) clearInterval(autoRotateRef.current);
    autoRotateRef.current = setInterval(
      () => setSlideIndex((c) => (c + 1) % heroSlides.length),
      5000,
    );
  }

  function goToSlide(index: number) {
    setSlideIndex((index + heroSlides.length) % heroSlides.length);
    resetAutoRotation();
  }

  // Duplicate items for seamless marquee loop
  const catDuplicated = [...categoryCards, ...categoryCards];
  const flashDuplicated = [...flashItems, ...flashItems];
  const trendDuplicated = [...trendItems, ...trendItems];
  const brandDuplicated = [...brandCards, ...brandCards];
  return (
    <>
      {/* Hero */}
      <section className="hero-section">
        <div className="hero-sidebar">
          <div className="sidebar-title">
            <i className="fas fa-th-large" /> Browse Categories
          </div>
          <nav className="sidebar-nav">
            {sidebarItems.length > 0 ? (
              sidebarItems.map((cat) => (
                <Link key={`${cat.id}-${cat.title}`} href={cat.href}>
                  <i className={`fas ${cat.icon} s-icon`} />
                  <span>{cat.title}</span>
                  <i className="fas fa-chevron-right arrow" />
                </Link>
              ))
            ) : (
              <div className="sidebar-empty">
                {catsLoading
                  ? "Loading categories..."
                  : catsError || "No categories found"}
              </div>
            )}
          </nav>
        </div>

        <div className="hero-slider">
          <div ref={sliderTrackRef} className="slider-track">
            {heroSlides.map((slide) => (
              <div key={slide.label} className="slide">
                <div className={`slide-bg ${slide.bgClass}`} />
                <div className="slide-content">
                  <div className="slide-text">
                    <div className="slide-label">
                      <i className={`fas ${slide.labelIcon}`} /> {slide.label}
                    </div>
                    <h2 className="slide-title">
                      {slide.title}
                      <br />
                      <span>{slide.subtitle}</span>
                    </h2>
                    <p className="slide-desc">{slide.description}</p>
                    <div className="slide-price">
                      <span className="sp-current">{slide.price}</span>
                      {slide.original && (
                        <span className="sp-original">{slide.original}</span>
                      )}
                      <span className="sp-badge">{slide.badge}</span>
                    </div>
                    <Link href="/products" className="slide-cta">
                      {slide.cta} <i className="fas fa-arrow-right" />
                    </Link>
                  </div>
                  <div className="slide-visual">
                    <img src={slide.image} alt={slide.title} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="slider-dots">
            {heroSlides.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`slider-dot${slideIndex === i ? " active" : ""}`}
                onClick={() => goToSlide(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="slider-arrow prev"
            onClick={() => goToSlide(slideIndex - 1)}
            aria-label="Previous"
          >
            <i className="fas fa-chevron-left" />
          </button>
          <button
            type="button"
            className="slider-arrow next"
            onClick={() => goToSlide(slideIndex + 1)}
            aria-label="Next"
          >
            <i className="fas fa-chevron-right" />
          </button>
        </div>

        <div className="hero-right">
          {promoCards.map((promo) => (
            <div
              key={promo.title}
              className={`promo-card promo-${promo.variant}`}
            >
              <div className="promo-badge">{promo.badge}</div>
              <h3>{promo.title}</h3>
              <p>{promo.subtitle}</p>
              <span className="promo-link">
                {promo.linkText} <i className={`fas ${promo.linkIcon}`} />
              </span>
              <span className="promo-icon">
                <i
                  className={
                    promo.variant === "red"
                      ? "fas fa-credit-card"
                      : "fas fa-arrows-rotate"
                  }
                />
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Features Strip */}
      <div className="features-strip animate-on-scroll">
        {features.map((f) => (
          <div key={f.title} className="feature-item">
            <div className={`feat-icon ${f.colorClass}`}>
              <i className={`fas ${f.icon}`} />
            </div>
            <div>
              <h4>{f.title}</h4>
              <p>{f.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Shop by Category — AUTO-SCROLLING MARQUEE */}
      <section className="section animate-on-scroll">
        <SectionHeader
          iconClass={sections.category.icon}
          iconColorClass={sections.category.iconColorClass}
          title={sections.category.title}
          subtitle={
            catsLoading
              ? "Loading categories..."
              : catsError || sections.category.subtitle
          }
          actionText={sections.category.actionText}
          actionHref="/products"
        />

        {catsLoading ? (
          <div className="cat-marquee-wrapper">
            <div className="cat-marquee-track">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="cat-card" style={{ opacity: 0.4 }}>
                  <div
                    className="cat-icon ci-blue"
                    style={{ background: "#f1f5f9" }}
                  />
                  <div
                    style={{
                      height: 12,
                      background: "#f1f5f9",
                      borderRadius: 4,
                      width: 80,
                      margin: "0 auto",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : categoryCards.length > 0 ? (
          <div className="cat-marquee-wrapper">
            <div className="cat-marquee-track">
              {catDuplicated.map((cat, idx) => (
                <Link
                  key={`${cat.id}-${idx}`}
                  href={cat.href}
                  className="cat-card"
                >
                  {cat.image ? (
                    <div className={`cat-icon ${cat.colorClass}`}>
                      <img
                        src={cat.image}
                        alt={cat.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "inherit",
                        }}
                      />
                    </div>
                  ) : (
                    <div className={`cat-icon ${cat.colorClass}`}>
                      <i className={`fas ${cat.icon}`} />
                    </div>
                  )}
                  <h4>{cat.title}</h4>
                  <p>{cat.subtitle}</p>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="section-empty">
            {catsError || "No categories found"}
          </div>
        )}
      </section>

      {/* Flash Deals — AUTO-SCROLLING MARQUEE */}
      <div className="flash-bg">
        <section className="section flash-section animate-on-scroll">
          <div className="section-header flash-header">
            <div className="section-header-left">
              <div className="section-icon si-orange">
                <i className="fas fa-bolt" />
              </div>
              <div>
                <h2 className="section-title">{sections.flash.title}</h2>
                <p className="section-subtitle">{sections.flash.subtitle}</p>
              </div>
            </div>
            <div className="flash-header-actions">
              <div className="timer-row">
                <span className="timer-block">{timer.h}</span>
                <span className="timer-sep">:</span>
                <span className="timer-block">{timer.m}</span>
                <span className="timer-sep">:</span>
                <span className="timer-block">{timer.s}</span>
              </div>
              <Link href="/products" className="view-all">
                {pageCopy.viewAll} <i className="fas fa-arrow-right" />
              </Link>
            </div>
          </div>

          {productsLoading ? (
            <div className="products-marquee-wrapper">
              <div className="products-marquee-track">
                {Array.from({ length: 5 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            </div>
          ) : flashItems.length > 0 ? (
            <div className="products-marquee-wrapper">
              <div className="products-marquee-track">
                {flashDuplicated.map((p, index) => (
                  <ProductCard
                    key={`${p.name}-${index}`}
                    product={p}
                    addToCartLabel={pageCopy.addToCart}
                    buyLabel={pageCopy.buyNow}
                    isWishlisted={hasItem(p.itemId)}
                    onToggleWishlist={() =>
                      toggleItem(wishlistItemFromItem(p.rawItem))
                    }
                    onQuickView={(product) =>
                      setQuickViewProduct(product ?? null)
                    }
                    onAddToCart={() => addItem(cartItemFromItem(p.rawItem))}
                    onBuyNow={() => {
                      addItem(cartItemFromItem(p.rawItem));
                      window.location.href = "/cart";
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="section-empty">
              {productsError || "No products found"}
            </div>
          )}
        </section>
      </div>

      {/* Banner Cards */}
      <section className="section animate-on-scroll">
        <div className="banner-grid">
          {bannerCards.map((banner) => (
            <div
              key={banner.title}
              className={`banner-card ${banner.gradientClass}`}
            >
              <span className="badge-sm">{banner.badge}</span>
              <h3>{banner.title}</h3>
              <p>{banner.subtitle}</p>
              <Link href="/products" className="banner-link">
                {banner.ctaText} <i className="fas fa-arrow-right" />
              </Link>
              <span className="banner-emoji">{banner.emoji}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Trending Now — AUTO-SCROLLING MARQUEE */}
      <section className="section animate-on-scroll">
        <SectionHeader
          iconClass={sections.trending.icon}
          iconColorClass={sections.trending.iconColorClass}
          title={sections.trending.title}
          subtitle={
            productsLoading
              ? "Loading products..."
              : productsError || sections.trending.subtitle
          }
          actionText={sections.trending.actionText}
          actionHref="/products"
        />

        {productsLoading ? (
          <div className="products-marquee-wrapper">
            <div className="products-marquee-track">
              {Array.from({ length: 5 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : trendItems.length > 0 ? (
          <div className="products-marquee-wrapper">
            <div className="products-marquee-track">
              {trendDuplicated.map((p, index) => (
                <ProductCard
                  key={`${p.name}-${index}`}
                  product={p}
                  addToCartLabel={pageCopy.addToCart}
                  buyLabel={pageCopy.buyNow}
                  isWishlisted={hasItem(p.itemId)}
                  onToggleWishlist={() =>
                    toggleItem(wishlistItemFromItem(p.rawItem))
                  }
                  onQuickView={(product) =>
                    setQuickViewProduct(product ?? null)
                  }
                  onAddToCart={() => addItem(cartItemFromItem(p.rawItem))}
                  onBuyNow={() => {
                    addItem(cartItemFromItem(p.rawItem));
                    window.location.href = "/cart";
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="section-empty">
            {productsError || "No products found"}
          </div>
        )}
      </section>

      {/* Deal of the Day — LIVE API */}
      <section className="section animate-on-scroll">
        <div className="deal-wrap">
          <div className="deal-left">
            <div className="deal-badge">
              <i className="fas fa-clock" /> Deal of the Day
            </div>
            <h2 className="deal-title">
              {dealProduct?.brandName ?? "Samsung"}
              <br />
              <span>
                {dealProduct?.itemName
                  ? dealProduct.itemName.slice(0, 25)
                  : "Galaxy Z Fold 6 5G"}
              </span>
            </h2>
            <p className="deal-desc">
              Exclusive daily deal with unbeatable pricing. Limited stock — grab
              it before it&apos;s gone! Genuine product with full warranty and
              fast delivery across India.
            </p>
            <div className="deal-price-row">
              <span className="deal-current">
                {dealProduct?.offerPrice
                  ? `Rs ${dealProduct.offerPrice.toLocaleString("en-IN")}`
                  : "Rs 1,24,999"}
              </span>
              {dealProduct?.nlc && (
                <span className="deal-original">
                  Rs {dealProduct.nlc.toLocaleString("en-IN")}
                </span>
              )}
              {dealProduct?.margin && (
                <span className="deal-save-badge">
                  Save {Math.round(dealProduct.margin)}%
                </span>
              )}
            </div>
            <div className="deal-features">
              {dealFeatures.map((f) => (
                <span key={f} className="deal-feature">
                  <i className="fas fa-check" /> {f}
                </span>
              ))}
            </div>
            <div className="deal-cta-row">
              <Link
                href={
                  dealProduct
                    ? buildProductDetailUrlForItem(
                        dealProduct,
                        dealProduct.primaryImage ?? null,
                      )
                    : "/product"
                }
                className="deal-cta"
              >
                <i className="fas fa-bolt" /> {pageCopy.dealPrimary}
              </Link>
              <Link href="/products" className="deal-cta-outline">
                <i className="fas fa-cart-plus" /> {pageCopy.dealSecondary}
              </Link>
            </div>
          </div>
          <div className="deal-right">
            <div className="deal-glow" />
            <img
              src={getImageUrl(
                dealProduct?.primaryImage,
                "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=500&q=85",
              )}
              alt="Deal of the Day"
            />
          </div>
        </div>
      </section>

      {/* Top Brands */}
      <section className="section animate-on-scroll">
        <SectionHeader
          iconClass={sections.brands.icon}
          iconColorClass={sections.brands.iconColorClass}
          title={sections.brands.title}
          subtitle={
            brandsLoading
              ? "Loading brands..."
              : brandsError || sections.brands.subtitle
          }
          actionText={sections.brands.actionText}
          actionHref="/brands"
        />

        {brandsLoading ? (
          <div className="brands-marquee-wrapper">
            <div className="brands-marquee-track">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="brand-card" style={{ opacity: 0.4 }}>
                  <div
                    className="brand-logo"
                    style={{ background: "#f1f5f9" }}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : brandCards.length > 0 ? (
          <div className="brands-marquee-wrapper">
            <div className="brands-marquee-track">
              {brandDuplicated.map((brand, index) => (
                <a
                  key={`${brand.id}-${index}`}
                  href={brand.href}
                  className="brand-card"
                >
                  <div
                    className={`brand-logo ${brand.logoClass}${brand.image ? " has-image" : ""}`}
                  >
                    {brand.image ? (
                      <img src={brand.image} alt={brand.name} />
                    ) : (
                      brand.label
                    )}
                  </div>
                  <h4>{brand.name}</h4>
                  <p>{brand.description}</p>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="section-empty">
            {brandsError || "No brands found"}
          </div>
        )}
      </section>

      {/* Newsletter */}
      <section className="section animate-on-scroll">
        <div className="newsletter">
          <div className="newsletter-copy">
            <h3>{newsletterContent.title}</h3>
            <p>{newsletterContent.subtitle}</p>
          </div>
          <div className="newsletter-form">
            <input type="email" placeholder={newsletterContent.placeholder} />
            <button type="button">{newsletterContent.buttonLabel}</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-top">
          <div>
            <div className="footer-logo">MOTABHAI</div>
            <p className="footer-desc">
              Your one-stop destination for the latest electronics, mobile
              phones, laptops, and home appliances at the best prices with
              genuine warranty.
            </p>
            <div className="footer-social">
              {footerSocialIcons.map((icon) => (
                <a key={icon} href="#" aria-label={icon}>
                  <i className={`fab ${icon}`} />
                </a>
              ))}
            </div>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title} className="footer-col">
              <h4>{group.title}</h4>
              {group.links.map((link) => (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <p>{pageCopy.footerCopyright}</p>
          <div className="footer-payments">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </footer>

      {/* Back to Top */}
      <button
        className={`btt${showTop ? " visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        type="button"
        aria-label="Back to top"
      >
        <i className="fas fa-arrow-up" />
      </button>

      {/* Quick View Modal */}
      {quickViewProduct && (
        <div
          className="quick-view-backdrop"
          onClick={() => setQuickViewProduct(null)}
          role="presentation"
        >
          <div
            className="quick-view-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qv-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="quick-view-close"
              type="button"
              onClick={() => setQuickViewProduct(null)}
              aria-label="Close"
            >
              <i className="fas fa-times" />
            </button>
            <div className="quick-view-media">
              <img
                src={quickViewProduct.image}
                alt={quickViewProduct.name}
                className="quick-view-image"
              />
            </div>
            <div className="quick-view-content">
              <div className="quick-view-brand">{quickViewProduct.brand}</div>
              <h3 id="qv-title" className="quick-view-title">
                {quickViewProduct.name}
              </h3>
              <div className="quick-view-price-row">
                <span className="quick-view-current">
                  {quickViewProduct.current}
                </span>
                {quickViewProduct.original && (
                  <span className="quick-view-original">
                    {quickViewProduct.original}
                  </span>
                )}
                {quickViewProduct.save && (
                  <span className="quick-view-save">
                    {quickViewProduct.save}
                  </span>
                )}
              </div>
              <div className="quick-view-note">
                Genuine product with manufacturer warranty. Fast delivery
                available across India. No-cost EMI on major credit cards.
              </div>
              <button
                className="quick-view-cart-btn"
                type="button"
                onClick={() => {
                  if (!quickViewProduct?.rawItem) return;
                  addItem(cartItemFromItem(quickViewProduct.rawItem));
                }}
              >
                <i className="fas fa-cart-plus" />
                <span>{pageCopy.addToCart}</span>
              </button>
              <Link
                href={
                  quickViewProduct.href ??
                  `/product?id=${quickViewProduct.itemId ?? ""}`
                }
                className="quick-view-details-btn"
              >
                <i className="fas fa-arrow-right" />
                <span>View Full Details</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
