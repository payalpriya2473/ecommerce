"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  footerGroups,
} from "@/lib/data/homePageData";
import {
  COMPANY_ID,
  Category,
  Item,
  getCategoryUrl,
  getImageUrl,
  getItemDiscountPercent,
  getItemOfferPrice,
  getItemOriginalPrice,
  publicCategoryAPI,
  publicItemAPI,
  slugifyCategoryName,
} from "@/lib/api/publicApi";
import { cartItemFromItem, useCart } from "@/lib/cart/cart-context";
import { useWishlist, wishlistItemFromItem } from "@/lib/wishlist/wishlist-context";
import "./Searchpage.css";

type SortValue = "relevance" | "price-asc" | "price-desc" | "name";
type ViewMode = "grid" | "list";
type PriceRange = "all" | "0-15000" | "15000-30000" | "30000-60000" | "60000-100000" | "100000-plus";

interface Toast {
  id: number;
  message: string;
  type: "success" | "warning" | "info";
}

const ITEMS_PER_PAGE = 12;

const CATEGORY_ALIASES: Record<string, string[]> = {
  mobiles: ["mobile", "mobiles", "moblie", "phone", "phones", "smartphone", "smartphones"],
  tvs: ["tv", "tvs", "television", "televisions", "smarttv", "smarttvs"],
  laptops: ["laptop", "laptops", "notebook", "pc", "computer", "computers"],
  appliances: ["appliance", "appliances", "fridge", "refrigerator", "washingmachine", "washingmachines", "ac"],
  audio: ["audio", "speaker", "speakers", "headphone", "headphones", "earbuds", "earphone"],
  tablets: ["tablet", "tablets", "ipad", "ipads"],
  accessories: ["accessory", "accessories", "charger", "chargers", "cable", "cables"],
};

const PRICE_RANGES = [
  { value: "all",           label: "All Prices" },
  { value: "0-15000",       label: "Under Rs 15,000" },
  { value: "15000-30000",   label: "Rs 15,000 – Rs 30,000" },
  { value: "30000-60000",   label: "Rs 30,000 – Rs 60,000" },
  { value: "60000-100000",  label: "Rs 60,000 – Rs 1,00,000" },
  { value: "100000-plus",   label: "Above Rs 1,00,000" },
];

function formatPrice(value: number) {
  return `Rs ${Math.max(0, value).toLocaleString("en-IN")}`;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getDerivedMrp(item: Item) {
  return getItemOriginalPrice(item);
}

function getDiscount(item: Item) {
  return getItemDiscountPercent(item);
}

function resolveCategoryQuery(query: string, categories: Category[]) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return null;

  return (
    categories.find((category) => {
      const slug = normalizeText(category.slug || slugifyCategoryName(category.name));
      const name = normalizeText(category.name);
      const aliasHit = Object.entries(CATEGORY_ALIASES).some(([canonical, aliases]) => {
        const group = [canonical, ...aliases].map(normalizeText);
        return (
          group.includes(normalizedQuery) &&
          (slug.includes(normalizeText(canonical)) || name.includes(normalizeText(canonical)))
        );
      });
      return (
        aliasHit ||
        slug === normalizedQuery ||
        name === normalizedQuery ||
        slug.includes(normalizedQuery) ||
        name.includes(normalizedQuery)
      );
    }) ?? null
  );
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = (searchParams?.get("q") || "").trim();

  const [query, setQuery]               = useState(initialQuery);
  const [sortBy, setSortBy]             = useState<SortValue>("relevance");
  const [viewMode, setViewMode]         = useState<ViewMode>("grid");
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [allItems, setAllItems]         = useState<Item[]>([]);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [matchedCategory, setMatchedCategory] = useState<Category | null>(null);

  // filters
  const [selectedBrands, setSelectedBrands]         = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [priceRange, setPriceRange]                 = useState<PriceRange>("all");
  const [inStockOnly, setInStockOnly]               = useState(false);
  const [onSaleOnly, setOnSaleOnly]                 = useState(false);
  const [brandSearch, setBrandSearch]               = useState("");

  // UI
  const [compareList, setCompareList]             = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal]   = useState(false);
  const [quickViewItem, setQuickViewItem]         = useState<Item | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showTop, setShowTop]                     = useState(false);
  const [currentPage, setCurrentPage]             = useState(1);
  const [toasts, setToasts]                       = useState<Toast[]>([]);
  const [collapsed, setCollapsed]                 = useState({ brand: false, price: false, availability: false });

  const { addItem: addCartItem } = useCart();
  const { hasItem, toggleItem }  = useWishlist();

  // scroll
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // escape key
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

  // body overflow lock
  useEffect(() => {
    if (quickViewItem || showCompareModal || mobileFiltersOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.removeProperty("overflow");
    }
    return () => { document.body.style.removeProperty("overflow"); };
  }, [quickViewItem, showCompareModal, mobileFiltersOpen]);

  // sync query
  useEffect(() => {
    setQuery(initialQuery);
    setCurrentPage(1);
  }, [initialQuery]);

  // data fetch
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const fetchedCategories = await publicCategoryAPI.getAll({
          companyId: COMPANY_ID || undefined,
          showOnWebsite: true,
        });

        if (cancelled) return;

        const trimmedQuery    = initialQuery.trim();
        const categoryMatch   = trimmedQuery ? resolveCategoryQuery(trimmedQuery, fetchedCategories) : null;

        const itemsResponse = await publicItemAPI.getAll({
          companyId:  COMPANY_ID || undefined,
          categoryId: categoryMatch?.id,
          search:     categoryMatch ? undefined : trimmedQuery || undefined,
          page:  1,
          limit: 500,
        });

        if (cancelled) return;

        setCategories(fetchedCategories);
        setMatchedCategory(categoryMatch);
        setAllItems(itemsResponse.items);
      } catch (loadError: unknown) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load search results");
        setAllItems([]);
        setMatchedCategory(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [initialQuery]);

  // reset filters on query change
  useEffect(() => {
    setSelectedBrands([]);
    setSelectedCategories([]);
    setPriceRange("all");
    setInStockOnly(false);
    setOnSaleOnly(false);
    setCurrentPage(1);
  }, [initialQuery]);

  // ── derived data ──────────────────────────────────────────────────────────

  const suggestionTags = useMemo(() => {
    const live = categories.slice(0, 6).map((c) => c.name);
    return live.length ? live : ["Mobiles", "TVs", "Laptops", "Appliances"];
  }, [categories]);

  const availableBrands = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach((item) => {
      const name = item.brandName?.trim();
      if (!name) return;
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  const availableCategories = useMemo(() => {
    const map = new Map<string, number>();
    allItems.forEach((item) => {
      const name = item.categoryName?.trim();
      if (!name) return;
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allItems]);

  const filteredBrands = availableBrands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase())
  );

  const filteredItems = useMemo(() => {
    const queryText = query.trim().toLowerCase();

    return allItems.filter((item) => {
      const offerPrice = getItemOfferPrice(item);
      const discount   = getDiscount(item);

      const matchesQuery =
        !queryText ||
        [item.itemName, item.brandName, item.categoryName, item.variant]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(queryText)) ||
        Boolean(matchedCategory);

      const matchesBrand     = selectedBrands.length === 0 || (item.brandName ? selectedBrands.includes(item.brandName) : false);
      const matchesCategory  = selectedCategories.length === 0 || (item.categoryName ? selectedCategories.includes(item.categoryName) : false);
      const matchesStock     = !inStockOnly || item.isActive;
      const matchesSale      = !onSaleOnly  || discount > 0;
      const matchesPrice =
        priceRange === "all" ||
        (priceRange === "0-15000"       && offerPrice <= 15000) ||
        (priceRange === "15000-30000"   && offerPrice > 15000  && offerPrice <= 30000) ||
        (priceRange === "30000-60000"   && offerPrice > 30000  && offerPrice <= 60000) ||
        (priceRange === "60000-100000"  && offerPrice > 60000  && offerPrice <= 100000) ||
        (priceRange === "100000-plus"   && offerPrice > 100000);

      return matchesQuery && matchesBrand && matchesCategory && matchesStock && matchesSale && matchesPrice;
    });
  }, [allItems, inStockOnly, matchedCategory, onSaleOnly, priceRange, query, selectedBrands, selectedCategories]);

  const sortedItems = useMemo(() => {
    const next = [...filteredItems];
    next.sort((a, b) => {
      if (sortBy === "price-asc")  return getItemOfferPrice(a) - getItemOfferPrice(b);
      if (sortBy === "price-desc") return getItemOfferPrice(b) - getItemOfferPrice(a);
      if (sortBy === "name")       return a.itemName.localeCompare(b.itemName);
      return 0;
    });
    return next;
  }, [filteredItems, sortBy]);

  const totalPages    = Math.max(1, Math.ceil(sortedItems.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedItems.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, sortedItems]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  // ── active filter tags ────────────────────────────────────────────────────

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: string; value: string; label: string }> = [];
    selectedBrands.forEach((b)     => tags.push({ key: "brand",    value: b,          label: `Brand: ${b}` }));
    selectedCategories.forEach((c) => tags.push({ key: "category", value: c,          label: `Category: ${c}` }));
    if (priceRange !== "all") {
      const found = PRICE_RANGES.find((r) => r.value === priceRange);
      if (found) tags.push({ key: "price", value: priceRange, label: found.label });
    }
    if (inStockOnly) tags.push({ key: "stock", value: "inStock", label: "In Stock Only" });
    if (onSaleOnly)  tags.push({ key: "sale",  value: "onSale",  label: "On Sale" });
    return tags;
  }, [selectedBrands, selectedCategories, priceRange, inStockOnly, onSaleOnly]);

  const activeFilterCount = activeFilterTags.length;
  const summaryLabel      = matchedCategory?.name || query || "All Products";

  // ── helpers ───────────────────────────────────────────────────────────────

  const showToast = (message: string, type: Toast["type"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  };

  function runQuickSearch(value: string) {
    router.push(`/search?q=${encodeURIComponent(value)}`);
  }

  function toggleBrand(name: string) {
    setCurrentPage(1);
    setSelectedBrands((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name]
    );
  }

  function toggleCategory(name: string) {
    setCurrentPage(1);
    setSelectedCategories((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function clearAllFilters() {
    setSelectedBrands([]);
    setSelectedCategories([]);
    setPriceRange("all");
    setInStockOnly(false);
    setOnSaleOnly(false);
    setCurrentPage(1);
  }

  function removeFilterTag(tag: { key: string; value: string }) {
    if (tag.key === "brand")    toggleBrand(tag.value);
    if (tag.key === "category") toggleCategory(tag.value);
    if (tag.key === "price")    { setPriceRange("all"); setCurrentPage(1); }
    if (tag.key === "stock")    { setInStockOnly(false); setCurrentPage(1); }
    if (tag.key === "sale")     { setOnSaleOnly(false);  setCurrentPage(1); }
  }

  function handleToggleWishlist(item: Item) {
    const added = toggleItem(wishlistItemFromItem(item));
    showToast(
      added ? `${item.itemName} added to wishlist` : `${item.itemName} removed from wishlist`,
      added ? "success" : "warning"
    );
  }

  function toggleCompare(item: Item) {
    const itemId = String(item.id);
    setCompareList((current) => {
      if (current.includes(itemId)) {
        showToast(`${item.itemName} removed from compare`, "warning");
        return current.filter((id) => id !== itemId);
      }
      if (current.length >= 4) {
        showToast("You can compare up to 4 products", "warning");
        return current;
      }
      showToast(`${item.itemName} added to compare`, "info");
      return [...current, itemId];
    });
  }

  function handleAddToCart(item: Item) {
    if (!item.isActive) { showToast("This product is currently unavailable", "warning"); return; }
    addCartItem(cartItemFromItem(item));
    showToast(`${item.itemName} added to cart`);
  }

  function handleBuyNow(item: Item) {
    if (!item.isActive) { showToast("This product is currently unavailable", "warning"); return; }
    addCartItem(cartItemFromItem(item));
    router.push("/cart");
  }

  async function handleShare(item: Item) {
    const url = `${window.location.origin}/product?id=${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`${item.itemName} link copied`);
    } catch {
      showToast("Could not copy link", "warning");
    }
  }

  const compareItems = compareList
    .map((id) => allItems.find((i) => String(i.id) === id))
    .filter(Boolean) as Item[];

  // ── filter panel ─────────────────────────────────────────────────────────

  function renderFilterPanel() {
    return (
      <>
        {/* Brand */}
        <div className={`srp-filter-card${collapsed.brand ? " collapsed" : ""}`}>
          <button
            className="srp-filter-card-head"
            type="button"
            onClick={() => setCollapsed((c) => ({ ...c, brand: !c.brand }))}
          >
            <h3><i className="fas fa-tags" />Brand</h3>
            <i className="fas fa-chevron-down srp-filter-toggle" />
          </button>
          <div className="srp-filter-card-body">
            <div className="srp-filter-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search brand..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
              />
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
              <label key={brand.name} className="srp-filter-option">
                <span className="srp-filter-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedBrands.includes(brand.name)}
                    onChange={() => toggleBrand(brand.name)}
                  />
                  <span className="srp-filter-label">{brand.name}</span>
                </span>
                <span className="srp-filter-count">{brand.count}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Category */}
        <div className={`srp-filter-card${collapsed.availability ? " collapsed" : ""}`}>
          <button
            className="srp-filter-card-head"
            type="button"
            onClick={() => setCollapsed((c) => ({ ...c, availability: !c.availability }))}
          >
            <h3><i className="fas fa-th-large" />Category</h3>
            <i className="fas fa-chevron-down srp-filter-toggle" />
          </button>
          <div className="srp-filter-card-body">
            {availableCategories.length === 0 ? (
              <p style={{ fontSize: "0.8rem", color: "var(--gray-400)", padding: "4px 0" }}>
                No categories found
              </p>
            ) : (
              availableCategories.map((cat) => (
                <label key={cat.name} className="srp-filter-option">
                  <span className="srp-filter-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat.name)}
                      onChange={() => toggleCategory(cat.name)}
                    />
                    <span className="srp-filter-label">{cat.name}</span>
                  </span>
                  <span className="srp-filter-count">{cat.count}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Price */}
        <div className={`srp-filter-card${collapsed.price ? " collapsed" : ""}`}>
          <button
            className="srp-filter-card-head"
            type="button"
            onClick={() => setCollapsed((c) => ({ ...c, price: !c.price }))}
          >
            <h3><i className="fas fa-indian-rupee-sign" />Price Range</h3>
            <i className="fas fa-chevron-down srp-filter-toggle" />
          </button>
          <div className="srp-filter-card-body">
            {PRICE_RANGES.map((range) => (
              <label key={range.value} className="srp-filter-option">
                <span className="srp-filter-checkbox">
                  <input
                    type="radio"
                    name="srp-price-range"
                    checked={priceRange === range.value}
                    onChange={() => { setPriceRange(range.value as PriceRange); setCurrentPage(1); }}
                  />
                  <span className="srp-filter-label">{range.label}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Availability */}
        <div className="srp-filter-card">
          <div className="srp-filter-card-head" style={{ cursor: "default" }}>
            <h3><i className="fas fa-box" />Availability</h3>
          </div>
          <div className="srp-filter-card-body">
            <label className="srp-filter-option">
              <span className="srp-filter-checkbox">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={() => { setInStockOnly((p) => !p); setCurrentPage(1); }}
                />
                <span className="srp-filter-label">In Stock Only</span>
              </span>
            </label>
            <label className="srp-filter-option">
              <span className="srp-filter-checkbox">
                <input
                  type="checkbox"
                  checked={onSaleOnly}
                  onChange={() => { setOnSaleOnly((p) => !p); setCurrentPage(1); }}
                />
                <span className="srp-filter-label">On Sale</span>
              </span>
            </label>
          </div>
        </div>
      </>
    );
  }

  // ── grid card ─────────────────────────────────────────────────────────────

  function renderGridCard(item: Item) {
    const itemId   = String(item.id);
    const price    = getItemOfferPrice(item);
    const mrp      = getDerivedMrp(item);
    const disc     = getDiscount(item);
    const wished   = hasItem(item.id);
    const inCompare = compareList.includes(itemId);
    const productHref = `/product?id=${encodeURIComponent(String(item.id))}`;

    return (
      <div key={item.id} className="srp-product-card">
        {/* badge */}
        <div className="srp-card-badge-row">
          {disc > 0 ? <span className="srp-card-badge">-{disc}%</span> : null}
        </div>

        {/* wishlist */}
        <button
          className={`srp-card-wish${wished ? " active" : ""}`}
          type="button"
          onClick={() => handleToggleWishlist(item)}
        >
          <i className={`${wished ? "fas" : "far"} fa-heart`} />
        </button>

        {/* image */}
        <div className="srp-card-img-wrap">
          {!item.isActive ? <div className="srp-out-of-stock">Out of Stock</div> : null}
          <Link href={productHref} className="srp-card-link">
            <img
              src={getImageUrl(item.primaryImage, "/placeholder.svg")}
              alt={item.itemName}
              loading="lazy"
            />
          </Link>
          <div className="srp-card-overlay">
            <button className="srp-overlay-action" type="button" onClick={() => setQuickViewItem(item)}>
              <i className="fas fa-eye" />
            </button>
            <button className="srp-overlay-action" type="button" onClick={() => toggleCompare(item)}>
              <i className="fas fa-code-compare" />
            </button>
            <button className="srp-overlay-action" type="button" onClick={() => handleShare(item)}>
              <i className="fas fa-share-nodes" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="srp-card-body">
          <div className="srp-card-brand-row">
            <span className="srp-card-brand">{item.brandName || "—"}</span>
            <span className={`srp-card-stock${item.isActive ? "" : " muted"}`}>
              {item.isActive ? "In Stock" : "Out of Stock"}
            </span>
          </div>

          <div className="srp-card-name">
            <Link href={productHref}>{item.itemName}</Link>
          </div>

          {item.categoryName && (
            <div className="srp-card-specs">
              <span className="srp-card-spec-chip">
                <i className="fas fa-tag" />{item.categoryName}
              </span>
              {item.gst > 0 && (
                <span className="srp-card-spec-chip">
                  <i className="fas fa-percent" />GST {item.gst}%
                </span>
              )}
            </div>
          )}

          <div className="srp-card-price-row">
            {price > 0 ? (
              <>
                <span className="srp-card-price">{formatPrice(price)}</span>
                {mrp > price ? <span className="srp-card-original">{formatPrice(mrp)}</span> : null}
                {disc > 0 ? <span className="srp-card-discount">{disc}% off</span> : null}
              </>
            ) : (
              <span className="srp-card-price-muted">Price on request</span>
            )}
          </div>

          <div className="srp-card-delivery">
            <i className={`fas ${item.isActive ? "fa-truck-fast" : "fa-bell"}`} />
            {item.isActive ? "Available to order" : "Currently unavailable"}
          </div>

          <div className="srp-card-utility-row">
            <button
              className={`srp-compare-btn${inCompare ? " active" : ""}`}
              type="button"
              onClick={() => toggleCompare(item)}
            >
              <i className={`fas fa-${inCompare ? "check" : "code-compare"}`} />
              Compare
            </button>
          </div>

          <div className="srp-card-actions">
            <button
              className="srp-card-add-btn"
              type="button"
              disabled={!item.isActive}
              onClick={() => handleAddToCart(item)}
            >
              <i className="fas fa-cart-plus" />
              {item.isActive ? "Add to Cart" : "Out of Stock"}
            </button>
            <button
              className="srp-card-buy-btn"
              type="button"
              disabled={!item.isActive}
              onClick={() => handleBuyNow(item)}
            >
              Buy
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── list card ─────────────────────────────────────────────────────────────

  function renderListCard(item: Item) {
    const itemId    = String(item.id);
    const price     = getItemOfferPrice(item);
    const mrp       = getDerivedMrp(item);
    const disc      = getDiscount(item);
    const wished    = hasItem(item.id);
    const inCompare = compareList.includes(itemId);
    const productHref = `/product?id=${encodeURIComponent(String(item.id))}`;

    return (
      <div key={item.id} className="srp-list-card">
        <div className="srp-list-img">
          {disc > 0 ? (
            <div className="srp-card-badge" style={{ position: "absolute", top: 8, left: 8 }}>
              -{disc}%
            </div>
          ) : null}
          <Link href={productHref}>
            <img
              src={getImageUrl(item.primaryImage, "/placeholder.svg")}
              alt={item.itemName}
              loading="lazy"
            />
          </Link>
        </div>

        <div className="srp-list-body">
          <div className="srp-list-info">
            <div className="srp-list-brand">{item.brandName || "—"}</div>
            <div className="srp-list-name">
              <Link href={productHref}>{item.itemName}</Link>
            </div>
            <div className="srp-list-highlights">
              {item.categoryName && <span className="srp-list-chip">{item.categoryName}</span>}
              {item.gst > 0 && <span className="srp-list-chip">GST {item.gst}%</span>}
            </div>
            <div className="srp-list-features">
              <div className="srp-list-feature">
                <i className="fas fa-box" />{item.isActive ? "In stock" : "Out of stock"}
              </div>
              {item.brandName && (
                <div className="srp-list-feature">
                  <i className="fas fa-award" />Brand: {item.brandName}
                </div>
              )}
              <div className="srp-list-feature">
                <i className={`fas ${item.isActive ? "fa-truck-fast" : "fa-bell"}`} />
                {item.isActive ? "Available to order" : "Currently unavailable"}
              </div>
            </div>
          </div>

          <div className="srp-list-right">
            <div className="srp-list-price-block">
              {price > 0 ? (
                <>
                  <div className="cur">{formatPrice(price)}</div>
                  {mrp > price ? <div className="orig">{formatPrice(mrp)}</div> : null}
                  {disc > 0 ? <div className="off-badge">Save {formatPrice(mrp - price)} ({disc}%)</div> : null}
                </>
              ) : (
                <div style={{ color: "var(--gray-400)", fontSize: "0.82rem" }}>Price on request</div>
              )}
            </div>
            <div className="srp-list-btns">
              <button className="srp-btn-cart" type="button" onClick={() => handleAddToCart(item)}>
                <i className="fas fa-cart-plus" />Add to Cart
              </button>
              <button
                className={`srp-btn-wish${wished ? " active" : ""}`}
                type="button"
                onClick={() => handleToggleWishlist(item)}
              >
                <i className={`${wished ? "fas" : "far"} fa-heart`} />Wishlist
              </button>
              <button
                className="srp-btn-wish"
                type="button"
                onClick={() => setQuickViewItem(item)}
              >
                <i className="fas fa-eye" />Quick View
              </button>
              <button
                className={`srp-btn-wish${inCompare ? " active" : ""}`}
                type="button"
                onClick={() => toggleCompare(item)}
              >
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

    const pages: Array<number | "..."> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }

    return (
      <div className="srp-pagination">
        <button
          className="srp-page-btn srp-page-nav"
          type="button"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(currentPage - 1)}
        >
          <i className="fas fa-chevron-left" />
        </button>
        {pages.map((page, index) =>
          page === "..." ? (
            <span key={`ellipsis-${index}`} className="srp-page-ellipsis">…</span>
          ) : (
            <button
              key={page}
              className={`srp-page-btn${currentPage === page ? " active" : ""}`}
              type="button"
              onClick={() => {
                setCurrentPage(page as number);
                window.scrollTo({ top: 300, behavior: "smooth" });
              }}
            >
              {page}
            </button>
          )
        )}
        <button
          className="srp-page-btn srp-page-nav"
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(currentPage + 1)}
        >
          <i className="fas fa-chevron-right" />
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="srp-root">

      {/* ── BREADCRUMB ── */}
      <div className="srp-breadcrumb-bar">
        <nav className="srp-breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep"><i className="fas fa-chevron-right" /></span>
          <Link href="/search">Search</Link>
          {query && (
            <>
              <span className="sep"><i className="fas fa-chevron-right" /></span>
              <span className="current">{summaryLabel}</span>
            </>
          )}
        </nav>
      </div>

      {/* ── BANNER ── */}
      <div className="srp-banner">
        <div className="srp-banner-inner">
          <div>
            <h1 className="srp-banner-title">
              {query ? (
                <>{summaryLabel} <span>Best Deals 2026</span></>
              ) : (
                <>All Products <span>Best Deals 2026</span></>
              )}
            </h1>
            <p className="srp-banner-subtitle">
              {matchedCategory?.description ||
                `Explore ${filteredItems.length}+ products with best prices and genuine warranty.`}
            </p>
          </div>
          <div className="srp-banner-stats">
            <div className="srp-banner-stat">
              <div className="srp-stat-num">{filteredItems.length}+</div>
              <div className="srp-stat-label">Products</div>
            </div>
            <div className="srp-banner-stat">
              <div className="srp-stat-num">{availableBrands.length}</div>
              <div className="srp-stat-label">Brands</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ACTIVE FILTERS BAR ── */}
      <div className={`srp-active-filters-bar${activeFilterTags.length ? " has-filters" : ""}`}>
        <div className="srp-active-filters-inner">
          <span className="srp-active-filters-label">Active Filters:</span>
          {activeFilterTags.map((tag) => (
            <button
              key={`${tag.key}-${tag.value}`}
              className="srp-filter-tag"
              type="button"
              onClick={() => removeFilterTag(tag)}
            >
              <span>{tag.label}</span>
              <i className="fas fa-times" />
            </button>
          ))}
          {activeFilterTags.length > 0 && (
            <button className="srp-clear-all-btn" type="button" onClick={clearAllFilters}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className="srp-page-inner">

        {/* SIDEBAR */}
        <aside className="srp-filters-sidebar">
          {renderFilterPanel()}
        </aside>

        {/* RESULTS PANEL */}
        <div className="srp-results-panel">
          {/* Controls bar */}
          <div className="srp-controls-bar">
            {/* mobile filter button */}
            <button
              className="srp-mobile-filter-btn"
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <i className="fas fa-sliders" />Filters
              {activeFilterCount > 0 && (
                <span className="srp-mobile-filter-count">{activeFilterCount}</span>
              )}
            </button>

            <span className="srp-results-count">
              Showing <strong>{paginatedItems.length}</strong> of <strong>{sortedItems.length}</strong> products
            </span>

            <div className="srp-sort-section">
              <span className="srp-sort-label">Sort by:</span>
              <select
                className="srp-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortValue)}
              >
                <option value="relevance">Relevance</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
              </select>
            </div>

            <div className="srp-view-toggle">
              <button
                className={`srp-view-btn${viewMode === "grid" ? " active" : ""}`}
                type="button"
                onClick={() => setViewMode("grid")}
              >
                <i className="fas fa-th-large" />
              </button>
              <button
                className={`srp-view-btn${viewMode === "list" ? " active" : ""}`}
                type="button"
                onClick={() => setViewMode("list")}
              >
                <i className="fas fa-list" />
              </button>
            </div>
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div className="srp-products-grid">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="srp-skeleton-card">
                  <div className="srp-sk-img" />
                  <div className="srp-sk-line" />
                  <div className="srp-sk-line short" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="srp-empty">
              <i className="fas fa-circle-exclamation" />
              <h3>Failed to load search results</h3>
              <p>{error}</p>
              <button className="srp-browse-btn" type="button" onClick={() => window.location.reload()}>
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && paginatedItems.length === 0 && (
            <div className="srp-empty">
              <i className="fas fa-search" />
              <h3>No products found{query ? ` for "${query}"` : ""}</h3>
              <p>Try a different keyword or adjust your filters.</p>
              <Link href="/products" className="srp-browse-btn">
                Browse All Products
              </Link>
            </div>
          )}

          {/* Grid */}
          {!loading && !error && paginatedItems.length > 0 && viewMode === "grid" && (
            <div className="srp-products-grid">
              {paginatedItems.map(renderGridCard)}
            </div>
          )}

          {/* List */}
          {!loading && !error && paginatedItems.length > 0 && viewMode === "list" && (
            <div className="srp-products-list">
              {paginatedItems.map(renderListCard)}
            </div>
          )}

          {renderPagination()}
        </div>
      </div>

      {/* ── MOBILE FILTER DRAWER ── */}
      {mobileFiltersOpen && (
        <>
          <div
            className="srp-sidebar-overlay"
            role="presentation"
            onClick={() => setMobileFiltersOpen(false)}
          />
          <div className="srp-mobile-sidebar">
            <div className="srp-mobile-sidebar-head">
              <h3><i className="fas fa-sliders" />Filters</h3>
              <button
                className="srp-mobile-sidebar-close"
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="srp-mobile-sidebar-content">
              {renderFilterPanel()}
            </div>
            <div className="srp-mobile-sidebar-footer">
              <button className="srp-ms-clear" type="button" onClick={clearAllFilters}>Clear</button>
              <button className="srp-ms-apply" type="button" onClick={() => setMobileFiltersOpen(false)}>
                Apply
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── QUICK VIEW MODAL ── */}
      {quickViewItem && (
        <div
          className="srp-modal-overlay"
          role="presentation"
          onClick={() => setQuickViewItem(null)}
        >
          <div className="srp-modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="srp-modal-close" type="button" onClick={() => setQuickViewItem(null)}>
              <i className="fas fa-times" />
            </button>
            <div className="srp-qv-body">
              <div className="srp-qv-gallery">
                <img
                  className="srp-qv-main-img"
                  src={getImageUrl(quickViewItem.primaryImage, "/placeholder.svg")}
                  alt={quickViewItem.itemName}
                />
              </div>
              <div className="srp-qv-info">
                <div className="srp-qv-brand-badge">
                  <i className="fas fa-certificate" />{quickViewItem.brandName}
                </div>
                <h2 className="srp-qv-name">{quickViewItem.itemName}</h2>
                {quickViewItem.categoryName && (
                  <p className="srp-qv-subtitle">{quickViewItem.categoryName}</p>
                )}
                <div className="srp-qv-price">
                  {getItemOfferPrice(quickViewItem) > 0 ? (
                    <>
                      <span className="cur">{formatPrice(getItemOfferPrice(quickViewItem))}</span>
                      {getDerivedMrp(quickViewItem) > getItemOfferPrice(quickViewItem) && (
                        <span className="orig">{formatPrice(getDerivedMrp(quickViewItem))}</span>
                      )}
                      {getDiscount(quickViewItem) > 0 && (
                        <span className="off">{getDiscount(quickViewItem)}% off</span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--gray-400)" }}>Price on request</span>
                  )}
                </div>
                <div className="srp-qv-chips">
                  {quickViewItem.gst > 0 && (
                    <span className="srp-qv-chip">GST {quickViewItem.gst}%</span>
                  )}
                  {quickViewItem.isActive && (
                    <span className="srp-qv-chip" style={{ color: "var(--green-600)" }}>In Stock</span>
                  )}
                </div>
                <div className="srp-qv-actions">
                  <button className="srp-qv-btn-cart" type="button" onClick={() => handleAddToCart(quickViewItem)}>
                    <i className="fas fa-cart-plus" />Add to Cart
                  </button>
                  <button
                    className="srp-qv-btn-detail"
                    type="button"
                    onClick={() => router.push(`/product?id=${quickViewItem.id}`)}
                  >
                    <i className="fas fa-arrow-right" />View Full Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COMPARE BAR ── */}
      {compareItems.length > 0 && (
        <div className="srp-compare-bar">
          <div className="srp-compare-bar-label">
            <b>Compare Products</b>
            Select up to 4
          </div>
          <div className="srp-compare-slots">
            {Array.from({ length: 4 }).map((_, idx) => {
              const item = compareItems[idx];
              return (
                <div key={idx} className={`srp-compare-slot${item ? " filled" : ""}`}>
                  {item ? (
                    <>
                      <img
                        className="srp-cs-img"
                        src={getImageUrl(item.primaryImage, "/placeholder.svg")}
                        alt={item.itemName}
                      />
                      <button
                        className="srp-cs-remove"
                        type="button"
                        onClick={() => toggleCompare(item)}
                      >
                        <i className="fas fa-times" />
                      </button>
                    </>
                  ) : (
                    <i className="fas fa-plus srp-cs-empty-icon" />
                  )}
                </div>
              );
            })}
          </div>
          <button
            className="srp-compare-now-btn"
            type="button"
            disabled={compareItems.length < 2}
            onClick={() => setShowCompareModal(true)}
          >
            <i className="fas fa-table-columns" />Compare Now
          </button>
          <button
            className="srp-compare-clear-btn"
            type="button"
            onClick={() => setCompareList([])}
          >
            <i className="fas fa-times" />Clear
          </button>
        </div>
      )}

      {/* ── COMPARE MODAL ── */}
      {showCompareModal && (
        <div
          className="srp-compare-modal"
          role="presentation"
          onClick={() => setShowCompareModal(false)}
        >
          <div className="srp-compare-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="srp-compare-modal-head">
              <h2><i className="fas fa-code-compare" />Compare Products</h2>
              <button className="srp-cmp-close" type="button" onClick={() => setShowCompareModal(false)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <div className="srp-compare-table-wrap">
              <table className="srp-compare-table">
                <thead>
                  <tr>
                    <th className="srp-row-label">Specification</th>
                    {compareItems.map((item) => (
                      <th key={item.id} style={{ textAlign: "center" }}>
                        <img
                          className="srp-cmp-product-img"
                          src={getImageUrl(item.primaryImage, "/placeholder.svg")}
                          alt={item.itemName}
                        />
                        <div className="srp-cmp-product-brand">{item.brandName}</div>
                        <div className="srp-cmp-product-name">{item.itemName}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Brand",    (i: Item) => i.brandName ?? "—"],
                    ["Category", (i: Item) => i.categoryName ?? "—"],
                    ["Price",    (i: Item) => getItemOfferPrice(i) > 0 ? formatPrice(getItemOfferPrice(i)) : "On request"],
                    ["GST",      (i: Item) => `${i.gst ?? 0}%`],
                    ["In Stock", (i: Item) => i.isActive ? "Yes" : "No"],
                  ] as [string, (i: Item) => string][]).map(([label, fn]) => (
                    <tr key={label}>
                      <td className="srp-row-label">{label}</td>
                      {compareItems.map((item) => (
                        <td key={item.id} style={{ textAlign: "center" }}>{fn(item)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="srp-footer">
        <div className="srp-footer-inner">
          <div className="srp-fb-brand">
            <div className="srp-fb-logo">APPLENEXT</div>
            <p>
              Your one-stop destination for the latest electronics, mobile phones, laptops,
              and home appliances at the best prices with genuine warranty.
            </p>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title} className="srp-fc">
              <h4>{group.title}</h4>
              {group.links.map((link) => (
                <Link key={`${group.title}-${link.label}`} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="srp-footer-bottom">
          <p>&copy; 2026 AppleNext Electronics. All rights reserved.</p>
          <div className="srp-pay-tags">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </footer>

      {/* ── BACK TO TOP ── */}
      <button
        className={`srp-back-to-top${showTop ? " visible" : ""}`}
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <i className="fas fa-arrow-up" />
      </button>

      {/* ── TOASTS ── */}
      <div className="srp-toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`srp-toast ${toast.type}`}>
            <i className="fas fa-check-circle" />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
