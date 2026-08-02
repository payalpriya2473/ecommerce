"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  announcementItems,
  footerGroups,
  footerSocialIcons,
  headerActions,
  navLinks,
  pageCopy,
} from "@/lib/data/homePageData";
import { useCategories } from "@/lib/hooks/usePublicData";
import { Category, getCategoryUrl, getImageUrl, slugifyCategoryName } from "@/lib/api/publicApi";
import { useCart } from "@/lib/cart/cart-context";
import { useWishlist, WishlistItem } from "@/lib/wishlist/wishlist-context";
import { buildProductDetailUrlForStoredItem } from "@/lib/product/variant-utils";
import "@/components/organisms/HomePage/HomePage.css";
import "./Wishlistpage.css";

type SortOption = "recent" | "price-asc" | "price-desc" | "discount" | "name";
type FilterOption = "all" | "in-stock" | "out-of-stock";
type ViewOption = "grid" | "list";
type ToastType = "success" | "warning" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

function formatPrice(value: number) {
  return `Rs ${value.toLocaleString("en-IN")}`;
}

function formatAddedDate(value?: string) {
  if (!value) return "recently";

  const added = new Date(value);
  const diff = Date.now() - added.getTime();

  if (Number.isNaN(added.getTime()) || diff < 0) return "recently";

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function getDiscountPercent(item: WishlistItem) {
  if (!item.originalPrice || item.originalPrice <= item.offerPrice) return 0;
  return Math.round(((item.originalPrice - item.offerPrice) / item.originalPrice) * 100);
}

function getBadge(item: WishlistItem) {
  const discount = getDiscountPercent(item);
  const addedDays = item.addedAt ? Math.floor((Date.now() - new Date(item.addedAt).getTime()) / 86400000) : 999;

  if (discount >= 20) {
    return { label: `-${discount}%`, tone: "orange" as const };
  }
  if (addedDays <= 7) {
    return { label: "NEW", tone: undefined };
  }
  if (discount > 0) {
    return { label: `-${discount}%`, tone: "green" as const };
  }

  return null;
}

function getDeliveryLabel(item: WishlistItem) {
  return item.isActive ? "Available to order" : "Currently unavailable";
}

function getCategoryLinkByLabel(categories: Category[], label: string): string {
  const normalizedLabel = slugifyCategoryName(label);
  const keywordMap: Record<string, string[]> = {
    mobiles: ["mobile", "phone", "smartphone"],
    tvs: ["tv", "television"],
    laptops: ["laptop", "pc", "computer"],
    appliances: ["appliance", "refrigerator", "washing-machine", "air-conditioner", "ac"],
  };

  const keywords = keywordMap[normalizedLabel] ?? [normalizedLabel];
  const matched = categories.find((cat) => {
    const slug = slugifyCategoryName(cat.slug || cat.name);
    return keywords.some((keyword) => slug.includes(keyword) || keyword.includes(slug));
  });

  return matched ? getCategoryUrl(matched) : "/products";
}

export default function WishlistPage() {
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");
  const [filter, setFilter] = useState<FilterOption>("all");
  const [view, setView] = useState<ViewOption>("grid");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl] = useState(() =>
    typeof window === "undefined" ? "https://applenext.in/wishlist" : `${window.location.origin}/wishlist`
  );
  const toastIdRef = useRef(0);

  const { data: liveCategories } = useCategories({ showOnWebsite: true });
  const { addItem: addCartItem, totalQuantity } = useCart();
  const {
    items,
    itemCount: wishlistCount,
    removeItem: removeWishlistItem,
    clearWishlist,
  } = useWishlist();

  const navItems = navLinks.map((item) => ({
    ...item,
    href: ["Mobiles", "TVs", "Laptops", "Appliances"].includes(item.label)
      ? getCategoryLinkByLabel(liveCategories, item.label)
      : item.href === "/category"
        ? "/products"
        : item.href,
  }));

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 50);
      setShowTop(window.scrollY > 400);
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!shareModalOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShareModalOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.removeProperty("overflow");
      window.removeEventListener("keydown", onKey);
    };
  }, [shareModalOpen]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3000);
  }, []);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "in-stock" && item.isActive) ||
        (filter === "out-of-stock" && !item.isActive);

      if (!matchesFilter) return false;
      if (!query) return true;

      return [
        item.itemName,
        item.brandName,
        item.categoryName,
        item.variant,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [items, filter, searchQuery]);

  const sortedItems = useMemo(() => {
    const next = [...filteredItems];

    next.sort((a, b) => {
      if (sort === "price-asc") return a.offerPrice - b.offerPrice;
      if (sort === "price-desc") return b.offerPrice - a.offerPrice;
      if (sort === "discount") return getDiscountPercent(b) - getDiscountPercent(a);
      if (sort === "name") return a.itemName.localeCompare(b.itemName);
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });

    return next;
  }, [filteredItems, sort]);

  const totalValue = items.reduce((sum, item) => sum + item.offerPrice, 0);
  const totalSavings = items.reduce(
    (sum, item) => sum + Math.max(0, item.originalPrice - item.offerPrice),
    0
  );
  const inStockCount = items.filter((item) => item.isActive).length;

  function removeItem(id: string) {
    removeWishlistItem(id);
    showToast("Item removed from wishlist", "warning");
  }

  function addToCart(item: WishlistItem) {
    if (!item.isActive) {
      showToast("This item is currently out of stock", "warning");
      return;
    }

    addCartItem({
      id: item.id,
      itemId: item.itemId,
      itemName: item.itemName,
      brandName: item.brandName,
      primaryImage: item.primaryImage,
      offerPrice: item.offerPrice,
      originalPrice: item.originalPrice,
      categoryName: item.categoryName,
      variant: item.variant,
      colorId: item.colorId ?? null,
      colorName: item.colorName ?? null,
      gst: item.gst,
    });
    showToast(`${item.itemName} added to cart`);
  }

  function addAllToCart() {
    const availableItems = items.filter((item) => item.isActive);

    if (availableItems.length === 0) {
      showToast("No in-stock items to add", "warning");
      return;
    }

    availableItems.forEach((item) => {
      addCartItem({
        id: item.id,
        itemId: item.itemId,
        itemName: item.itemName,
        brandName: item.brandName,
        primaryImage: item.primaryImage,
        offerPrice: item.offerPrice,
        originalPrice: item.originalPrice,
        categoryName: item.categoryName,
        variant: item.variant,
        colorId: item.colorId ?? null,
        colorName: item.colorName ?? null,
        gst: item.gst,
      });
    });

    showToast(`${availableItems.length} wishlist item${availableItems.length === 1 ? "" : "s"} added to cart`);
  }

  function handleClearWishlist() {
    if (items.length === 0) return;
    if (!window.confirm("Are you sure you want to clear your entire wishlist?")) return;

    clearWishlist();
    showToast("Wishlist cleared", "warning");
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    showToast("Link copied to clipboard");
  }

  function shareVia(platform: string) {
    const url = encodeURIComponent(shareUrl);
    const text = encodeURIComponent("Check out my AppleNext wishlist!");
    const platformUrls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      twitter: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
      email: `mailto:?subject=My AppleNext Wishlist&body=${text} ${url}`,
    };

    if (platformUrls[platform]) {
      window.open(platformUrls[platform], "_blank", "noopener");
    }

    setShareModalOpen(false);
    showToast(`Opening ${platform.charAt(0).toUpperCase() + platform.slice(1)}...`, "info");
  }

  return (
    <>
      <div className="breadcrumb-bar">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep"><i className="fas fa-chevron-right" /></span>
          <span className="current">My Wishlist</span>
        </div>
      </div>

      <main>
        <div className="page-wrapper">
          <div className="wishlist-header">
            <div className="wh-left">
              <div className="wh-icon"><i className="fas fa-heart" /></div>
              <div className="wh-title">
                <h1>My Wishlist</h1>
                <p>{wishlistCount} saved item{wishlistCount === 1 ? "" : "s"} synced from your shopping flow</p>
              </div>
            </div>
            <div className="wh-right">
              <button className="wh-btn wh-btn-outline" type="button" onClick={() => setShareModalOpen(true)}>
                <i className="fas fa-share-nodes" /> Share Wishlist
              </button>
              <button className="wh-btn wh-btn-primary" type="button" onClick={addAllToCart}>
                <i className="fas fa-cart-plus" /> Add All to Cart
              </button>
              <button className="wh-btn wh-btn-danger" type="button" onClick={handleClearWishlist}>
                <i className="fas fa-trash" /> Clear All
              </button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="wishlist-summary">
              <div className="ws-stat">
                <div className="ws-stat-num">{items.length}</div>
                <div className="ws-stat-label">Saved Items</div>
              </div>
              <div className="ws-divider" />
              <div className="ws-stat">
                <div className="ws-stat-num">{formatPrice(totalValue)}</div>
                <div className="ws-stat-label">Current Value</div>
              </div>
              <div className="ws-divider" />
              <div className="ws-stat">
                <div className="ws-stat-num">{formatPrice(totalSavings)}</div>
                <div className="ws-stat-label">Potential Savings</div>
              </div>
              <div className="ws-divider" />
              <div className="ws-stat">
                <div className="ws-stat-num">{inStockCount}</div>
                <div className="ws-stat-label">In Stock</div>
              </div>
              <button className="ws-action" type="button" onClick={addAllToCart}>
                <i className="fas fa-shopping-cart" /> Add All to Cart
              </button>
            </div>
          )}

          {items.length > 0 && (
            <div className="wl-toolbar">
              <div className="toolbar-left">
                <span className="toolbar-count">
                  Showing <span>{sortedItems.length}</span> item{sortedItems.length === 1 ? "" : "s"}
                </span>
                <select
                  className="sort-select"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortOption)}
                >
                  <option value="recent">Sort: Recently Added</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="discount">Biggest Discount</option>
                  <option value="name">Name: A to Z</option>
                </select>
                <div className="filter-chips">
                  {(["all", "in-stock", "out-of-stock"] as FilterOption[]).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`filter-chip${filter === value ? " active" : ""}`}
                      onClick={() => setFilter(value)}
                    >
                      {value === "all" ? "All" : value === "in-stock" ? "In Stock" : "Out of Stock"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="view-toggle">
                <button
                  type="button"
                  className={`view-btn${view === "grid" ? " active" : ""}`}
                  title="Grid view"
                  onClick={() => setView("grid")}
                >
                  <i className="fas fa-th-large" />
                </button>
                <button
                  type="button"
                  className={`view-btn${view === "list" ? " active" : ""}`}
                  title="List view"
                  onClick={() => setView("list")}
                >
                  <i className="fas fa-list" />
                </button>
              </div>
            </div>
          )}

          {sortedItems.length > 0 ? (
            <div className={`wishlist-grid${view === "list" ? " list-view" : ""}`}>
              {sortedItems.map((item) => (
                <WishlistCard
                  key={item.id}
                  item={item}
                  onRemove={removeItem}
                  onAddToCart={addToCart}
                  onShare={(name) => showToast(`Sharing ${name}`, "info")}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="wl-no-results">
              <i className="fas fa-filter" />
              <p>No wishlist items match your current search or filter.</p>
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setSearchQuery("");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="footer-top">
          <div>
            <div className="footer-logo">APPLENEXT</div>
            <p className="footer-desc">
              Your one-stop destination for the latest electronics, mobile phones, laptops, and
              home appliances at the best prices with genuine warranty.
            </p>
            <div className="footer-social">
              {footerSocialIcons.map((icon) => (
                <a key={icon} href="#" aria-label={icon}><i className={`fab ${icon}`} /></a>
              ))}
            </div>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title} className="footer-col">
              <h4>{group.title}</h4>
              {group.links.map((link) => (
                <a key={link.label} href={link.href}>{link.label}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <p>{pageCopy.footerCopyright}</p>
          <div className="footer-payments">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </footer>

      <button
        className={`btt${showTop ? " visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        type="button"
        aria-label="Back to top"
      >
        <i className="fas fa-arrow-up" />
      </button>

      {shareModalOpen && (
        <div className="modal-overlay" onClick={() => setShareModalOpen(false)} role="presentation">
          <div
            className="modal-box"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
          >
            <div className="modal-title" id="share-modal-title">
              <i className="fas fa-share-nodes" /> Share Your Wishlist
            </div>
            <p className="modal-sub">
              Share your wishlist with friends and family so they can see the real products you saved.
            </p>
            <div className="share-link-row">
              <input className="share-link-input" type="text" value={shareUrl} readOnly />
              <button className="copy-btn" type="button" onClick={copyShareLink}>Copy</button>
            </div>
            <div className="share-options">
              {[
                { key: "whatsapp", icon: "fab fa-whatsapp", label: "WhatsApp" },
                { key: "facebook", icon: "fab fa-facebook", label: "Facebook" },
                { key: "twitter", icon: "fab fa-twitter", label: "Twitter" },
                { key: "email", icon: "fas fa-envelope", label: "Email" },
              ].map(({ key, icon, label }) => (
                <button key={key} type="button" className="share-option" onClick={() => shareVia(key)}>
                  <i className={icon} />
                  {label}
                </button>
              ))}
            </div>
            <button className="modal-close" type="button" onClick={() => setShareModalOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === "success" && <i className="fas fa-check-circle" />}
            {toast.type === "warning" && <i className="fas fa-exclamation-circle" />}
            {toast.type === "info" && <i className="fas fa-circle-info" />}
            {toast.message}
          </div>
        ))}
      </div>
    </>
  );
}

function WishlistCard({
  item,
  onRemove,
  onAddToCart,
  onShare,
}: {
  item: WishlistItem;
  onRemove: (id: string) => void;
  onAddToCart: (item: WishlistItem) => void;
  onShare: (name: string) => void;
}) {
  const router = useRouter();
  const badge = getBadge(item);
  const discount = getDiscountPercent(item);
  const productHref = buildProductDetailUrlForStoredItem(item);

  return (
    <div
      className="wl-card"
      role="button"
      tabIndex={0}
      onClick={() => router.push(productHref)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(productHref);
        }
      }}
    >
      <div className="wl-card-img">
        <img src={getImageUrl(item.primaryImage, "/placeholder.svg")} alt={item.itemName} loading="lazy" />
        {badge ? (
          <span className={`wl-card-badge${badge.tone ? ` ${badge.tone}` : ""}`}>
            {badge.label}
          </span>
        ) : null}
        <button
          className="wl-remove-btn"
          type="button"
          aria-label={`Remove ${item.itemName}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(item.id);
          }}
        >
          <i className="fas fa-xmark" />
        </button>
        {!item.isActive && (
          <div className="wl-out-of-stock">
            <span>Out of Stock</span>
          </div>
        )}
      </div>

      <div className="wl-card-body">
        <div className="wl-brand">{item.brandName || "AppleNext"}</div>
        <div className="wl-name">
          <Link href={productHref}>{item.itemName}</Link>
        </div>
        <div className="wl-rating">
          {item.categoryName ? <span>{item.categoryName}</span> : null}
          {item.variant ? <span className="count">{item.variant}</span> : null}
          {item.colorName ? <span className="count">{item.colorName}</span> : null}
          {typeof item.gst === "number" && item.gst > 0 ? (
            <span className="count">GST {item.gst}%</span>
          ) : null}
        </div>

        <div className="wl-bottom">
          <div className="wl-added">
            <i className="fas fa-clock" /> Added {formatAddedDate(item.addedAt)}
          </div>

          <div className="wl-price-row">
            <span className="wl-price">{formatPrice(item.offerPrice)}</span>
            {item.originalPrice > item.offerPrice ? (
              <span className="wl-original">{formatPrice(item.originalPrice)}</span>
            ) : null}
            {discount > 0 ? <span className="wl-discount">{discount}% off</span> : null}
          </div>

          <div className="wl-delivery">
            <i className={`fas ${item.isActive ? "fa-truck" : "fa-bell"}`} />
            {getDeliveryLabel(item)}
          </div>

          <div className="wl-actions">
            <button
              type="button"
              className="wl-add-cart"
              disabled={!item.isActive}
              onClick={(event) => {
                event.stopPropagation();
                onAddToCart(item);
              }}
            >
              <i className="fas fa-cart-plus" />
              {item.isActive ? "Add to Cart" : "Out of Stock"}
            </button>
            <button
              type="button"
              className="wl-share-btn"
              aria-label="Share"
              onClick={(event) => {
                event.stopPropagation();
                onShare(item.itemName);
              }}
            >
              <i className="fas fa-share-nodes" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-wishlist">
      <div className="ew-icon"><i className="fas fa-heart-crack" /></div>
      <h2>Your wishlist is empty</h2>
      <p>Tap the heart icon on real products across the site and they will appear here automatically.</p>
      <div className="empty-btns">
        <Link href="/" className="btn-primary">
          <i className="fas fa-house" /> Go to Homepage
        </Link>
        <Link href="/products" className="btn-outline">
          <i className="fas fa-mobile-screen" /> Browse Products
        </Link>
      </div>
    </div>
  );
}
