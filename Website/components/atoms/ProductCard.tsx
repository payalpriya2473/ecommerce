"use client";

import Link from "next/link";
import { useState } from "react";
import { getImageUrl, Item } from "@/lib/api/publicApi";
import { buildProductDetailUrlForItem } from "@/lib/product/variant-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Legacy static-data shape (kept for homepage hero/flash sections) */
export type StaticProductCardData = {
  badge: string;
  badgeType: string;
  image: string;
  brand: string;
  name: string;
  stars: number;
  halfStar?: boolean;
  reviews: string;
  current: string;
  original?: string;
  save?: string;
  href?: string;
};

/** API-driven product card shape */
export type ApiProductCardData = {
  id: string | number;
  itemName: string;
  brandName?: string;
  offerPrice?: number;
  nlc?: number;
  primaryImage?: string | null;
  categoryName?: string;
  variant?: string | null;
  badge?: string;
  badgeType?: string;
};

export type ProductCardData = StaticProductCardData;

type ProductCardProps =
  | { mode?: "static"; product: StaticProductCardData; id?: never }
  | { mode: "api"; product: ApiProductCardData; id?: string };

// ─── Star Rating ─────────────────────────────────────────────────────────────

export function StarRating({
  stars,
  halfStar,
}: {
  stars: number;
  halfStar?: boolean;
}) {
  const full = Array.from({ length: Math.floor(stars) });
  const empty = Array.from({ length: 5 - Math.floor(stars) - (halfStar ? 1 : 0) });
  return (
    <span className="stars">
      {full.map((_, i) => <i key={`f-${i}`} className="fas fa-star" />)}
      {halfStar && <i className="fas fa-star-half-alt" />}
      {empty.map((_, i) => <i key={`e-${i}`} className="far fa-star" />)}
    </span>
  );
}

// ─── Format price ─────────────────────────────────────────────────────────────

function fmtPrice(n?: number): string {
  if (!n && n !== 0) return "";
  return `Rs ${n.toLocaleString("en-IN")}`;
}

const BADGE_COLORS: Record<string, string> = {
  sale: "badge-sale",
  new: "badge-new",
  hot: "badge-hot",
  best: "badge-best",
  premium: "badge-premium",
};

// ─── ProductCard ─────────────────────────────────────────────────────────────

export function ProductCard(
  props: ProductCardProps & {
    href?: string;
    addToCartLabel?: string;
    buyLabel?: string;
    onQuickView?: (product?: StaticProductCardData) => void;
    onAddToCart?: () => void;
    onBuyNow?: () => void;
    isWishlisted?: boolean;
    onToggleWishlist?: () => void;
  }
) {
  const [localWishlisted, setLocalWishlisted] = useState(false);
  const {
    addToCartLabel = "Add to Cart",
    buyLabel = "Buy",
    onQuickView,
    onAddToCart,
    onBuyNow,
    isWishlisted,
    onToggleWishlist,
  } = props;
  const wishlisted = onToggleWishlist ? Boolean(isWishlisted) : localWishlisted;
  const handleToggleWishlist = () => {
    if (onToggleWishlist) {
      onToggleWishlist();
      return;
    }
    setLocalWishlisted((value) => !value);
  };

  if (props.mode !== "api") {
    const p = props.product;
    const href = props.href ?? p.href ?? "/product";
    return (
      <div className="product-card">
        <div className="product-badge">
          <span className={`badge-tag ${BADGE_COLORS[p.badgeType] ?? ""}`}>
            {p.badge}
          </span>
        </div>
        <button
          className={`product-wishlist${wishlisted ? " active" : ""}`}
          onClick={handleToggleWishlist}
          type="button"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <i className={wishlisted ? "fas fa-heart" : "far fa-heart"} />
        </button>
        <div className="product-image">
          <Link href={href} className="product-image-link">
            <img src={p.image} alt={p.name} loading="lazy" />
          </Link>
          <div className="product-image-overlay">
            <button
              className="overlay-btn"
              type="button"
              aria-label="Quick view"
              onClick={() => onQuickView?.(p)}
            >
              <i className="fas fa-eye" />
            </button>
            <button className="overlay-btn" type="button" aria-label="Compare">
              <i className="fas fa-shuffle" />
            </button>
          </div>
        </div>
        <div className="product-info">
          <div className="product-brand">{p.brand}</div>
          <h3 className="product-name"><Link href={href}>{p.name}</Link></h3>
          <div className="product-rating">
            <StarRating stars={p.stars} halfStar={p.halfStar} />
            <span className="rating-count">{p.reviews}</span>
          </div>
          <div className="product-price">
            <span className="price-current">{p.current}</span>
            {p.original && <span className="price-original">{p.original}</span>}
            {p.save && <span className="price-save">{p.save}</span>}
          </div>
          <div className="product-actions">
            <button className="btn-add-cart" type="button" onClick={onAddToCart}>
              <i className="fas fa-cart-plus" /><span>{addToCartLabel}</span>
            </button>
            <button className="btn-buy" type="button" onClick={onBuyNow}>{buyLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  // API mode
  const p = props.product;
  const href = props.href ?? `/product?id=${p.id}`;
  const imgSrc = getImageUrl(p.primaryImage, "/placeholder.svg");
  const displayPrice = fmtPrice(p.offerPrice);
  const originalPrice = p.nlc && p.nlc > (p.offerPrice ?? 0) ? fmtPrice(p.nlc) : undefined;

  return (
    <div className="product-card">
      <div className="product-badge">
        {p.badge && (
          <span className={`badge-tag ${BADGE_COLORS[p.badgeType ?? ""] ?? "badge-new"}`}>
            {p.badge}
          </span>
        )}
      </div>
      <button
        className={`product-wishlist${wishlisted ? " active" : ""}`}
        onClick={handleToggleWishlist}
        type="button"
        aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
      >
        <i className={wishlisted ? "fas fa-heart" : "far fa-heart"} />
      </button>
      <div className="product-image">
        <Link href={href} className="product-image-link">
          <img src={imgSrc} alt={p.itemName} loading="lazy" />
        </Link>
        <div className="product-image-overlay">
          <button className="overlay-btn" type="button" aria-label="Quick view" onClick={() => onQuickView?.()}>
            <i className="fas fa-eye" />
          </button>
          <button className="overlay-btn" type="button" aria-label="Compare">
            <i className="fas fa-shuffle" />
          </button>
        </div>
      </div>
      <div className="product-info">
        {p.brandName && <div className="product-brand">{p.brandName}</div>}
        <h3 className="product-name">
          <Link href={href}>{p.itemName}</Link>
        </h3>
        {p.variant && <div className="product-variant">{p.variant}</div>}
        {displayPrice && (
          <div className="product-price">
            <span className="price-current">{displayPrice}</span>
            {originalPrice && <span className="price-original">{originalPrice}</span>}
          </div>
        )}
        <div className="product-actions">
          <button className="btn-add-cart" type="button" onClick={onAddToCart}>
            <i className="fas fa-cart-plus" /><span>{addToCartLabel}</span>
          </button>
          <button className="btn-buy" type="button" onClick={onBuyNow}>{buyLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── API-driven product card from Item type ───────────────────────────────────

export function ItemCard({ item }: { item: Item }) {
  return (
    <ProductCard
      mode="api"
      href={buildProductDetailUrlForItem(item, item.primaryImage ?? null)}
      product={{
        id: item.id,
        itemName: item.itemName,
        brandName: item.brandName,
        offerPrice: item.offerPrice,
        nlc: item.nlc,
        primaryImage: item.primaryImage ?? null,
        categoryName: item.categoryName,
        variant: item.variant,
      }}
    />
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

export function ProductCardSkeleton() {
  return (
    <div className="product-card product-card--skeleton">
      <div className="skeleton skeleton-image" />
      <div className="product-info">
        <div className="skeleton skeleton-line skeleton-line--short" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line skeleton-line--medium" />
        <div className="skeleton skeleton-line skeleton-line--short" />
      </div>
    </div>
  );
}
