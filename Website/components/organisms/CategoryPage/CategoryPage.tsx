"use client";
// app/category/CategoryPage.tsx

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  announcementItems,
  footerGroups,
  footerSocialIcons,
  headerActions,
  navLinks,
} from "@/lib/data/homePageData";

import {
  getImageUrl,
  getItemDiscountPercent,
  getItemOfferPrice,
  getItemOriginalPrice,
  Item,
} from "@/lib/api/publicApi";
import {
  useCategoryPage,
  PRICE_RANGES,
  STOCK_FILTERS,
  SortValue,
} from "@/lib/hooks/useCategoryPage";
import { cartItemFromItem, useCart } from "@/lib/cart/cart-context";
import { useWishlist, wishlistItemFromItem } from "@/lib/wishlist/wishlist-context";
import { buildProductDetailUrlForItem, getResolvedSelection } from "@/lib/product/variant-utils";

import "./CategoryPage.css";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number) {
  return `Rs ${price.toLocaleString("en-IN")}`;
}

function getMrp(item: Item): number {
  return getItemOriginalPrice(item);
}

function getDiscount(item: Item) {
  return getItemDiscountPercent(item);
}

function isItemInStock(item: Pick<Item, "openingStock">) {
  return Number(item.openingStock ?? 0) > 0;
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
      familyVariants.flatMap((candidate) => [
        ...(candidate.colors ?? []).map((color) => color.primaryImage).filter(Boolean),
        candidate.primaryImage,
      ]).filter(Boolean)
    )
  );

  if (!imagePool.length) return null;

  const variantIndex = familyVariants.findIndex(
    (candidate) => String(candidate.id) === String(targetItem.id)
  );

  return imagePool[(variantIndex >= 0 ? variantIndex : 0) % imagePool.length] ?? null;
}

// ─── FIX: improved buildProductDetailUrl with first-color fallback ────────────
function buildProductDetailUrl(
  item: Pick<Item, "id" | "primaryImage" | "colors">,
  displayImage?: string | null
) {
  const params = new URLSearchParams({ id: String(item.id) });
  const colors = item.colors ?? [];

  // Try matching by item.primaryImage first, then by displayImage, then just take
  // the first color that has a valid id — this last fallback is the key fix for
  // items whose primaryImage is null (common on the category page).
  const matchedColor =
    colors.find((c) => c.id != null && c.primaryImage === item.primaryImage) ??
    (displayImage
      ? colors.find((c) => c.id != null && c.primaryImage === displayImage)
      : undefined) ??
    colors.find((c) => c.id != null) ?? // ← KEY FIX: always encode first valid color
    undefined;

  if (matchedColor?.id != null) params.set("colorId", String(matchedColor.id));
  if (matchedColor?.colorName?.trim()) params.set("color", matchedColor.colorName.trim());

  return `/product?${params.toString()}`;
}

// ─── FIX: wishlist helper that saves the correct color image ─────────────────
function wishlistItemWithColor(item: Item, displayImage?: string | null) {
  const selection = getResolvedSelection(item, displayImage);

  return {
    ...wishlistItemFromItem(item),
    itemId: item.id,
    primaryImage: selection.primaryImage,
    colorId: selection.colorId,
    colorName: selection.colorName,
  };
}

function renderStars(rating: number) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.4;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <>
      {Array.from({ length: full  }).map((_, i) => <i key={`f${i}`} className="fas fa-star" />)}
      {half ? <i className="fas fa-star-half-alt" /> : null}
      {Array.from({ length: empty }).map((_, i) => <i key={`e${i}`} className="far fa-star" />)}
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CategoryPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { addItem, totalQuantity } = useCart();
  const { itemCount: wishlistCount, hasItem, toggleItem } = useWishlist();

  const categorySlug =
    searchParams.get("category") ?? searchParams.get("slug") ?? undefined;
  const categoryId =
    searchParams.get("categoryId") ?? searchParams.get("id") ?? undefined;

  const {
    category,
    allItems,
    loading,
    error,
    availableBrands,
    availableItemGroups,
    filters,
    sortValue,
    filteredItems,
    toggleBrand,
    togglePriceRange,
    toggleItemGroup,
    toggleStockState,
    setSearch,
    setSortValue,
    clearFilters,
    activeFilterTags,
    currentPage,
    setCurrentPage,
    pagination,
  } = useCategoryPage(categorySlug, categoryId);

  useEffect(() => {
    const pageTitle = category?.name
      ? `${category.name} Products | Motabhai Electronics`
      : "All Products | Motabhai Electronics";
    document.title = pageTitle;
  }, [category]);

  // ── UI-only state ────────────────────────────────────────────────────────
  type ViewMode = "grid" | "list";
  const [scrolled,          setScrolled         ] = useState(false);
  const [showTop,           setShowTop          ] = useState(false);
  const [currentView,       setCurrentView      ] = useState<ViewMode>("grid");
  const [brandSearch,       setBrandSearch      ] = useState("");
  const [itemGroupSearch,   setItemGroupSearch  ] = useState("");
  const [compareList,       setCompareList      ] = useState<string[]>([]);
  const [quickViewItem,     setQuickViewItem    ] = useState<Item | null>(null);
  const [showCompareModal,  setShowCompareModal ] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [toast,             setToast            ] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState({
    brand: false,
    price: false,
    itemGroup: false,
    stock: false,
  });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
      setShowTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (quickViewItem || showCompareModal || mobileFiltersOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.removeProperty("overflow");
    }
    return () => {
      document.body.style.removeProperty("overflow");
    };
  }, [quickViewItem, showCompareModal, mobileFiltersOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setQuickViewItem(null);
        setShowCompareModal(false);
        setMobileFiltersOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── pagination slice ───────────────────────────────────────────────────────
  const PAGE_SIZE = 16;
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE) || 1;

  // ── compare helpers ────────────────────────────────────────────────────────
  const compareItems = compareList
    .map((id) => filteredItems.find((i) => String(i.id) === id))
    .filter(Boolean) as Item[];

  function toggleCompare(id: string, name: string) {
    setCompareList((cur) => {
      if (cur.includes(id)) { setToast(`${name} removed from compare`); return cur.filter((x) => x !== id); }
      if (cur.length >= 4)  { setToast("You can compare up to 4 products"); return cur; }
      setToast(`${name} added to compare`);
      return [...cur, id];
    });
  }

  // ─── FIX: toggleWishlist now saves the correct color image ────────────────
  function toggleWishlist(item: Item) {
    const displayImage = getFamilyImage(item, allItems);
    const wItem = wishlistItemWithColor(item, displayImage);
    const added = toggleItem(wItem);
    setToast(added ? `${item.itemName} added to wishlist` : `${item.itemName} removed from wishlist`);
  }

  // ─── FIX: hasItem now checks the compound color-aware id ─────────────────
  function isWishlisted(item: Item): boolean {
    const displayImage = getFamilyImage(item, allItems);
    return hasItem(getResolvedSelection(item, displayImage).wishlistId);
  }

  async function handleShare(item: Item) {
    const url = `${window.location.origin}${buildProductDetailUrlForItem(item, getFamilyImage(item, allItems))}`;
    try { await navigator.clipboard.writeText(url); setToast(`${item.itemName} link copied`); }
    catch { setToast("Could not copy link"); }
  }

  function handleAddToCart(item: Item) {
    addItem(cartItemFromItem(item));
    setToast(`${item.itemName} added to cart`);
  }

  function handleBuyNow(item: Item) {
    addItem(cartItemFromItem(item));
    router.push("/cart");
  }

  // ── filter panel ─────────────────────────────────────────────────────────
  const filteredBrands = availableBrands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  );
  const filteredItemGroups = availableItemGroups.filter((group) =>
    group.name.toLowerCase().includes(itemGroupSearch.toLowerCase())
  );

  function renderFilterPanel() {
    return (
      <>
        {/* Brand */}
        <div className={`filter-card${collapsed.brand ? " collapsed" : ""}`}>
          <button className="filter-card-head" type="button"
            onClick={() => setCollapsed((c) => ({ ...c, brand: !c.brand }))}>
            <h3><i className="fas fa-tags" />Brand</h3>
            <i className="fas fa-chevron-down filter-toggle" />
          </button>
          <div className="filter-card-body">
            <div className="filter-search">
              <i className="fas fa-search" />
              <input type="text" placeholder="Search brand..."
                value={brandSearch} onChange={(e) => setBrandSearch(e.target.value)} />
            </div>
            {loading && (
              <p style={{ fontSize: "0.8rem", color: "var(--gray-400)", padding: "4px 0" }}>
                Loading brands…
              </p>
            )}
            {!loading && filteredBrands.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--gray-400)", padding: "4px 0" }}>
                No brands found
              </p>
            )}
            {filteredBrands.map((brand) => (
              <label key={brand.id} className="filter-option">
                <span className="filter-checkbox">
                  <input type="checkbox"
                    checked={filters.brands.includes(brand.id)}
                    onChange={() => toggleBrand(brand.id)} />
                  <span className="filter-label">{brand.name}</span>
                </span>
                <span className="filter-count">{brand.count}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Price */}
        <div className={`filter-card${collapsed.price ? " collapsed" : ""}`}>
          <button className="filter-card-head" type="button"
            onClick={() => setCollapsed((c) => ({ ...c, price: !c.price }))}>
            <h3><i className="fas fa-indian-rupee-sign" />Price Range</h3>
            <i className="fas fa-chevron-down filter-toggle" />
          </button>
          <div className="filter-card-body">
            {PRICE_RANGES.map((range) => (
              <label key={range.value} className="filter-option">
                <span className="filter-checkbox">
                  <input type="checkbox"
                    checked={filters.priceRanges.includes(range.value)}
                    onChange={() => togglePriceRange(range.value)} />
                  <span className="filter-label">{range.label}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className={`filter-card${collapsed.itemGroup ? " collapsed" : ""}`}>
          <button className="filter-card-head" type="button"
            onClick={() => setCollapsed((c) => ({ ...c, itemGroup: !c.itemGroup }))}>
            <h3><i className="fas fa-layer-group" />Item Group</h3>
            <i className="fas fa-chevron-down filter-toggle" />
          </button>
          <div className="filter-card-body">
            <div className="filter-search">
              <i className="fas fa-search" />
              <input type="text" placeholder="Search item group..."
                value={itemGroupSearch} onChange={(e) => setItemGroupSearch(e.target.value)} />
            </div>
            {!loading && filteredItemGroups.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--gray-400)", padding: "4px 0" }}>
                No item groups found
              </p>
            )}
            {filteredItemGroups.map((group) => (
              <label key={group.id} className="filter-option">
                <span className="filter-checkbox">
                  <input type="checkbox"
                    checked={filters.itemGroups.includes(group.id)}
                    onChange={() => toggleItemGroup(group.id)} />
                  <span className="filter-label">{group.name}</span>
                </span>
                <span className="filter-count">{group.count}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={`filter-card${collapsed.stock ? " collapsed" : ""}`}>
          <button className="filter-card-head" type="button"
            onClick={() => setCollapsed((c) => ({ ...c, stock: !c.stock }))}>
            <h3><i className="fas fa-box-open" />Opening Stock</h3>
            <i className="fas fa-chevron-down filter-toggle" />
          </button>
          <div className="filter-card-body">
            {STOCK_FILTERS.map((stock) => (
              <label key={stock.value} className="filter-option">
                <span className="filter-checkbox">
                  <input type="checkbox"
                    checked={filters.stockStates.includes(stock.value)}
                    onChange={() => toggleStockState(stock.value)} />
                  <span className="filter-label">{stock.label}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── card renderers ────────────────────────────────────────────────────────
  function renderGridCard(item: Item) {
    const itemId    = String(item.id);
    const inCompare = compareList.includes(itemId);
    const price     = getItemOfferPrice(item);
    const mrp       = getMrp(item);
    const disc      = getDiscount(item);
    const familyImage = getFamilyImage(item, allItems);
    const itemHref    = buildProductDetailUrlForItem(item, familyImage);
    const img         = getImageUrl(familyImage, "/placeholder.svg");
    const wished      = isWishlisted(item); // ← FIX: color-aware wishlist check

    return (
      <div key={item.id} className="product-card">
        <div className="p-badge-row">
          {disc > 0 && <span className="p-badge sale">-{disc}%</span>}
        </div>
        <button className={`p-wishlist${wished ? " active" : ""}`} type="button"
          onClick={() => toggleWishlist(item)}>
          <i className={`${wished ? "fas" : "far"} fa-heart`} />
        </button>
        <div className="p-image">
          <Link href={itemHref} className="p-image-link">
            <img src={img} alt={item.itemName} />
          </Link>
          <div className="p-image-overlay">
            <button className="overlay-action" type="button"
              onClick={() => setQuickViewItem(item)}><i className="fas fa-eye" /></button>
            <button className="overlay-action" type="button"
              onClick={() => toggleCompare(itemId, item.itemName)}><i className="fas fa-code-compare" /></button>
            <button className="overlay-action" type="button"
              onClick={() => handleShare(item)}><i className="fas fa-share-nodes" /></button>
          </div>
        </div>
        <div className="p-info">
          <div className="p-brand-row">
            <span className="p-brand">{item.brandName ?? "—"}</span>
            <span className="p-stock" style={{ color: isItemInStock(item) ? "var(--green-600)" : "var(--gray-400)", fontSize: "0.72rem" }}>
              {isItemInStock(item) ? "In Stock" : "Out of Stock"}
            </span>
          </div>
          <h3 className="p-name">
            <Link href={itemHref}>{item.itemName}</Link>
          </h3>
          {item.categoryName && (
            <div className="p-specs" style={{ marginTop: 6 }}>
              <span className="p-spec-chip"><i className="fas fa-tag" />{item.categoryName}</span>
              {item.gst > 0 && (
                <span className="p-spec-chip"><i className="fas fa-percent" />GST {item.gst}%</span>
              )}
            </div>
          )}
          <div className="p-price" style={{ marginTop: 10 }}>
            {price > 0 ? (
              <>
                <span className="cur">{formatPrice(price)}</span>
                {mrp > price && <span className="orig">{formatPrice(mrp)}</span>}
                {disc > 0 && <span className="off">{disc}% off</span>}
              </>
            ) : (
              <span style={{ color: "var(--gray-400)", fontSize: "0.82rem" }}>Price on request</span>
            )}
          </div>
          <div className="p-utility-row">
            <button className={`cmp-card-check${inCompare ? " checked" : ""}`} type="button"
              onClick={() => toggleCompare(itemId, item.itemName)}>
              <i className={`fas fa-${inCompare ? "check" : "code-compare"}`} />
              Compare
            </button>
          </div>
          <div className="p-actions">
            <button className="btn-cart" type="button"
              onClick={() => handleAddToCart(item)}>
              <i className="fas fa-cart-plus" />Add to Cart
            </button>
            <button className="btn-buy" type="button"
              onClick={() => handleBuyNow(item)}>
              Buy
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderListCard(item: Item) {
    const itemId    = String(item.id);
    const inCompare = compareList.includes(itemId);
    const price     = getItemOfferPrice(item);
    const mrp       = getMrp(item);
    const disc      = getDiscount(item);
    const familyImage = getFamilyImage(item, allItems);
    const itemHref    = buildProductDetailUrlForItem(item, familyImage);
    const img         = getImageUrl(familyImage, "/placeholder.svg");
    const wished      = isWishlisted(item); // ← FIX: color-aware wishlist check

    return (
      <div key={item.id} className="product-list-card">
        <div className="list-image">
          <Link href={itemHref} className="p-image-link">
            <img src={img} alt={item.itemName} />
          </Link>
        </div>
        <div className="list-body">
          <div className="list-info">
            <div className="list-brand">{item.brandName ?? "—"}</div>
            <h3 className="list-name">
              <Link href={itemHref}>{item.itemName}</Link>
            </h3>
            <div className="list-highlights" style={{ marginTop: 8 }}>
              {item.categoryName && <span className="list-chip">{item.categoryName}</span>}
              {item.gst > 0 && <span className="list-chip">GST {item.gst}%</span>}
              {item.hasDemoInstallation && <span className="list-chip">Demo Available</span>}
            </div>
          </div>
          <div className="list-right">
            <div className="list-price-block">
              {price > 0 ? (
                <>
                  <div className="cur">{formatPrice(price)}</div>
                  {mrp > price && <div className="orig">{formatPrice(mrp)}</div>}
                  {disc > 0 && <span className="off-badge">{disc}% off</span>}
                </>
              ) : (
                <div style={{ color: "var(--gray-400)", fontSize: "0.82rem" }}>Price on request</div>
              )}
            </div>
            <div className="list-btns">
              <button className="list-cart-btn" type="button"
                onClick={() => handleAddToCart(item)}>
                <i className="fas fa-cart-plus" />Add to Cart
              </button>
              <button className="list-buy-btn" type="button"
                onClick={() => handleBuyNow(item)}>
                <i className="fas fa-bolt" />Buy Now
              </button>
              <button className={`list-secondary-btn${wished ? " active" : ""}`} type="button"
                onClick={() => toggleWishlist(item)}>
                <i className={`${wished ? "fas" : "far"} fa-heart`} />Wishlist
              </button>
              <button className="list-secondary-btn" type="button"
                onClick={() => setQuickViewItem(item)}>
                <i className="fas fa-eye" />Quick View
              </button>
              <button className={`list-secondary-btn${inCompare ? " active" : ""}`} type="button"
                onClick={() => toggleCompare(itemId, item.itemName)}>
                <i className="fas fa-code-compare" />Compare
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── pagination ────────────────────────────────────────────────────────────
  function renderPagination() {
    if (totalPages <= 1) return null;
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return (
      <div className="pagination">
        <button className="page-btn arrow" type="button"
          disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>
          <i className="fas fa-chevron-left" />
        </button>
        {pages.map((p, idx) =>
          p === "..." ? (
            <span key={`dots-${idx}`} className="page-dots">...</span>
          ) : (
            <button key={p} className={`page-btn${currentPage === p ? " active" : ""}`}
              type="button" onClick={() => setCurrentPage(p as number)}>{p}</button>
          )
        )}
        <button className="page-btn arrow" type="button"
          disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>
          <i className="fas fa-chevron-right" />
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="category-page">
      {/* Breadcrumb */}
      <div className="breadcrumb-bar">
        <nav className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep"><i className="fas fa-chevron-right" /></span>
          {category ? (
            <>
              <Link href="/products">Categories</Link>
              <span className="sep"><i className="fas fa-chevron-right" /></span>
              <span className="current">{category.name}</span>
            </>
          ) : (
            <span className="current">All Products</span>
          )}
        </nav>
      </div>

      {/* Banner */}
      <div className="category-banner">
        <div className="category-banner-inner">
          <div>
            <h1 className="banner-title">
              {category?.name ?? "All Products"}{" "}
              <span>Best Deals 2026</span>
            </h1>
            <p className="banner-subtitle">
              {category?.description ??
                `Explore ${pagination.total}+ products with best prices and genuine warranty.`}
            </p>
          </div>
          <div className="banner-stats">
            <div className="banner-stat">
              <div className="stat-num">{pagination.total}+</div>
              <div className="stat-label">Products</div>
            </div>
            <div className="banner-stat">
              <div className="stat-num">{availableBrands.length}</div>
              <div className="stat-label">Brands</div>
            </div>
          </div>
        </div>
      </div>

      {/* Active filters bar */}
      <div className={`active-filters-bar${activeFilterTags.length ? " has-filters" : ""}`}>
        <div className="active-filters-inner">
          <span className="active-filters-label">Active Filters:</span>
          {activeFilterTags.map((tag) => (
            <button key={`${tag.key}-${tag.value}`} className="filter-tag" type="button"
              onClick={() => {
                if (tag.key === "brands")      toggleBrand(tag.value);
                else if (tag.key === "priceRanges") togglePriceRange(tag.value);
                else if (tag.key === "itemGroups") toggleItemGroup(tag.value);
                else if (tag.key === "stockStates") toggleStockState(tag.value);
                else if (tag.key === "search") setSearch("");
              }}>
              <span>{tag.label}</span><i className="fas fa-times" />
            </button>
          ))}
          {activeFilterTags.length > 0 && (
            <button className="clear-all-btn" type="button" onClick={clearFilters}>Clear All</button>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="shop-layout">
        <aside className="sidebar">{renderFilterPanel()}</aside>

        <div className="main-content">
          {/* Controls */}
          <div className="controls-bar">
            <button className="mobile-filter-btn" type="button"
              onClick={() => setMobileFiltersOpen(true)}>
              <i className="fas fa-sliders" />Filters
              {activeFilterTags.length > 0 && (
                <span className="mobile-filter-count">{activeFilterTags.length}</span>
              )}
            </button>
            <span className="results-count">
              Showing <b>{pagedItems.length}</b> of <b>{filteredItems.length}</b> products
            </span>
            <div className="sort-section">
              <span className="sort-label">Sort by:</span>
              <select className="sort-select" value={sortValue}
                onChange={(e) => setSortValue(e.target.value as SortValue)}>
                <option value="relevance">Relevance</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
            </div>
            <div className="view-toggle">
              <button className={`view-btn${currentView === "grid" ? " active" : ""}`}
                type="button" onClick={() => setCurrentView("grid")}>
                <i className="fas fa-th-large" />
              </button>
              <button className={`view-btn${currentView === "list" ? " active" : ""}`}
                type="button" onClick={() => setCurrentView("list")}>
                <i className="fas fa-list" />
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="no-results" style={{ padding: "60px 20px" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "2rem", color: "var(--primary)" }} />
              <h3 style={{ marginTop: 16 }}>Loading products…</h3>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="no-results">
              <i className="fas fa-exclamation-circle" style={{ color: "var(--primary)" }} />
              <h3>Failed to load products</h3>
              <p>{error}</p>
              <button type="button" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filteredItems.length === 0 && (
            <div className="no-results">
              <i className="fas fa-search" />
              <h3>No products found</h3>
              <p>Try adjusting your filters or search query.</p>
              <button type="button" onClick={clearFilters}>Clear All Filters</button>
            </div>
          )}

          {/* Products */}
          {!loading && !error && pagedItems.length > 0 && (
            currentView === "grid" ? (
              <div className="products-grid">{pagedItems.map(renderGridCard)}</div>
            ) : (
              <div className="products-list">{pagedItems.map(renderListCard)}</div>
            )
          )}

          {renderPagination()}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFiltersOpen && (
        <>
          <div className="sidebar-overlay open" role="presentation"
            onClick={() => setMobileFiltersOpen(false)} />
          <div className="mobile-sidebar open">
            <div className="mobile-sidebar-head">
              <h3><i className="fas fa-sliders" />Filters</h3>
              <button className="mobile-sidebar-close" type="button"
                onClick={() => setMobileFiltersOpen(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="mobile-sidebar-content">{renderFilterPanel()}</div>
            <div className="mobile-sidebar-footer">
              <button className="ms-clear" type="button" onClick={clearFilters}>Clear</button>
              <button className="ms-apply" type="button"
                onClick={() => setMobileFiltersOpen(false)}>Apply</button>
            </div>
          </div>
        </>
      )}

      {/* Quick view modal */}
      {quickViewItem && (
        <div className="modal-overlay open" role="presentation"
          onClick={() => setQuickViewItem(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setQuickViewItem(null)}>
              <i className="fas fa-times" />
            </button>
            <div className="qv-body">
              <div className="qv-gallery">
                <img className="qv-main-img"
                  src={getImageUrl(getFamilyImage(quickViewItem, allItems), "/placeholder.svg")} alt={quickViewItem.itemName} />
              </div>
              <div className="qv-info">
                <div className="qv-brand-badge">
                  <i className="fas fa-certificate" />{quickViewItem.brandName}
                </div>
                <h2 className="qv-name">{quickViewItem.itemName}</h2>
                {quickViewItem.categoryName && (
                  <p className="qv-subtitle">{quickViewItem.categoryName}</p>
                )}
                <div className="qv-price">
                  {getItemOfferPrice(quickViewItem) > 0 ? (
                    <>
                      <span className="cur">{formatPrice(getItemOfferPrice(quickViewItem))}</span>
                      {getMrp(quickViewItem) > getItemOfferPrice(quickViewItem) && (
                        <span className="orig">{formatPrice(getMrp(quickViewItem))}</span>
                      )}
                      {getDiscount(quickViewItem) > 0 && (
                        <span className="off">{getDiscount(quickViewItem)}% off</span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--gray-400)" }}>Price on request</span>
                  )}
                </div>
                <div className="qv-chips">
                  {quickViewItem.gst > 0 && (
                    <span className="qv-chip">GST {quickViewItem.gst}%</span>
                  )}
                  {quickViewItem.hasDemoInstallation && (
                    <span className="qv-chip">Demo Available</span>
                  )}
                  <span className="qv-chip" style={{ color: isItemInStock(quickViewItem) ? "var(--green-600)" : "var(--gray-500)" }}>
                    {isItemInStock(quickViewItem) ? "In Stock" : "Out of Stock"}
                  </span>
                </div>
                <div className="qv-actions">
                  <button className="qv-btn-cart" type="button"
                    onClick={() => handleAddToCart(quickViewItem)}>
                    <i className="fas fa-cart-plus" />Add to Cart
                  </button>
                  <button className="qv-btn-detail" type="button"
                    onClick={() => router.push(buildProductDetailUrlForItem(
                      quickViewItem,
                      getFamilyImage(quickViewItem, allItems)
                    ))}>
                    <i className="fas fa-arrow-right" />View Full Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compare bar */}
      {compareItems.length > 0 && (
        <div className="compare-bar visible">
          <div className="compare-bar-label"><b>Compare Products</b>Select up to 4</div>
          <div className="compare-slots">
            {Array.from({ length: 4 }).map((_, idx) => {
              const item = compareItems[idx];
              return (
                <div key={idx} className={`compare-slot${item ? " filled" : ""}`}>
                  {item ? (
                    <>
                      <img className="cs-img" src={getImageUrl(getFamilyImage(item, allItems), "/placeholder.svg")} alt={item.itemName} />
                      <button className="cs-remove" type="button"
                        onClick={() => toggleCompare(String(item.id), item.itemName)}>
                        <i className="fas fa-times" />
                      </button>
                    </>
                  ) : (
                    <i className="fas fa-plus cs-empty-icon" />
                  )}
                </div>
              );
            })}
          </div>
          <button className="compare-now-btn" type="button"
            disabled={compareItems.length < 2} onClick={() => setShowCompareModal(true)}>
            <i className="fas fa-table-columns" />Compare Now
          </button>
          <button className="compare-clear-btn" type="button" onClick={() => setCompareList([])}>
            <i className="fas fa-times" />Clear
          </button>
        </div>
      )}

      {/* Compare modal */}
      {showCompareModal && (
        <div className="compare-modal open" role="presentation"
          onClick={() => setShowCompareModal(false)}>
          <div className="compare-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="compare-modal-head">
              <h2><i className="fas fa-code-compare" />Compare Products</h2>
              <button className="cmp-close" type="button" onClick={() => setShowCompareModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th className="row-label">Specification</th>
                    {compareItems.map((item) => (
                      <th key={item.id} className="cmp-product-col">
                        <img className="cmp-product-img" src={getImageUrl(getFamilyImage(item, allItems), "/placeholder.svg")} alt={item.itemName} />
                        <div className="cmp-product-brand">{item.brandName}</div>
                        <div className="cmp-product-name">{item.itemName}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Brand",    (i: Item) => i.brandName ?? "—"],
                    ["Category", (i: Item) => i.categoryName ?? "—"],
                    ["Price",    (i: Item) => getItemOfferPrice(i) > 0 ? formatPrice(getItemOfferPrice(i)) : "On request"],
                    ["GST",      (i: Item) => `${i.gst}%`],
                    ["Demo",     (i: Item) => i.hasDemoInstallation ? "Yes" : "No"],
                  ].map(([label, fn]) => (
                    <tr key={label as string}>
                      <td className="row-label">{label as string}</td>
                      {compareItems.map((item) => (
                        <td key={item.id}>{(fn as (i: Item) => string)(item)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-wrap">
          <div className="toast"><i className="fas fa-check-circle" />{toast}</div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="footer-logo-text">MOTABHAI</div>
            <p>Your one-stop destination for the latest electronics, mobile phones, laptops, and home appliances at the best prices with genuine warranty.</p>
            <div className="footer-social">
              {footerSocialIcons.map((icon) => (
                <a key={icon} href="#" aria-label={icon}><i className={`fab ${icon}`} /></a>
              ))}
            </div>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title} className="footer-col">
              <h4>{group.title}</h4>
              {group.links.map((link) => <a key={link.label} href={link.href}>{link.label}</a>)}
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <p>© 2026 Motabhai Electronics. All rights reserved.</p>
          <div className="footer-payments">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </footer>

      <button className={`back-to-top${showTop ? " visible" : ""}`} type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <i className="fas fa-arrow-up" />
      </button>
    </div>
  );
}
