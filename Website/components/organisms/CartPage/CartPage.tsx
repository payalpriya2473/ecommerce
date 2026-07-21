"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANY_ID,
  getImageUrl,
  getItemDiscountPercent,
  getItemPrice,
  publicItemAPI,
  type Item,
} from "@/lib/api/publicApi";
import { cartItemFromItem, useCart } from "@/lib/cart/cart-context";
import { useWishlist, wishlistItemFromCartItem } from "@/lib/wishlist/wishlist-context";
import {
  buildProductDetailUrlForItem,
  buildProductDetailUrlForStoredItem,
} from "@/lib/product/variant-utils";
import {
  announcementItems,
  headerActions,
  navLinks,
  searchCategories,
  footerGroups,
  footerSocialIcons,
} from "@/lib/data/homePageData";
import "@/components/organisms/HomePage/HomePage.css";
import "./CartPage.css";

const RECOMMENDATION_LIMIT = 4;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Toast {
  id: number;
  message: string;
  type: "success" | "warning";
}

function getFamilyImage(
  targetItem: Pick<Item, "id" | "itemName" | "primaryImage" | "colors">,
  familyItems: Array<Pick<Item, "id" | "itemName" | "primaryImage" | "colors">>
) {
  if (targetItem.primaryImage) return targetItem.primaryImage;

  const familyVariants = familyItems.filter(
    (candidate) => candidate.itemName === targetItem.itemName
  );

  const imagePool = Array.from(
    new Set(
      familyVariants
        .flatMap((candidate) => [
          ...(candidate.colors ?? []).map((color) => color.primaryImage).filter(Boolean),
          candidate.primaryImage,
        ])
        .filter(Boolean)
    )
  );

  if (!imagePool.length) return null;

  const variantIndex = familyVariants.findIndex(
    (candidate) => String(candidate.id) === String(targetItem.id)
  );

  return imagePool[(variantIndex >= 0 ? variantIndex : 0) % imagePool.length] ?? null;
}

// ─── Static Data ──────────────────────────────────────────────────────────────
const COUPONS: Record<string, { pct?: number; flat?: number; max?: number; label: string }> = {
  MOTAB10:   { pct: 10, max: 3000, label: "10% off up to Rs 3,000" },
  HDFC5:     { pct: 5,  max: 2000, label: "5% off up to Rs 2,000 (HDFC)" },
  NEWUSER15: { pct: 15, max: 2000, label: "15% off up to Rs 2,000" },
  SAVE500:   { flat: 500, label: "Flat Rs 500 off" },
};

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useCountdown() {
  const [time, setTime] = useState("04:22:15");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(23, 59, 59, 0);
      const diff = midnight.getTime() - now.getTime();
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setTime(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CartPage() {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const router = useRouter();
  const {
    items: cartItems,
    savedItems,
    totalQuantity,
    addItem,
    removeItem: removeCartItem,
    updateQty,
    toggleSelected,
    toggleSelectAll: setAllSelected,
    saveForLater: moveItemToSaved,
    moveToCart,
    removeSaved,
  } = useCart();
  const { itemCount: wishlistCount, addItem: addWishlistItem } = useWishlist();
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [savedOpen, setSavedOpen] = useState(true);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [recommendedItems, setRecommendedItems] = useState<Item[]>([]);
  const [recommendationPool, setRecommendationPool] = useState<Item[]>([]);
  const countdown = useCountdown();
  const toastIdRef = useRef(0);

  // ── Derived state ──
  // FIX: Use all items for quantity badge, but only selected for price calculation
  const selectedItems = cartItems.filter((i) => i.selected !== false);

  // FIX: Safely coerce prices to numbers to avoid NaN in calculations
  const subtotal = selectedItems.reduce((s, i) => {
    const price = Number(i.offerPrice) || 0;
    const qty = Number(i.qty) || 1;
    return s + price * qty;
  }, 0);

  const originalTotal = selectedItems.reduce((s, i) => {
    // Use originalPrice if available and greater, otherwise fall back to offerPrice
    const orig = Number(i.originalPrice) || Number(i.offerPrice) || 0;
    const qty = Number(i.qty) || 1;
    return s + orig * qty;
  }, 0);

  const productDiscount = Math.max(0, originalTotal - subtotal);
  const delivery = subtotal >= 999 ? 0 : 99;

  const couponDisc = (() => {
    if (!appliedCoupon) return 0;
    const c = COUPONS[appliedCoupon];
    if (!c) return 0;
    if (c.flat) return Math.min(c.flat, subtotal);
    return Math.min(Math.floor(subtotal * (c.pct! / 100)), c.max!);
  })();

  const platformDisc = subtotal > 50000 ? 500 : 0;
  const tax = Math.round((subtotal - couponDisc - platformDisc) * 0.018);
  const total = Math.max(0, subtotal - couponDisc - platformDisc + delivery + tax);
  const totalSaving = productDiscount + couponDisc + platformDisc - tax;

  // ── Toast ──
  const showToast = useCallback((message: string, type: "success" | "warning" = "success") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2900);
  }, []);

  // ── Cart actions ──
  const changeQty = (id: string, delta: number) => {
    const item = cartItems.find((i) => String(i.id) === String(id));
    if (!item) return;
    const currentQty = Number(item.qty) || 1;
    const nextQty = Math.max(1, Math.min(10, currentQty + delta));
    if (nextQty !== currentQty) {
      updateQty(id, nextQty);
      showToast(`Quantity updated to ${nextQty}`);
    }
  };

  // Remove immediately so the final item can transition into the empty-cart state reliably.
  const removeItem = useCallback((id: string) => {
    const strId = String(id);
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.delete(strId);
      return next;
    });
    removeCartItem(strId);
    showToast("Item removed from cart", "warning");
  }, [removeCartItem, showToast]);

  const toggleSelect = (id: string, checked: boolean) => {
    toggleSelected(id, checked);
  };

  const toggleSelectAll = (checked: boolean) => {
    setAllSelected(checked);
  };

  const saveForLater = (id: string) => {
    moveItemToSaved(String(id));
    showToast("Item saved for later");
  };

  const moveToWishlist = (id: string) => {
    const item = cartItems.find((cartItem) => String(cartItem.id) === String(id));
    if (!item) return;
    addWishlistItem(wishlistItemFromCartItem(item));
    removeCartItem(String(id));
    showToast("Added to wishlist");
  };

  // ── Coupon ──
  const applyCoupon = (code?: string) => {
    const c = (code || couponInput).trim().toUpperCase();
    if (!c) { showToast("Please enter a coupon code", "warning"); return; }
    if (COUPONS[c]) {
      setAppliedCoupon(c);
      setCouponInput("");
      showToast(`Coupon ${c} applied successfully!`);
    } else {
      showToast("Invalid coupon code", "warning");
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    showToast("Coupon removed", "warning");
  };

  const allSelected = cartItems.length > 0 && cartItems.every((i) => i.selected !== false);

  // ── Helper: safe price display ──
  const safePrice = (val: unknown): number => Math.max(0, Number(val) || 0);
  const visibleRecommendations = recommendedItems.slice(0, RECOMMENDATION_LIMIT);

  useEffect(() => {
    let ignore = false;

    const loadRecommendations = async () => {
      if (!hydrated || cartItems.length === 0) {
        if (!ignore) {
          setRecommendedItems([]);
          setRecommendationPool([]);
        }
        return;
      }

      const cartProductIds = Array.from(
        new Set(cartItems.map((item) => String(item.itemId ?? item.id)).filter(Boolean))
      );

      if (cartProductIds.length === 0) {
        if (!ignore) {
          setRecommendedItems([]);
          setRecommendationPool([]);
        }
        return;
      }

      const excludedIds = new Set([
        ...cartProductIds,
        ...savedItems.map((item) => String(item.itemId ?? item.id)).filter(Boolean),
      ]);

      const productDetails = await publicItemAPI.getAll({
        companyId: COMPANY_ID || undefined,
        ids: cartProductIds,
        limit: Math.max(cartProductIds.length, 1),
        page: 1,
      });

      const categoryIds = Array.from(
        new Set(
          productDetails.items
            .map((item) => item?.categoryId)
            .filter((id): id is string | number => id != null)
        )
      );

      if (categoryIds.length === 0) {
        if (!ignore) {
          setRecommendedItems([]);
          setRecommendationPool([]);
        }
        return;
      }

      const recommendationBuckets = await Promise.all(
        categoryIds.map((categoryId) =>
          publicItemAPI.getAll({
            companyId: COMPANY_ID || undefined,
            categoryId,
            limit: 10,
            page: 1,
          })
        )
      );

      const deduped = Array.from(
        new Map(
          recommendationBuckets
            .flatMap((bucket) => bucket.items)
            .filter((item) => !excludedIds.has(String(item.id)))
            .filter((item) => {
              const { offerPrice, originalPrice } = getItemPrice(item);
              return safePrice(offerPrice) > 0 || safePrice(originalPrice) > 0;
            })
            .map((item) => [String(item.id), item])
        ).values()
      );

      if (!ignore) {
        setRecommendedItems(deduped);
        setRecommendationPool(recommendationBuckets.flatMap((bucket) => bucket.items));
      }
    };

    void loadRecommendations();

    return () => {
      ignore = true;
    };
  }, [cartItems, hydrated, savedItems]);

  useEffect(() => {
    if (!hydrated) return;

    const resetScroll = () => {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    resetScroll();
    const frame = window.requestAnimationFrame(resetScroll);

    return () => window.cancelAnimationFrame(frame);
  }, [hydrated]);

  return (
    <>
      {/* Breadcrumb */}
      <div className="cp-breadcrumb-bar">
        <div className="cp-breadcrumb">
          <Link href="/">Home</Link>
          <i className="fas fa-chevron-right sep" />
          <span className="current">My Cart</span>
        </div>
      </div>

      {/* Progress */}
      <div className="cart-progress-wrap">
        <div className="cart-progress">
          <div className="cp-step">
            <div className="cp-circle active"><i className="fas fa-shopping-cart" /></div>
            <div className="cp-label active">My Cart</div>
          </div>
          <div className="cp-line" />
          <div className="cp-step">
            <div className="cp-circle">2</div>
            <div className="cp-label">Address</div>
          </div>
          <div className="cp-line" />
          <div className="cp-step">
            <div className="cp-circle">3</div>
            <div className="cp-label">Payment</div>
          </div>
          <div className="cp-line" />
          <div className="cp-step">
            <div className="cp-circle">4</div>
            <div className="cp-label">Confirm</div>
          </div>
        </div>
      </div>

      {/* Main */}
      <main style={{ background: "#f8fafc", minHeight: "60vh" }}>
        {!hydrated ? (
          <div style={{ minHeight: "60vh" }} />
        ) : cartItems.length === 0 ? (
          <div className="empty-cart-state">
            <div className="empty-cart-icon"><i className="fas fa-cart-shopping" /></div>
            <h2>Your cart is empty!</h2>
            <p>Looks like you haven&apos;t added anything yet. Explore thousands of products at amazing prices.</p>
            <div className="empty-cart-btns">
              <Link href="/" className="btn-primary-ec"><i className="fas fa-house" /> Go to Homepage</Link>
              <Link href="/products" className="btn-outline-ec"><i className="fas fa-mobile-screen" /> Shop Mobiles</Link>
            </div>
          </div>
        ) : (
          <div className="cart-page-inner">
            {/* LEFT */}
            <div className="cart-section">
              {/* Header */}
              <div className="cart-header-card">
                <h1>
                  <i className="fas fa-shopping-cart" />
                  My Cart <span className="cart-count-badge">{totalQuantity} Items</span>
                </h1>
                <label className="select-all-label">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                  Select All
                </label>
              </div>

              {/* Offer Strip */}
              <div className="offer-strip">
                <i className="fas fa-fire-flame-curved" />
                <div className="offer-strip-text">
                  You&apos;re saving <strong>Rs {productDiscount.toLocaleString()}</strong> on your current cart.
                  {subtotal < 999 && (
                    <> Add items worth <strong>Rs {(999 - subtotal).toLocaleString()}</strong> more to unlock free delivery!</>
                  )}
                </div>
                <Link href="/products" className="offer-strip-cta">Shop More</Link>
              </div>

              {/* Cart Items */}
              {cartItems.map((item, idx) => {
                // FIX: Safely parse all numeric values
                const offerPrice = safePrice(item.offerPrice);
                const originalPrice = safePrice(item.originalPrice) || offerPrice;
                const qty = Math.max(1, Number(item.qty) || 1);
                const itemId = String(item.id);
                const productHref = buildProductDetailUrlForStoredItem(item);
                const discountPct = originalPrice > offerPrice && originalPrice > 0
                  ? Math.round((1 - offerPrice / originalPrice) * 100)
                  : 0;

                return (
                  <div
                    key={itemId}
                    className={`cart-item${removingIds.has(itemId) ? " removing" : ""}`}
                    style={{ animationDelay: `${idx * 0.07}s` }}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(productHref)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(productHref);
                      }
                    }}
                  >
                    <div className="ci-check">
                      <input
                        type="checkbox"
                        checked={item.selected !== false}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggleSelect(itemId, e.target.checked)}
                      />
                    </div>
                    <div className="ci-img">
                      {discountPct > 0 && (
                        <div className="item-badge">{discountPct}% Off</div>
                      )}
                      <img
                        src={getImageUrl(item.primaryImage, "/placeholder.svg")}
                        alt={item.itemName || "Product"}
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.onerror = null;
                          img.src = "/placeholder.svg";
                        }}
                      />
                    </div>
                    <div className="ci-body">
                      <div className="ci-brand">{item.brandName ?? "Motabhai"}</div>
                      <div className="ci-name">
                        <Link href={productHref}>{item.itemName || "Product"}</Link>
                      </div>
                      <div className="ci-meta">
                        {item.variant && (
                          <span className="ci-chip">
                            <i className="fas fa-layer-group" style={{ marginRight: 4 }} />
                            {item.variant}
                          </span>
                        )}
                        {item.colorName && (
                          <span className="ci-chip">
                            <i className="fas fa-palette" style={{ marginRight: 4 }} />
                            {item.colorName}
                          </span>
                        )}
                        {item.categoryName && (
                          <span className="ci-chip">
                            <i className="fas fa-tag" style={{ marginRight: 4 }} />
                            {item.categoryName}
                          </span>
                        )}
                        <span className="ci-chip">
                          <i className="fas fa-store" style={{ marginRight: 4 }} />
                          Motabhai Official
                        </span>
                      </div>
                      <div className="ci-rating">
                        {[...Array(5)].map((_, i) => <i key={i} className="fas fa-star" />)}
                        <span style={{ marginLeft: 4 }}>4.8 (Live product)</span>
                      </div>
                      <div className="ci-delivery">
                        <i className="fas fa-truck-fast" />Free delivery in 2-4 days
                      </div>
                      <div className="ci-actions-row">
                        <button className="ci-action-btn" onClick={(e) => {
                          e.stopPropagation();
                          saveForLater(itemId);
                        }}>
                          <i className="fas fa-bookmark" /> Save for Later
                        </button>
                        <button className="ci-action-btn" onClick={(e) => {
                          e.stopPropagation();
                          moveToWishlist(itemId);
                        }}>
                          <i className="fas fa-heart" /> Wishlist
                        </button>
                        {/* FIX: Remove button — use itemId consistently */}
                        <button
                          className="ci-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(itemId);
                          }}
                          disabled={removingIds.has(itemId)}
                        >
                          <i className="fas fa-trash" /> Remove
                        </button>
                      </div>
                    </div>
                    <div className="ci-right">
                      <div>
                        {/* FIX: Display per-item total (price × qty) */}
                        <div className="ci-price">
                          Rs {(offerPrice * qty).toLocaleString("en-IN")}
                        </div>
                        {originalPrice > offerPrice && (
                          <div className="ci-original">
                            Rs {(originalPrice * qty).toLocaleString("en-IN")}
                          </div>
                        )}
                        {originalPrice > offerPrice && (
                          <div className="ci-saving">
                            You save Rs {((originalPrice - offerPrice) * qty).toLocaleString("en-IN")}
                          </div>
                        )}
                        {offerPrice === 0 && (
                          <div className="ci-price" style={{ fontSize: "0.82rem", color: "var(--gray400)" }}>
                            Price on request
                          </div>
                        )}
                      </div>
                      <div className="ci-qty">
                        <button
                          className="qty-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            changeQty(itemId, -1);
                          }}
                          disabled={qty <= 1}
                        >
                          <i className="fas fa-minus" />
                        </button>
                        <span className="qty-val">{qty}</span>
                        <button
                          className="qty-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            changeQty(itemId, +1);
                          }}
                          disabled={qty >= 10}
                        >
                          <i className="fas fa-plus" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Saved for Later */}
              <div className="saved-section">
                <div className="saved-header" onClick={() => setSavedOpen(!savedOpen)}>
                  <h3>
                    <i className="fas fa-bookmark" /> Saved for Later{" "}
                    <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: "0.85rem" }}>
                      ({savedItems.length} items)
                    </span>
                  </h3>
                  <i
                    className="fas fa-chevron-down saved-toggle-icon"
                    style={{ transform: savedOpen ? "rotate(0)" : "rotate(-90deg)" }}
                  />
                </div>
                {savedOpen && (
                  <div className="saved-body">
                    {savedItems.map((item) => {
                      const savedId = String(item.id);
                      const savedProductHref = buildProductDetailUrlForStoredItem(item);
                      return (
                        <div
                          key={savedId}
                          className="saved-card"
                          role="button"
                          tabIndex={0}
                          onClick={() => router.push(savedProductHref)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(savedProductHref);
                            }
                          }}
                        >
                          <div className="saved-card-img">
                            <img
                              src={getImageUrl(item.primaryImage, "/placeholder.svg")}
                              alt={item.itemName || "Product"}
                              loading="lazy"
                              onError={(e) => {
                                const img = e.currentTarget;
                                img.onerror = null;
                                img.src = "/placeholder.svg";
                              }}
                            />
                          </div>
                          <div className="saved-card-body">
                            <div className="saved-card-name">{item.itemName || "Product"}</div>
                            <div className="saved-card-price">
                              Rs {safePrice(item.offerPrice).toLocaleString("en-IN")}
                            </div>
                            <div className="saved-card-actions">
                              <button
                                className="sc-add"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveToCart(savedId);
                                  showToast("Item moved to cart!");
                                }}
                              >
                                <i className="fas fa-cart-plus" /> Add
                              </button>
                              <button
                                className="sc-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSaved(savedId);
                                  showToast("Removed from saved", "warning");
                                }}
                              >
                                <i className="fas fa-trash" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {savedItems.length === 0 && (
                      <p style={{ color: "#94a3b8", fontSize: "0.85rem", padding: "16px 0" }}>
                        No items saved for later.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Recommendations */}
              <div className="reco-section">
                <div className="reco-header">
                  <h3><i className="fas fa-wand-magic-sparkles" /> You May Also Like</h3>
                  <Link href="/products">View All <i className="fas fa-arrow-right" /></Link>
                </div>
                <div className="reco-body">
                  {visibleRecommendations.map((item) => {
                    const { offerPrice, originalPrice } = getItemPrice(item);
                    const discountPercent = getItemDiscountPercent(item);
                    const imageSrc = getImageUrl(
                      getFamilyImage(item, recommendationPool.length ? recommendationPool : recommendedItems),
                      "/placeholder.svg"
                    );
                    const productHref = buildProductDetailUrlForItem(
                      item,
                      getFamilyImage(item, recommendationPool.length ? recommendationPool : recommendedItems)
                    );
                    const badge =
                      discountPercent > 0
                        ? `${discountPercent}% Off`
                        : item.brandName || item.categoryName || "Recommended";

                    return (
                      <div
                        key={item.id}
                        className="reco-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => router.push(productHref)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(productHref);
                          }
                        }}
                      >
                        <div className="reco-card-img">
                          <img
                            src={imageSrc}
                            alt={item.itemName}
                            loading="lazy"
                            onError={(e) => {
                              const img = e.currentTarget;
                              img.onerror = null;
                              img.src = "/placeholder.svg";
                            }}
                          />
                          <div className="reco-card-badge">{badge}</div>
                        </div>
                        <div className="reco-card-body">
                          <div className="reco-card-name">{item.itemName}</div>
                          <div className="reco-card-price">
                            Rs {safePrice(offerPrice).toLocaleString("en-IN")}
                            {originalPrice > offerPrice && (
                              <span>Rs {safePrice(originalPrice).toLocaleString("en-IN")}</span>
                            )}
                          </div>
                          <button
                            className="reco-card-add"
                            onClick={(e) => {
                              e.stopPropagation();
                              addItem(cartItemFromItem(item));
                              showToast(`${item.itemName} added to cart!`);
                            }}
                          >
                            <i className="fas fa-cart-plus" /> Add to Cart
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {visibleRecommendations.length === 0 && (
                    <div className="reco-empty">
                      Fresh recommendations will appear here once we find in-stock matches for your cart.
                    </div>
                  )}
                </div>
              </div>
            </div>
{/* RIGHT: Order Summary */}
            <div className="order-summary">
              <div className="os-title"><i className="fas fa-receipt" /> Order Summary</div>

              {/* Coupon */}
              <div className="coupon-box">
                <div className="coupon-box-label"><i className="fas fa-tag" /> Apply Coupon / Gift Card</div>
                <div className="coupon-row">
                  <input
                    className="coupon-input"
                    type="text"
                    placeholder="Enter coupon code"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                  />
                  <button className="coupon-btn" onClick={() => applyCoupon()}>Apply</button>
                </div>
                <div className="coupon-chips">
                  {Object.keys(COUPONS).map((code) => (
                    <div key={code} className="coupon-chip" onClick={() => applyCoupon(code)}>{code}</div>
                  ))}
                </div>
                <div className={`coupon-applied${appliedCoupon ? " show" : ""}`}>
                  <i className="fas fa-circle-check" />
                  <span>{appliedCoupon ? `${appliedCoupon} applied — ${COUPONS[appliedCoupon]?.label}` : ""}</span>
                  <button className="coupon-remove-btn" onClick={removeCoupon}>
                    <i className="fas fa-xmark" /> Remove
                  </button>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="price-rows">
                <div className="price-row">
                  <span className="pr-label">
                    <i className="fas fa-bag-shopping" /> Price ({selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""})
                  </span>
                  <span className="pr-val">Rs {subtotal.toLocaleString("en-IN")}</span>
                </div>
                {productDiscount > 0 && (
                  <div className="price-row saving">
                    <span className="pr-label"><i className="fas fa-tag" /> Product Discount</span>
                    <span className="pr-val">− Rs {productDiscount.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {couponDisc > 0 && (
                  <div className="price-row saving">
                    <span className="pr-label"><i className="fas fa-ticket" /> Coupon ({appliedCoupon})</span>
                    <span className="pr-val">− Rs {couponDisc.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {platformDisc > 0 && (
                  <div className="price-row saving">
                    <span className="pr-label"><i className="fas fa-star" /> Platform Discount</span>
                    <span className="pr-val">− Rs {platformDisc.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="price-row">
                  <span className="pr-label"><i className="fas fa-truck" /> Delivery Charges</span>
                  <span className="pr-val" style={{ color: delivery === 0 ? "#16a34a" : "#0f172a" }}>
                    {delivery === 0
                      ? <><i className="fas fa-check" style={{ color: "#22c55e", marginRight: 4 }} />FREE</>
                      : `Rs ${delivery}`}
                  </span>
                </div>
                <div className="price-row">
                  <span className="pr-label"><i className="fas fa-file-invoice" /> GST (applicable)</span>
                  <span className="pr-val">Rs {tax.toLocaleString("en-IN")}</span>
                </div>
                <div className="price-row total">
                  <div>
                    <div className="pr-label">Total Amount</div>
                    {totalSaving > 0 && (
                      <div className="total-note" style={{ color: "#16a34a", fontWeight: 700 }}>
                        You Save Rs {Math.max(0, totalSaving).toLocaleString("en-IN")} on this order!
                      </div>
                    )}
                  </div>
                  <span className="pr-val">Rs {total.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* EMI */}
              {total > 10000 && (
                <div className="emi-note">
                  <i className="fas fa-credit-card" />
                  <div>
                    No-Cost EMI available from <strong>Rs {Math.round(total / 12).toLocaleString("en-IN")}/mo</strong> on HDFC, SBI &amp; 4 more cards.{" "}
                    <Link href="/offers" style={{ color: "#2563eb", fontWeight: 700 }}>View all offers →</Link>
                  </div>
                </div>
              )}

              {/* Delivery estimate */}
              <div className="delivery-estimate">
                <i className="fas fa-truck-fast" />
                <div className="de-text">
                  <span>Estimated Delivery by Tomorrow</span>
                  Order within <span className="de-countdown">{countdown}</span> for same-day dispatch
                </div>
              </div>

              {/* Checkout */}
              <Link
                href="/checkout"
                className="checkout-btn"
                style={{ pointerEvents: total === 0 ? "none" : "auto", opacity: total === 0 ? 0.5 : 1 }}
              >
                <i className="fas fa-lock" />
                Proceed to Checkout &nbsp;·&nbsp; Rs {total.toLocaleString("en-IN")}
                <i className="fas fa-arrow-right" />
              </Link>

              {/* Safety */}
              <div className="safety-badges">
                <div className="safety-badge"><i className="fas fa-shield-halved" /> Secure Payment</div>
                <div className="safety-badge"><i className="fas fa-rotate-left" /> Easy Returns</div>
                <div className="safety-badge"><i className="fas fa-certificate" /> 100% Genuine</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mini Footer */}
{/* Full Footer */}
      <footer className="footer">
        <div className="footer-top">
          <div>
            <div className="footer-logo">MOTABHAI</div>
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
          <p>&copy; 2026 Motabhai Electronics. All rights reserved.</p>
          <div className="footer-payments">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((m) => <span key={m}>{m}</span>)}
          </div>
        </div>
      </footer>

      {/* Toasts */}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <i className={`fas ${t.type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`} />
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
