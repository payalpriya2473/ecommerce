"use client";


import Link from "next/link";
import { useEffect, useRef, useState, useCallback, Fragment } from "react";/*  */
import { useRouter, useSearchParams } from "next/navigation";
import {
  announcementItems,
  footerGroups,
  footerSocialIcons,
  headerActions,
  navLinks,
} from "@/lib/data/homePageData";
import {
  publicItemAPI,
  publicCategoryAPI,
  getImageUrl,
  getCategoryUrl,
  getItemOfferPrice,
  getItemOriginalPrice,
  Item,
  Category,
  publicOfferAPI,
  getItemCardKey,
  getItemFamilyKey,
  type PublicOffer,
} from "@/lib/api/publicApi";
import { cartItemFromItem, useCart } from "@/lib/cart/cart-context";
import { useWishlist, wishlistItemFromItem } from "@/lib/wishlist/wishlist-context";
import {
  buildProductDetailUrlForItem,
  buildVariantKey,
  getDisplayColorName,
} from "@/lib/product/variant-utils";
import "./ProductDetail.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VariantColorImage {
  id: string | number;
  imageUrl: string;
  sortOrder: number;
}

interface VariantColor {
  id: string | number | null;
  colorName: string;
  colorHex: string | null;
  sortOrder: number;
  images: VariantColorImage[];
  primaryImage: string | null;
}

interface VariantWithColors extends Item {
  colors?: VariantColor[];
  primaryImage: string | null;
}

type ItemDetail = Item & {
  images?: { id: string | number; imageUrl: string; sortOrder?: number }[];
  variantsWithColors?: VariantWithColors[];
  itemGroupName?: string;
};

function normalizeColorName(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function sortBySortOrder<T extends { sortOrder?: number | null }>(items?: T[]): T[] {
  return [...(items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function dedupeImages(images: { src: string; alt: string }[]) {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.src || seen.has(image.src)) return false;
    seen.add(image.src);
    return true;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(price: number) {
  return `Rs ${price.toLocaleString("en-IN")}`;
}

function getColorSwatchStyle(color: VariantColor) {
  const imageUrl = color.primaryImage || color.images?.[0]?.imageUrl || "";

  if (imageUrl) {
    return {
      backgroundImage: `url("${getImageUrl(imageUrl)}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return { backgroundColor: "#e0e0e0" };
}

function getMrp(item: Pick<Item, "offerPrice" | "nlc" | "margin">): number {
  const base = getItemOfferPrice(item);
  const m = Number(item.margin ?? 10) || 10;
  return Math.round(base * (1 + m / 100));
}

function getDiscount(price: number, mrp: number): number {
  if (!mrp || mrp <= price) return 0;
  return Math.round((1 - price / mrp) * 100);
}

function isItemInStock(item?: Pick<Item, "openingStock"> | null) {
  return Number(item?.openingStock ?? 0) > 0;
}

function getCompactItemName(item: Pick<Item, "itemName" | "brandName" | "variant">, maxLength = 42) {
  const brandName = (item.brandName ?? "").trim();
  const rawName = (item.itemName ?? "").replace(/\s+/g, " ").trim();

  if (!rawName) return "Product";

  const segments = rawName.split(/[:|]/).map((segment) => segment.trim()).filter(Boolean);
  let candidate = segments[0] || rawName;

  if (
    brandName &&
    candidate.toLowerCase().startsWith(brandName.toLowerCase()) &&
    candidate.length > maxLength
  ) {
    candidate = candidate.slice(brandName.length).trim();
    candidate = `${brandName} ${candidate}`;
  }

  if (candidate.length <= maxLength) return candidate;

  const trimmed = candidate.slice(0, maxLength);
  const safeBreak = trimmed.lastIndexOf(" ");
  return `${(safeBreak > 18 ? trimmed.slice(0, safeBreak) : trimmed).trim()}...`;
}

const RECENTLY_VIEWED_STORAGE_KEY = "mb_recently_viewed_items";
const RECENTLY_VIEWED_LIMIT = 8;

function getRecentlyViewedIds() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id)).filter(Boolean);
  } catch {
    return [];
  }
}

function saveRecentlyViewedItemId(itemId: string | number) {
  if (typeof window === "undefined") return [];
  const nextIds = [
    String(itemId),
    ...getRecentlyViewedIds().filter((id) => id !== String(itemId)),
  ].slice(0, RECENTLY_VIEWED_LIMIT);
  window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(nextIds));
  return nextIds;
}

function getCompareRows(products: Item[]) {
  return [
    ["Brand", ...products.map((product) => product.brandName || "N/A")],
    ["Category", ...products.map((product) => product.categoryName || "N/A")],
    ["Variant", ...products.map((product) => product.variant || "Standard")],
    ["Offer Price", ...products.map((product) => formatPrice(product.offerPrice ?? product.nlc ?? 0))],
    ["MRP", ...products.map((product) => formatPrice(getMrp(product)))],
    ["Discount", ...products.map((product) => `${getDiscount(product.offerPrice ?? product.nlc ?? 0, getMrp(product))}% off`)],
    ["GST", ...products.map((product) => `${product.gst ?? 0}%`)],
    ["Demo Installation", ...products.map((product) => (product.hasDemoInstallation ? "Yes" : "No"))],
    ["Status", ...products.map((product) => (isItemInStock(product) ? "In Stock" : "Out of Stock"))],
  ];
}

function getVariantFamilyImage(
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

function ItemRailCard({
  item,
  imageSrc,
  onOpen,
  onAddToCart,
}: {
  item: Item;
  imageSrc?: string | null;
  onOpen: () => void;
  onAddToCart: (item: Item) => void;
}) {
  const itemPrice = item.offerPrice ?? item.nlc ?? 0;
  const itemMrp = item.nlc && item.nlc > itemPrice ? item.nlc : getMrp(item);
  const itemDiscount = getDiscount(itemPrice, itemMrp);

  return (
    <div
      className="pd-product-card pd-product-card-static"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      {itemDiscount > 0 && <span className="pc-badge sale">{itemDiscount}% off</span>}
      <button
        type="button"
        className="pc-wishlist"
        aria-label="Add to wishlist"
        onClick={(e) => e.stopPropagation()}
      >
        <i className="far fa-heart" />
      </button>
      <div className="pc-img-wrap">
        {imageSrc ? (
          <img src={getImageUrl(imageSrc)} alt={item.itemName} loading="lazy" />
        ) : (
          <i className="fas fa-image" style={{ fontSize: "2rem", color: "#ccc" }} />
        )}
      </div>
      <div className="pc-body">
        <div className="pc-brand">{item.brandName ?? "Brand"}</div>
        <div className="pc-name">{getCompactItemName(item, 40)}</div>
        {item.variant && <div className="pc-variant">{item.variant}</div>}
        <div className="pc-rating">
          <i className="fas fa-star" />
          <i className="fas fa-star" />
          <i className="fas fa-star" />
          <i className="fas fa-star" />
          <i className="fas fa-star-half-alt" />
          <span>{item.categoryName ?? "Product"}</span>
        </div>
        <div className="pc-price-row">
          <span className="pc-price">{formatPrice(itemPrice)}</span>
          {itemMrp > itemPrice && <span className="pc-orig">{formatPrice(itemMrp)}</span>}
          {itemDiscount > 0 && <span className="pc-save">{itemDiscount}% off</span>}
        </div>
        {/* <button
          type="button"
          className="pc-cart-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(item);
          }}
        >
          <i className="fas fa-cart-plus" /> Add to Cart
        </button> */}
      </div>
    </div>
  );
}

// ─── Image Zoom Hook ──────────────────────────────────────────────────────────

function useImageZoom(zoomFactor = 2.8) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [isZooming, setIsZooming] = useState(false);
  const suppressNextMoveRef = useRef(false);

  const resetZoom = useCallback(() => {
    suppressNextMoveRef.current = true;
    setIsZooming(false);

    const lens = lensRef.current;
    const result = resultRef.current;

    if (lens) {
      lens.style.left = "0px";
      lens.style.top = "0px";
    }

    if (result) {
      result.style.backgroundImage = "";
      result.style.backgroundPosition = "center";
    }
  }, []);

  const updateZoom = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      const lens = lensRef.current;
      const result = resultRef.current;
      if (!container || !lens || !result) return;
      const img = container.querySelector("img.pd-main-img") as HTMLImageElement | null;
      if (!img) return;

      const rect = container.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      const lensW = lens.offsetWidth;
      const lensH = lens.offsetHeight;

      const clampedX = Math.max(imgRect.left, Math.min(clientX, imgRect.right));
      const clampedY = Math.max(imgRect.top, Math.min(clientY, imgRect.bottom));

      let x = clampedX - rect.left - lensW / 2;
      let y = clampedY - rect.top - lensH / 2;
      x = Math.max(imgRect.left - rect.left, Math.min(x, imgRect.right - rect.left - lensW));
      y = Math.max(imgRect.top - rect.top, Math.min(y, imgRect.bottom - rect.top - lensH));

      lens.style.left = `${x}px`;
      lens.style.top = `${y}px`;

      const relX = ((clampedX - imgRect.left) / imgRect.width) * 100;
      const relY = ((clampedY - imgRect.top) / imgRect.height) * 100;
      result.style.backgroundImage = `url("${img.src}")`;
      result.style.backgroundSize = `${imgRect.width * zoomFactor}px ${imgRect.height * zoomFactor}px`;
      result.style.backgroundPosition = `${relX}% ${relY}%`;
    },
    [zoomFactor]
  );

  const handleMouseEnter = useCallback(() => {
    if (suppressNextMoveRef.current) return;
    setIsZooming(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    suppressNextMoveRef.current = false;
    setIsZooming(false);
  }, []);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (suppressNextMoveRef.current) {
        suppressNextMoveRef.current = false;
        return;
      }
      setIsZooming(true);
      updateZoom(e.clientX, e.clientY);
    },
    [updateZoom]
  );

  return {
    containerRef,
    lensRef,
    resultRef,
    isZooming,
    resetZoom,
    handlers: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onMouseMove: handleMouseMove,
    },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductDetail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("id") ?? undefined;
  const requestedColorId = searchParams.get("colorId");
  const requestedColorName = searchParams.get("color") ?? searchParams.get("colorName");

  const { addItem, totalQuantity } = useCart();
  const { itemCount: wishlistCount, hasItem, toggleItem } = useWishlist();

  // ── Data state ────────────────────────────────────────────────────────────
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [relatedItems, setRelatedItems] = useState<Item[]>([]);
  const [recentlyViewedItems, setRecentlyViewedItems] = useState<Item[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const [activeTab, setActiveTab] = useState("highlights");
  const [toast, setToast] = useState<string | null>(null);
  const [pincode, setPincode] = useState("");
  const [productOffers, setProductOffers] = useState<PublicOffer[]>([]);

  useEffect(() => {
    const pid = item?.id;
    if (pid == null) return;
    publicOfferAPI.getForProduct(pid)
      .then((rows) => setProductOffers(rows))
      .catch(() => {});
  }, [item?.id]);

  const actionRef = useRef<HTMLDivElement | null>(null);
  const mainImgRef = useRef<HTMLImageElement | null>(null);
  const zoom = useImageZoom(2.8);

  // ── Derived ───────────────────────────────────────────────────────────────
  const variants: VariantWithColors[] = item?.variantsWithColors ?? [];
  const selectedVariant: VariantWithColors | null = variants[selectedVariantIdx] ?? null;
  const fallbackVariantColors: VariantColor[] =
    sortBySortOrder(variants.find((variant) => (variant.colors?.length ?? 0) > 0)?.colors ?? []);
  const getColorsForVariant = useCallback(
    (variant: VariantWithColors | null) => {
      if (!variant) return [];
      const ownColors = sortBySortOrder(variant.colors ?? []);
      return ownColors.length > 0 ? ownColors : fallbackVariantColors;
    },
    [fallbackVariantColors]
  );
  const availableColors: VariantColor[] = getColorsForVariant(selectedVariant);
  const selectedColor: VariantColor | null = availableColors[selectedColorIdx] ?? null;
  const showColorSelector =
    availableColors.length > 0 &&
    !(availableColors.length === 1 && normalizeColorName(availableColors[0].colorName) === "default");

  const displayImages: { src: string; alt: string }[] = (() => {
    const colorImages = sortBySortOrder(selectedColor?.images ?? []);
    if (colorImages.length > 0) {
      return dedupeImages(
        colorImages.map((img, i) => ({
          src: getImageUrl(img.imageUrl),
          alt: `${item?.itemName ?? ""} - ${selectedColor?.colorName?.trim() ?? ""} ${i + 1}`,
        }))
      );
    }
    if (selectedColor?.primaryImage) {
      return [
        {
          src: getImageUrl(selectedColor.primaryImage),
          alt: `${item?.itemName ?? ""} - ${selectedColor?.colorName?.trim() ?? ""}`,
        },
      ];
    }
    if (item?.images?.length) {
      return dedupeImages(
        sortBySortOrder(item.images).map((img, i) => ({
          src: getImageUrl(img.imageUrl),
          alt: `${item.itemName} image ${i + 1}`,
        }))
      );
    }
    if (selectedVariant?.primaryImage) {
      return [{ src: getImageUrl(selectedVariant.primaryImage), alt: item?.itemName ?? "" }];
    }
    if (item?.primaryImage) {
      return [{ src: getImageUrl(item.primaryImage), alt: item.itemName }];
    }
    return [];
  })();

  const price = selectedVariant ? getItemOfferPrice(selectedVariant) : 0;
  const mrp = selectedVariant ? getItemOriginalPrice(selectedVariant) : 0;
  const disc = getDiscount(price, mrp);
  const inStock = isItemInStock(selectedVariant ?? item);
  const purchaseTarget = selectedVariant ?? item;

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const loadItem = useCallback(async () => {
    if (!itemId) { setError("No product ID provided"); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const fetchedItem = (await publicItemAPI.getById(itemId)) as ItemDetail | null;
      if (!fetchedItem) { setError("Product not found"); setLoading(false); return; }

      setItem(fetchedItem);
      document.title = `${fetchedItem.itemName} | AppleNext Electronics`;
      const recentIds = saveRecentlyViewedItemId(fetchedItem.id).filter(
        (id) => id !== String(fetchedItem.id)
      );

      const vIdx = (fetchedItem.variantsWithColors ?? []).findIndex(
        (v) => String(v.id) === String(itemId)
      );
      const nextVariantIdx = vIdx >= 0 ? vIdx : 0;
      const nextVariant = (fetchedItem.variantsWithColors ?? [])[nextVariantIdx] ?? null;
      const fallbackColors = sortBySortOrder(
        (fetchedItem.variantsWithColors ?? []).find((variant) => (variant.colors?.length ?? 0) > 0)?.colors ?? []
      );
      const nextColors = (() => {
        if (!nextVariant) return [];
        const ownColors = sortBySortOrder(nextVariant.colors ?? []);
        return ownColors.length > 0 ? ownColors : fallbackColors;
      })();
      const requestedColorIdx = nextColors.findIndex((color) => {
        const matchesId =
          requestedColorId != null &&
          requestedColorId !== "" &&
          color.id != null &&
          String(color.id) === String(requestedColorId);
        const matchesName =
          !!requestedColorName &&
          normalizeColorName(color.colorName) === normalizeColorName(requestedColorName);
        return matchesId || matchesName;
      });

      setSelectedVariantIdx(nextVariantIdx);
      setSelectedColorIdx(requestedColorIdx >= 0 ? requestedColorIdx : 0);
      setActiveImageIdx(0);

      const catId = fetchedItem.categoryId;
      if (catId) {
        const relatedRes = await publicItemAPI.getAll({
          categoryId: catId,
          limit: 10,
          page: 1,
        });
        // Related products: other products only (not other colours/variants
        // of the product being viewed).
        const currentFamily = getItemFamilyKey(fetchedItem);
        setRelatedItems(
          relatedRes.items.filter((i) => getItemFamilyKey(i) !== currentFamily).slice(0, 8)
        );
        const allCats = await publicCategoryAPI.getAll();
        const foundCat = allCats.find((c) => String(c.id) === String(catId));
        if (foundCat) setCategory(foundCat);
      }

      if (recentIds.length > 0) {
        const recentRes = await publicItemAPI.getAll({
          ids: recentIds,
          exact: true,
        });
        setRecentlyViewedItems(recentRes.items.filter((i) => String(i.id) !== String(fetchedItem.id)));
      } else {
        setRecentlyViewedItems([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [itemId, requestedColorId, requestedColorName]);

  useEffect(() => { loadItem(); }, [loadItem]);

  useEffect(() => {
    document.body.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("overflow");
    const t = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }, 0);
    return () => clearTimeout(t);
  }, [itemId]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
      setShowTop(window.scrollY > 400);
      if (actionRef.current) setShowSticky(actionRef.current.getBoundingClientRect().bottom < 0);
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
    setSelectedColorIdx((prev) => {
      if (availableColors.length === 0) return 0;
      return Math.min(prev, availableColors.length - 1);
    });
  }, [availableColors.length]);

  useEffect(() => {
    setActiveImageIdx((prev) => {
      if (displayImages.length === 0) return 0;
      return Math.min(prev, displayImages.length - 1);
    });
  }, [displayImages.length]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleVariantSelect(idx: number) {
    if (idx === selectedVariantIdx) return;
    const currentColorName = normalizeColorName(availableColors[selectedColorIdx]?.colorName);
    const nextColors = getColorsForVariant(variants[idx] ?? null);
    const nextColorIdx = currentColorName
      ? nextColors.findIndex((color) => normalizeColorName(color.colorName) === currentColorName)
      : -1;

    setSelectedVariantIdx(idx);
    setSelectedColorIdx(nextColorIdx >= 0 ? nextColorIdx : 0);
    setActiveImageIdx(0);
  }

  function handleColorSelect(idx: number) {
    if (idx === selectedColorIdx) return;
    setSelectedColorIdx(idx);
    setActiveImageIdx(0);
  }

  function changeImage(idx: number) {
    zoom.resetZoom();
    if (mainImgRef.current) {
      mainImgRef.current.style.opacity = "0";
      setTimeout(() => {
        setActiveImageIdx(idx);
        if (mainImgRef.current) mainImgRef.current.style.opacity = "1";
      }, 120);
    } else {
      setActiveImageIdx(idx);
    }
  }

  function showPreviousImage() {
    if (displayImages.length <= 1) return;
    changeImage((activeImageIdx - 1 + displayImages.length) % displayImages.length);
  }

  function showNextImage() {
    if (displayImages.length <= 1) return;
    changeImage((activeImageIdx + 1) % displayImages.length);
  }

  function handleAddToCart(targetItem: Item) {
    const baseCartItem = cartItemFromItem(targetItem);
    const selectedImage =
      selectedColor?.primaryImage ??
      selectedColor?.images?.[0]?.imageUrl ??
      targetItem.primaryImage ??
      item?.primaryImage ??
      null;

    addItem({
      ...baseCartItem,
      itemId: targetItem.id,
      primaryImage: selectedImage,
      offerPrice: getItemOfferPrice(targetItem),
      originalPrice: getItemOriginalPrice(targetItem),
      variant: targetItem.variant ?? selectedVariant?.variant ?? item?.variant ?? null,
      colorId: selectedColor?.id ?? null,
      colorName:
        selectedColor?.colorName && normalizeColorName(selectedColor.colorName) !== "default"
          ? selectedColor.colorName.trim()
          : null,
    });
    setToast(`${targetItem.itemName} added to cart`);
  }

  function handleBuyNow(targetItem: Item) {
    handleAddToCart(targetItem);
    router.push("/cart");
  }

  const wishlistSelectionKey =
    item && selectedVariant
      ? buildVariantKey(selectedVariant.id, selectedColor?.id ?? null)
      : null;
  const isWishlisted = wishlistSelectionKey ? hasItem(wishlistSelectionKey) : false;
  const tabs = [
    { id: "highlights", label: "Highlights" },
    { id: "specs", label: "Specifications" },
  ];
  const descriptionHtml = item?.description?.trim() ?? "";
  const currentFamilyItems: Item[] = item?.variantsWithColors ?? [];
  const compareItems: Item[] = [
    ...(selectedVariant ? [selectedVariant] : item ? [item] : []),
    ...relatedItems.filter((related) => String(related.id) !== String(selectedVariant?.id ?? item?.id)).slice(0, 3),
  ];
  const compareRows = getCompareRows(compareItems);

  // FIX 5: Corrected emoji characters (were garbled)
  const getCategoryEmoji = () => {
    const cat = item?.categoryName?.toLowerCase() ?? "";
    if (cat.includes("mobile") || cat.includes("phone")) return "📱";
    if (cat.includes("laptop")) return "💻";
    if (cat.includes("tv") || cat.includes("television")) return "📺";
    if (cat.includes("audio") || cat.includes("headphone")) return "🎧";
    return "🛍️";
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pd-page">
      {/* ── Breadcrumb ── */}
      <div className="pd-breadcrumb-bar">
        <nav className="pd-breadcrumb">
          <Link href="/">Home</Link>
          <span className="sep"><i className="fas fa-chevron-right" /></span>
          {category ? (
            <>
              <Link href={getCategoryUrl(category)}>{category.name}</Link>
              <span className="sep"><i className="fas fa-chevron-right" /></span>
            </>
          ) : (
            <>
              <Link href="/products">Products</Link>
              <span className="sep"><i className="fas fa-chevron-right" /></span>
            </>
          )}
          <span className="current">{item?.itemName ?? "Loading…"}</span>
        </nav>
      </div>

      {loading && (
        <div className="pd-loading-wrap">
          <div className="pd-spinner" />
          <p className="pd-loading-text">Loading product details…</p>
        </div>
      )}

      {!loading && error && (
        <div className="pd-error-wrap">
          <i className="fas fa-exclamation-circle" />
          <h3>Product Not Found</h3>
          <p>{error}</p>
          <button className="pd-retry-btn" type="button" onClick={() => router.push("/")}>
            <i className="fas fa-home" /> Go Home
          </button>
        </div>
      )}

      {/* ── Main Product ── */}
      {!loading && !error && item && (
        <>
          <section className="pd-main">

            {/* ════════════════════════════════════════════════
                GALLERY — Amazon layout:
                [Vertical thumbs left] [Large image center]
                Zoom panel floats RIGHT outside the container
                ════════════════════════════════════════════════ */}
            <div className="pd-gallery">
              <div className="pd-gallery-main">

                {/* Badges */}
                <div className="pd-gallery-badges">
                  {disc > 0 && (
                    <span className="pd-gallery-badge sale">{disc}% OFF</span>
                  )}
                  <span className={`pd-gallery-badge ${inStock ? "best" : "out"}`}>
                    {inStock ? "IN STOCK" : "OUT OF STOCK"}
                  </span>
                </div>

                {/* Wishlist */}
                <button
                  type="button"
                  className={`pd-wishlist-btn${isWishlisted ? " active" : " inactive"}`}
                  onClick={() => {
                    const selectedImage =
                      selectedColor?.primaryImage ??
                      selectedColor?.images?.[0]?.imageUrl ??
                      selectedVariant?.primaryImage ??
                      item.primaryImage ??
                      null;
                    const added = toggleItem({
                      ...wishlistItemFromItem(selectedVariant ?? item),
                      itemId: selectedVariant?.id ?? item.id,
                      primaryImage: selectedImage,
                      colorId: selectedColor?.id ?? null,
                      colorName: getDisplayColorName(selectedColor?.colorName),
                    });
                    setToast(added ? "Added to wishlist" : "Removed from wishlist");
                  }}
                  aria-label="Wishlist"
                  style={{ position: "absolute", top: 8, right: 8, zIndex: 3 }}
                >
                  <i className={`${isWishlisted ? "fas" : "far"} fa-heart`} />
                </button>

                <div className="pd-gallery-view">
                  {/* Left vertical thumbnails */}
                  {displayImages.length > 0 && (
                    <div className="pd-thumbs">
                      {displayImages.map((img, i) => (
                        <button
                          key={i}
                          type="button"
                          className={`pd-thumb-btn${activeImageIdx === i ? " active" : ""}`}
                          onClick={() => changeImage(i)}
                          onMouseEnter={() => changeImage(i)}
                        >
                          <img src={img.src} alt={img.alt} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Main image + zoom */}
                  {displayImages.length > 0 ? (
                    <>
                      <div
                        ref={zoom.containerRef}
                        className="pd-zoom-container"
                        {...zoom.handlers}
                      >
                        {displayImages.length > 1 && (
                          <>
                            <button
                              type="button"
                              className="pd-gallery-nav pd-gallery-nav-prev"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                showPreviousImage();
                              }}
                              aria-label="Previous product image"
                            >
                              <i className="fas fa-chevron-left" />
                            </button>
                            <button
                              type="button"
                              className="pd-gallery-nav pd-gallery-nav-next"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                showNextImage();
                              }}
                              aria-label="Next product image"
                            >
                              <i className="fas fa-chevron-right" />
                            </button>
                          </>
                        )}
                        <img
                          ref={mainImgRef}
                          src={displayImages[activeImageIdx]?.src}
                          alt={displayImages[activeImageIdx]?.alt ?? item.itemName}
                          className="pd-main-img"
                        />
                        <div
                          ref={zoom.lensRef}
                          className={`pd-zoom-lens${zoom.isZooming ? " visible" : ""}`}
                        />
                        {!zoom.isZooming && (
                          <div className="pd-zoom-hint">
                            <i className="fas fa-magnifying-glass-plus" /> Hover to zoom
                          </div>
                        )}
                      </div>
                      {/* Zoom result pops out to the RIGHT */}
                      <div
                        ref={zoom.resultRef}
                        className={`pd-zoom-result${zoom.isZooming ? " visible" : ""}`}
                      />
                    </>
                  ) : (
                    <div className="pd-no-img">
                      <i className="fas fa-image" />
                      <span>No image available</span>
                    </div>
                  )}
                </div>

                {/* Share actions */}
                <div className="pd-gallery-actions" style={{ position: "absolute", bottom: 10, right: 10, zIndex: 3 }}>
                  <button
                    type="button"
                    className="pd-gallery-action-btn"
                    title="Share"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(window.location.href);
                        setToast("Link copied!");
                      } catch {
                        setToast("Could not copy link");
                      }
                    }}
                  >
                    <i className="fas fa-share-nodes" />
                  </button>
                </div>
              </div>
            </div>

            {/* ════════════════════════════════════════════════
                PRODUCT INFO — right info column
                ════════════════════════════════════════════════ */}
            <div className="pd-info">

              {/* Brand */}
              <div className="pd-brand-row">
                {selectedVariant?.brandName && (
                  <span className="pd-brand-name">
                    Visit {selectedVariant.brandName} Store
                  </span>
                )}
                <span className="pd-auth-badge">
                  <i className="fas fa-check-circle" /> Authorized Seller
                </span>
              </div>

              {/* Title */}
              <h1 className="pd-title">{item.itemName}</h1>

              {/* Rating row */}
              <div className="pd-rating-row">
                <div className="pd-rating-badge">
                  4.5 <i className="fas fa-star" style={{ fontSize: "0.7rem" }} />
                </div>
                <span className="pd-rating-counts">
                  <b>2,847 ratings</b>
                </span>
                {category && (
                  <Link href={getCategoryUrl(category)} className="pd-write-review">
                    {category.name} Store
                  </Link>
                )}
              </div>

              {/* ── Price ── */}
              <div className="pd-price-box">
                <div className="pd-price-row">
                  {price > 0 ? (
                    <>
                      <span className="pd-price-current">{formatPrice(price)}</span>
                      {mrp > price && (
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          M.R.P.: <span className="pd-price-original">{formatPrice(mrp)}</span>
                        </span>
                      )}
                      {disc > 0 && (
                        <span className="pd-price-off">({disc}% off)</span>
                      )}
                    </>
                  ) : (
                    <span style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>
                      Price on request
                    </span>
                  )}
                </div>
                <p className="pd-price-tax">Inclusive of all taxes</p>
                {/* {price > 0 && (
                  <div className="pd-emi-row">
                    <i className="fas fa-credit-card" />
                    No Cost EMI from{" "}
                    <b>Rs {Math.round(price / 24).toLocaleString("en-IN")}/month</b>
                    <a href="#">View Plans</a>
                  </div>
                )} */}
              </div>

              {/* ── Colour Selector ── */}
              {showColorSelector && (
                <div className="pd-color-selector">
                  <p className="pd-selector-label">
                    <span className="pd-selector-key">Colour: </span>
                    <span className="pd-selector-val">{selectedColor?.colorName?.trim() ?? ""}</span>
                  </p>
                  <div className="pd-color-swatches">
                    {availableColors.map((color, idx) => (
                      <button
                        key={color.id ?? idx}
                        type="button"
                        onClick={() => handleColorSelect(idx)}
                        className={`pd-color-swatch${selectedColorIdx === idx ? " selected" : ""}`}
                        title={color.colorName}
                      >
                        <div className="pd-color-dot-wrap">
                          <div
                            className="pd-color-dot"
                            style={getColorSwatchStyle(color)}
                          />
                        </div>
                        <span className="pd-color-label">{color.colorName.trim()}</span>
                        {price > 0 && (
                          <span className="pd-color-price">{formatPrice(price)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Variant/Size Selector ── */}
              {variants.length > 1 && (
                <div className="pd-variant-selector">
                  <p className="pd-selector-label">
                    <span className="pd-selector-key">Size: </span>
                    <span className="pd-selector-val">
                      {selectedVariant?.variant ?? `Option ${selectedVariantIdx + 1}`}
                    </span>
                  </p>
                  <div className="pd-variant-pills">
                    {variants.map((v, idx) => {
                      const vPrice = getItemOfferPrice(v);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => handleVariantSelect(idx)}
                          className={`pd-variant-pill${selectedVariantIdx === idx ? " selected" : ""}`}
                        >
                          <span className="pd-variant-pill-name">
                            {v.variant || `Option ${idx + 1}`}
                          </span>
                          {vPrice > 0 && (
                            <span className="pd-variant-pill-price">
                              {formatPrice(vPrice)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Key specs */}
              {/* {specChips.length > 0 && (
                <div className="pd-specs-chips">
                  {specChips.map((chip, i) => (
                    <div key={i} className="pd-spec-chip">
                      <i className={`fas ${chip.icon}`} />
                      <span className="pd-spec-value">{chip.value}</span>
                      <span className="pd-spec-label">{chip.label}</span>
                    </div>
                  ))}
                </div>
              )} */}

              {/* Available offers assigned to this product (admin-managed) */}
              {productOffers.length > 0 && (
                <div className="pd-offers-section">
                  <div className="pd-offers-title">
                    <i className="fas fa-tag" /> Available Offers
                  </div>
                  <div className="pd-offers-grid">
                    {productOffers.map((offer) => {
                      const SECTION_LABEL: Record<string, string> = {
                        bank_offer: "Bank Offer",
                        coupon: "Coupon",
                        brand_deal: "Brand Deal",
                        flash_sale: "Flash Sale",
                        home_best: "Best Offer",
                        combo: "Combo Deal",
                        clearance: "Clearance",
                      };
                      const label = offer.bankName
                        ? `${offer.bankName}${offer.offerText ? ` — ${offer.offerText} ${offer.offerSub || ""}`.trimEnd() : ""}`
                        : offer.comboTitle
                        ? offer.comboTitle
                        : offer.couponTitle
                        ? offer.couponTitle
                        : offer.brandDealName
                        ? `${offer.brandDealName}${offer.discountLabel ? ` — ${offer.discountLabel}` : ""}`
                        : (SECTION_LABEL[offer.section] || "Offer");
                      const text = offer.description
                        || (offer.couponCode ? `Use code ${offer.couponCode} at checkout` : "")
                        || `${offer.offerText || ""} ${offer.offerSub || ""}`.trim()
                        || (offer.badge || "Special offer on this product");
                      return (
                        <div key={offer.id} className="pd-offer-card">
                          <div className="pd-offer-label">{label}</div>
                          <div className="pd-offer-text">
                            {text} <Link href="/offers">T&amp;C</Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Delivery */}
              {/* <div className="pd-delivery-box">
                <div className="pd-delivery-row">
                  <div className="pd-delivery-icon green">
                    <i className="fas fa-truck-fast" />
                  </div>
                  <div className="pd-delivery-text">
                    <b>FREE Delivery</b> — Ships within 24 hours
                  </div>
                </div>
                <div className="pd-delivery-row">
                  <div className="pd-delivery-icon blue">
                    <i className="fas fa-rotate-left" />
                  </div>
                  <div className="pd-delivery-text">
                    <b>15-Day Return Policy</b>
                  </div>
                </div>
                <div className="pd-delivery-row">
                  <div className="pd-delivery-icon purple">
                    <i className="fas fa-shield-halved" />
                  </div>
                  <div className="pd-delivery-text">
                    <b>Manufacturer Warranty</b> —{" "}
                    {selectedVariant?.brandName ?? "Brand"} terms.{" "}
                    <a href="#">Know More</a>
                  </div>
                </div>
                <div className="pd-pincode-row">
                  <input
                    className="pd-pincode-input"
                    type="text"
                    placeholder="Enter Pincode"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    type="button"
                    className="pd-pincode-btn"
                    onClick={() =>
                      pincode.length === 6 &&
                      setToast(`Delivery available to ${pincode}`)
                    }
                  >
                    Check
                  </button>
                </div>
              </div> */}

              {/* <div ref={actionRef} className="pd-action-btns">
                <button
                  type="button"
                  className={`pd-btn-cart${!inStock ? " is-unavailable" : ""}`}
                  onClick={() => selectedVariant && handleAddToCart(selectedVariant)}
                  disabled={!inStock}
                >
                  <i className={`fas ${inStock ? "fa-cart-plus" : "fa-ban"}`} /> {inStock ? "Add to Cart" : "Unavailable"}
                </button>
                <button
                  type="button"
                  className={`pd-btn-buy${!inStock ? " is-notify" : ""}`}
                  onClick={() => selectedVariant && handleBuyNow(selectedVariant)}
                  disabled={!inStock}
                >
                  <i className={`fas ${inStock ? "fa-bolt" : "fa-bell"}`} /> {inStock ? "Buy Now" : "Notify Me"}
                </button>
              </div>
              {!inStock && (
                <div className="pd-stock-note" role="status" aria-live="polite">
                  <div className="pd-stock-note-title">Coming Soon</div>
                  <div className="pd-stock-note-copy">
                    Out of stock right now. This variant is still visible, and you can use Notify Me when it is available again.
                  </div>
                </div>
              )} */}

              {/* Trust Badges */}
              {/* <div className="pd-trust-badges">
                {[
                  { icon: "fa-shield-halved", text: "100% Genuine" },
                  { icon: "fa-truck-fast", text: "Free Shipping" },
                  { icon: "fa-rotate-left", text: "Easy Returns" },
                  { icon: "fa-lock", text: "Secure Payment" },
                ].map((badge, i) => (
                  <div key={i} className="pd-trust-badge">
                    <i className={`fas ${badge.icon}`} />
                    <span>{badge.text}</span>
                  </div>
                ))}
              </div> */}

              <div className="pd-description">
                {descriptionHtml ? (
                  <div
                    className="pd-description-content"
                    dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                  />
                ) : (
                  <>
                    <h3>{item.itemName}</h3>
                    <p>
                      The <strong>{item.itemName}</strong>
                      {selectedVariant?.brandName ? ` by ${selectedVariant.brandName}` : ""}{" "}
                      is a premium product
                      {item.categoryName ? ` in the ${item.categoryName} category` : ""}.
                    </p>
                    {price > 0 && (
                      <p>
                        Priced at <strong>{formatPrice(price)}</strong>
                        {disc > 0 ? ` — saving you ${disc}% off MRP of ${formatPrice(mrp)}` : ""}. Inclusive of {selectedVariant?.gst ?? 0}% GST.
                      </p>
                    )}
                    {selectedColor?.colorName && selectedColor.colorName !== "Default" && (
                      <p>
                        Selected colour: <strong>{selectedColor.colorName}</strong>.
                      </p>
                    )}
                  </>
                )}
                <div className="pd-cat-info-card">
                  <h4>Product Details at a Glance</h4>
                  <div className="pd-detail-chips">
                    {selectedVariant?.brandName && (
                      <span className="pd-detail-chip">Brand: {selectedVariant.brandName}</span>
                    )}
                    {item.categoryName && (
                      <span className="pd-detail-chip">Category: {item.categoryName}</span>
                    )}
                    {selectedVariant?.variant && (
                      <span className="pd-detail-chip">Variant: {selectedVariant.variant}</span>
                    )}
                    {selectedColor?.colorName && selectedColor.colorName !== "Default" && (
                      <span className="pd-detail-chip">Colour: {selectedColor.colorName}</span>
                    )}
                    <span className="pd-detail-chip">GST: {selectedVariant?.gst ?? 0}%</span>
                    <span className={`pd-detail-chip ${inStock ? "in-stock" : "out-of-stock"}`}>
                      {inStock ? "In Stock" : "Out of Stock"}
                    </span>
                  </div>
                </div>
              </div>

              {/* ════════════════════════════════════════════════
                  FIX 2 & 3: ACTION BUTTONS — AppleNext brand colors
                  Add to Cart  = red gradient  (was Amazon yellow)
                  Buy Now      = orange/accent  (was Amazon orange-brown)
                  ════════════════════════════════════════════════ */}
              <div ref={actionRef} className="pd-action-btns">
                <button
                  type="button"
                  className={`pd-btn-cart${!inStock ? " is-unavailable" : ""}`}
                  onClick={() => purchaseTarget && handleAddToCart(purchaseTarget)}
                  disabled={!inStock || !purchaseTarget}
                >
                  <i className={`fas ${inStock ? "fa-cart-plus" : "fa-ban"}`} />{" "}
                  {inStock ? "Add to Cart" : "Unavailable"}
                </button>
                <button
                  type="button"
                  className={`pd-btn-buy${!inStock ? " is-notify" : ""}`}
                  onClick={() => purchaseTarget && handleBuyNow(purchaseTarget)}
                  disabled={!inStock || !purchaseTarget}
                >
                  <i className={`fas ${inStock ? "fa-bolt" : "fa-bell"}`} />{" "}
                  {inStock ? "Buy Now" : "Notify Me"}
                </button>
              </div>
              {!inStock && (
                <div className="pd-stock-note" role="status" aria-live="polite">
                  <div className="pd-stock-note-title">Coming Soon</div>
                  <div className="pd-stock-note-copy">
                    Out of stock right now. This product is still visible, and you can use Notify Me when it is available again.
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="pd-sections-wrap">
            <div className="pd-sections-inner">
              <div className="pd-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`pd-tab-btn${activeTab === tab.id ? " active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="pd-tab-content">
                {activeTab === "highlights" && (
                  <div className="pd-highlights-grid">
                    {[
                      {
                        icon: "fa-award",
                        bg: "#e3f2fd",
                        iconColor: "#1565c0",
                        title: `Brand: ${selectedVariant?.brandName ?? "—"}`,
                        desc: `Genuine ${selectedVariant?.brandName ?? ""} product with manufacturer warranty.`,
                      },
                      {
                        icon: "fa-tag",
                        bg: "#e8f5e9",
                        iconColor: "#2e7d32",
                        title: `Category: ${item.categoryName ?? "Electronics"}`,
                        desc: `Explore more products in the ${item.categoryName ?? ""} category.`,
                      },
                      {
                        icon: "fa-percent",
                        bg: "#fff3e0",
                        iconColor: "#e65100",
                        title: `GST: ${selectedVariant?.gst ?? 0}%`,
                        desc: `Price inclusive of ${selectedVariant?.gst ?? 0}% GST. No hidden charges.`,
                      },
                      {
                        icon: "fa-truck-fast",
                        bg: "#e8f5e9",
                        iconColor: "#2e7d32",
                        title: "Free Delivery Available",
                        desc: "Fast and free delivery across India within 3–5 business days.",
                      },
                      {
                        icon: "fa-shield-halved",
                        bg: "#f3e5f5",
                        iconColor: "#7b1fa2",
                        title: "100% Genuine Product",
                        desc: "Sourced directly from authorized distributors with full warranty.",
                      },
                      {
                        icon: "fa-rotate-left",
                        bg: "#fff8e1",
                        iconColor: "#f57f17",
                        title: "Easy 15-Day Returns",
                        desc: "Not satisfied? Return within 15 days for a full refund.",
                      },
                    ].map((h, i) => (
                      <div key={i} className="pd-highlight-card">
                        <div
                          className="pd-highlight-icon"
                          style={{ background: h.bg, color: h.iconColor }}
                        >
                          <i className={`fas ${h.icon}`} />
                        </div>
                        <div>
                          <h4>{h.title}</h4>
                          <p>{h.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "specs" && (
                  <table className="pd-specs-table">
                    <tbody>
                      {[
                        {
                          title: "General",
                          rows: [
                            ["Brand", selectedVariant?.brandName ?? "—"],
                            ["Product Name", item.itemName],
                            ["Category", item.categoryName ?? "—"],
                            ...(selectedVariant?.variant ? [["Variant", selectedVariant.variant]] : []),
                            ...(selectedColor?.colorName && selectedColor.colorName !== "Default"
                              ? [["Colour", selectedColor.colorName]]
                              : []),
                          ] as [string, string][],
                        },
                        {
                          title: "Pricing & Tax",
                          rows: [
                            ...(price > 0 ? [["Offer Price", formatPrice(price)]] : []),
                            ["MRP", formatPrice(mrp)],
                            ["GST Rate", `${selectedVariant?.gst ?? 0}%`],
                            ...(disc > 0 ? [["Discount", `${disc}% off`]] : []),
                          ] as [string, string][],
                        },
                        {
                          title: "Services",
                          rows: [
                            ["Demo Available", item.hasDemoInstallation ? "Yes" : "No"],
                            ["Warranty", "As per manufacturer terms"],
                            ["Return Policy", "15-Day Easy Returns"],
                            ["Delivery", "Free across India"],
                          ] as [string, string][],
                        },
                      ].map((group, gi) => (
                        <Fragment key={gi}>
                          <tr className="spec-group-header">
                            <td colSpan={2}>
                              <i className="fas fa-info-circle" />
                              {group.title}
                            </td>
                          </tr>
                          {group.rows.map(([key, val], ri) => (
                            <tr key={ri} className="spec-row">
                              <td className="spec-key">{key}</td>
                              <td className="spec-val">{val}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ── Related Products ── */}
          {compareItems.length > 1 && (
            <div className="pd-related-section pd-compare-section">
              <div className="pd-section-head">
                <div className="pd-section-head-left">
                  <div className="pd-section-icon blue">
                    <i className="fas fa-code-compare" />
                  </div>
                  <div>
                    <h2 className="pd-section-title">Compare with Similar</h2>
                    <p className="pd-section-subtitle">
                      Live comparison against similar products in this category
                    </p>
                  </div>
                </div>
              </div>
              <div className="pd-compare-scroll">
                <table className="pd-compare-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      {compareItems.map((compareItem, index) => {
                        const compareImage = getVariantFamilyImage(compareItem, [
                          ...compareItems,
                          ...currentFamilyItems,
                        ]);

                        return (
                          <th
                            key={compareItem.id}
                            className={index === 0 ? "current" : undefined}
                          >
                            <div className="pd-compare-product">
                              {compareImage ? (
                                <img
                                  src={getImageUrl(compareImage)}
                                  alt={compareItem.itemName}
                                  loading="lazy"
                                />
                              ) : (
                                <i className="fas fa-image pd-compare-placeholder" />
                              )}
                              <div className="cp-name">{getCompactItemName(compareItem, 34)}</div>
                              <div className="cp-price">
                                {formatPrice(compareItem.offerPrice ?? compareItem.nlc ?? 0)}
                              </div>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, index) => (
                          <td
                            key={`${row[0]}-${index}`}
                            className={index === 1 ? "current-col" : undefined}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {relatedItems.length > 0 && (
            <div className="pd-related-section">
              <div className="pd-section-head">
                <div className="pd-section-head-left">
                  <div className="pd-section-icon purple">
                    <i className="fas fa-arrow-up-right-dots" />
                  </div>
                  <div>
                    <h2 className="pd-section-title">You Might Also Like</h2>
                    <p className="pd-section-subtitle">
                      More {item.categoryName ?? "products"} from our collection
                    </p>
                  </div>
                </div>
                {category && (
                  <Link href={getCategoryUrl(category)} className="pd-view-all">
                    View All <i className="fas fa-arrow-right" />
                  </Link>
                )}
              </div>
              <div className="pd-products-scroll">
                {relatedItems.map((rel) => {
                  const relPrice = rel.offerPrice ?? rel.nlc ?? 0;
                  const relMrp = rel.nlc && rel.nlc > relPrice ? rel.nlc : 0;
                  const relImage = getVariantFamilyImage(rel, [
                    ...relatedItems,
                    ...currentFamilyItems,
                  ]);
                  return (
                    <div
                      key={getItemCardKey(rel)}
                      className="pd-product-card"
                      onClick={() => router.push(buildProductDetailUrlForItem(rel, relImage))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" && router.push(buildProductDetailUrlForItem(rel, relImage))
                      }
                    >
                      <div className="pc-img-wrap">
                        {relImage ? (
                          <img src={getImageUrl(relImage)} alt={rel.itemName} />
                        ) : (
                          <i className="fas fa-image" style={{ fontSize: "2rem", color: "#ccc" }} />
                        )}
                      </div>
                      <div className="pc-body">
                        <div className="pc-brand">{rel.brandName ?? "—"}</div>
                        <div className="pc-name">{getCompactItemName(rel, 44)}</div>
                        <div className="pc-price-row">
                          {relPrice > 0 ? (
                            <>
                              <span className="pc-price">{formatPrice(relPrice)}</span>
                              {relMrp > relPrice && (
                                <span className="pc-orig">{formatPrice(relMrp)}</span>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              Price on request
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="pc-cart-btn"
                          onClick={(e) => { e.stopPropagation(); handleAddToCart(rel); }}
                        >
                          <i className="fas fa-cart-plus" /> Add to Cart
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════
              FIX 4: STICKY BUY BAR — AppleNext brand colors
              Add to Cart = red,  Buy Now = orange
              ════════════════════════════════════════════════ */}
          {recentlyViewedItems.length > 0 && (
            <div className="pd-related-section pd-recent-section">
              <div className="pd-section-head">
                <div className="pd-section-head-left">
                  <div className="pd-section-icon red">
                    <i className="fas fa-clock-rotate-left" />
                  </div>
                  <div>
                    <h2 className="pd-section-title">Recently Viewed</h2>
                    <p className="pd-section-subtitle">Continue where you left off</p>
                  </div>
                </div>
                <Link href="/products" className="pd-view-all">
                  View All <i className="fas fa-arrow-right" />
                </Link>
              </div>
              <div className="pd-products-scroll">
                {recentlyViewedItems.map((recentItem) => {
                  const recentImage = getVariantFamilyImage(recentItem, recentlyViewedItems);
                  return (
                    <ItemRailCard
                      key={recentItem.id}
                      item={recentItem}
                      imageSrc={recentImage}
                      onOpen={() => router.push(buildProductDetailUrlForItem(recentItem, recentImage))}
                      onAddToCart={handleAddToCart}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className={`pd-sticky-bar${showSticky ? " visible" : " hidden"}`}>
            <div className="pd-sticky-inner">
              <div className="pd-sticky-info">
                {/* FIX 5: emoji characters */}
                <div className="pd-sticky-icon">{getCategoryEmoji()}</div>
                <div>
                  <div className="pd-sticky-name">
                    {item.itemName.length > 40
                      ? item.itemName.slice(0, 40) + "…"
                      : item.itemName}
                    {selectedVariant?.variant ? ` — ${selectedVariant.variant}` : ""}
                    {selectedColor?.colorName && selectedColor.colorName !== "Default"
                      ? ` (${selectedColor.colorName})`
                      : ""}
                  </div>
                  {/* FIX 4: price row now shows Rs correctly via formatPrice */}
                  <div className="pd-sticky-price-row">
                    {price > 0 && (
                      <span className="pd-sticky-price">{formatPrice(price)}</span>
                    )}
                    {mrp > price && (
                      <span className="pd-sticky-orig">{formatPrice(mrp)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="pd-sticky-btns">
                <button
                  type="button"
                  className="pd-sticky-cart"
                  onClick={() => purchaseTarget && handleAddToCart(purchaseTarget)}
                  disabled={!inStock || !purchaseTarget}
                >
                  <i className={`fas ${inStock ? "fa-cart-plus" : "fa-ban"}`} />{" "}
                  {inStock ? "Add to Cart" : "Unavailable"}
                </button>
                <button
                  type="button"
                  className="pd-sticky-buy"
                  onClick={() => purchaseTarget && handleBuyNow(purchaseTarget)}
                  disabled={!inStock || !purchaseTarget}
                >
                  <i className={`fas ${inStock ? "fa-bolt" : "fa-bell"}`} />{" "}
                  {inStock ? "Buy Now" : "Notify Me"}
                </button>
              </div>
              {/* <div className="pd-sticky-btns">
                <button
                  type="button"
                  className="pd-sticky-cart"
                  onClick={() => selectedVariant && handleAddToCart(selectedVariant)}
                >
                  <i className="fas fa-cart-plus" /> Add to Cart
                </button>
                <button
                  type="button"
                  className="pd-sticky-buy"
                  onClick={() => selectedVariant && handleBuyNow(selectedVariant)}
                >
                  <i className="fas fa-bolt" /> Buy Now
                </button>
              </div> */}
            </div>
          </div>
        </>
      )}

      {/* ── Footer ── */}
      <footer className="pd-footer">
        <div className="pd-footer-top">
          <div>
            <div className="pd-footer-logo">APPLENEXT</div>
            <p className="pd-footer-desc">
              Your one-stop destination for genuine electronics at the best prices.
            </p>
            <div className="pd-footer-social">
              {footerSocialIcons.map((icon) => (
                <a key={icon} href="#" aria-label={icon}>
                  <i className={`fab ${icon}`} />
                </a>
              ))}
            </div>
          </div>
          {footerGroups.map((group) => (
            <div key={group.title} className="pd-footer-col">
              <h4>{group.title}</h4>
              {group.links.map((link) => (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="pd-footer-bottom">
          <p>© 2026 AppleNext Electronics. All rights reserved.</p>
          <div className="pd-footer-payments">
            {["Visa", "Mastercard", "UPI", "Net Banking", "EMI"].map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </footer>

      {/* Back to Top */}
      <button
        type="button"
        className={`pd-btt${showTop ? " visible" : ""}`}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Back to top"
      >
        <i className="fas fa-arrow-up" />
      </button>

      {/* Toast */}
      {toast && (
        <div className="pd-toast-wrap">
          <div className="pd-toast">
            <i className="fas fa-check-circle" /> {toast}
          </div>
        </div>
      )}
    </div>
  );
}
