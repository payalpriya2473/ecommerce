"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCategories } from "@/lib/hooks/usePublicData";
import { getCategoryUrl, type Category } from "@/lib/api/publicApi";
import { useWishlist } from "@/lib/wishlist/wishlist-context";
import { useCart } from "@/lib/cart/cart-context";
import { useAccount } from "@/lib/account/account-context";
import { isLoggedIn, onCustomerAuthChange } from "@/lib/api/customerApi";
import { useTheme } from "@/lib/theme/theme-context";
// announcementItems is only used by the (temporarily disabled) announcement bar.
import { navLinks } from "@/lib/data/homePageData";
import "./StorefrontHeader.css";

/**
 * Category Management stores no icon, so one is inferred from the name. Order
 * matters — the first matching keyword wins, so put narrower terms first
 * ("small appliance" before "appliance").
 */
const CATEGORY_ICON_RULES: Array<[RegExp, string]> = [
  [/small.?appliance|kitchen|blender|mixer|microwave/, "fa-blender"],
  [/mobile|phone|smart.?phone|cellular/, "fa-mobile-screen"],
  [/tv|television|display|monitor/, "fa-tv"],
  [/laptop|notebook|macbook|computer|pc\b/, "fa-laptop"],
  [/tablet|ipad/, "fa-tablet-screen-button"],
  [/watch|wearable|band/, "fa-clock"],
  [/audio|headphone|earphone|earbud|speaker|sound/, "fa-headphones"],
  [/camera|photo|lens/, "fa-camera"],
  [/game|gaming|console/, "fa-gamepad"],
  [/appliance|refrigerator|fridge|washing|air.?condition|\bac\b|cooler/, "fa-blender"],
  [/accessor|cable|charger|adapter|case/, "fa-plug"],
  [/network|router|wifi|wi-fi/, "fa-wifi"],
  [/print|scanner/, "fa-print"],
];

function iconForCategory(category: Category): string {
  const haystack = `${category.name} ${category.slug ?? ""}`.toLowerCase();
  for (const [pattern, icon] of CATEGORY_ICON_RULES) {
    if (pattern.test(haystack)) return icon;
  }
  return "fa-tag";
}

/**
 * Sorts by the display order configured in the admin panel, falling back to
 * alphabetical. Categories without an order sink below those that have one
 * rather than jumping to the front (which is what a raw numeric sort with
 * null/undefined would do).
 */
function byDisplayOrderThenName(a: Category, b: Category): number {
  const ao = a.displayOrder;
  const bo = b.displayOrder;
  const aHas = typeof ao === "number" && Number.isFinite(ao);
  const bHas = typeof bo === "number" && Number.isFinite(bo);
  if (aHas && bHas && ao !== bo) return (ao as number) - (bo as number);
  if (aHas !== bHas) return aHas ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** Width reserved for the "More" trigger when deciding what fits inline. */
const MORE_TRIGGER_WIDTH = 104;
/** Below this width the nav scrolls horizontally instead of collapsing. */
const COLLAPSE_BREAKPOINT = 768;

interface NavItem {
  key: string;
  label: string;
  icon: string;
  href: string;
  highlighted?: boolean;
  /** Set only for links generated from Category Management. */
  categoryId?: string;
}

function isActionActive(pathname: string, label: string) {
  if (label === "Account") return pathname.startsWith("/account");
  if (label === "Wishlist") return pathname.startsWith("/wishlist");
  if (label.startsWith("Cart")) return pathname.startsWith("/cart") || pathname.startsWith("/checkout");
  if (label === "Support") return pathname.startsWith("/faq");
  return false;
}

function getDefaultLocationLabel(addressType?: string) {
  if (addressType === "work") return "Work";
  if (addressType === "other") return "Other";
  return "Location";
}

export default function StorefrontHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: liveCategories } = useCategories({ showOnWebsite: true });
  const { itemCount: wishlistCount } = useWishlist();
  const { totalQuantity: cartTotalQuantity } = useCart();
  const { addresses, profile } = useAccount();
  const { theme, ready: themeReady, toggleTheme } = useTheme();

  const defaultAddress = addresses.find((address) => address.isDefault);
  const initialQuery = searchParams.get("q") ?? "";
  const [hasHydrated, setHasHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState("All Categories");

  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const [isCustomer, setIsCustomer] = useState(false);

  useEffect(() => {
    const sync = () => setIsCustomer(isLoggedIn());
    sync();
    return onCustomerAuthChange(sync);
  }, []);

  const stableWishlistCount = hasHydrated ? wishlistCount : 0;
  const stableTotalQuantity = hasHydrated ? cartTotalQuantity : 0;
  const stableDefaultAddressType = hasHydrated ? defaultAddress?.type : undefined;
  const stableIsCustomer = hasHydrated ? isCustomer : false;
  const accountLabel = stableIsCustomer && profile.firstName ? profile.firstName : "Account";

  // "Home" leads, then the live categories, then the rest of the fixed chrome.
  // The API already filters to active + show-on-website and sorts by
  // display_order; sorting again here keeps the order right if that changes.
  const { leadItems, categoryItems, tailItems } = useMemo(() => {
    const toStatic = (item: (typeof navLinks)[number]): NavItem => ({
      key: `static-${item.label}`,
      label: item.label,
      icon: item.icon,
      href: item.href,
      highlighted: item.highlighted,
    });

    return {
      leadItems: navLinks.slice(0, 1).map(toStatic),
      tailItems: navLinks.slice(1).map(toStatic),
      categoryItems: [...liveCategories]
        .filter((category) => category.isActive !== false)
        .sort(byDisplayOrderThenName)
        .map<NavItem>((category) => ({
          key: `category-${category.id}`,
          label: category.name,
          icon: iconForCategory(category),
          href: getCategoryUrl(category),
          categoryId: String(category.id),
        })),
    };
  }, [liveCategories]);

  // ── Overflow into a "More" dropdown ──────────────────────────────────────
  // Only categories collapse. Home / Brands / About / Offers are navigation
  // landmarks and stay put — burying them under "More" while a long category
  // list took the whole row would be the wrong trade.
  const menuRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const widthsRef = useRef<{ fixed: number; categories: number[] }>({ fixed: 0, categories: [] });
  const [visibleCount, setVisibleCount] = useState(categoryItems.length);
  const [measured, setMeasured] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const navSignature = categoryItems.map((item) => item.key).join("|");

  // A new set of categories invalidates the cached widths — show everything
  // again so the next measure pass sees real, unhidden elements.
  useEffect(() => {
    widthsRef.current = { fixed: 0, categories: [] };
    setMeasured(false);
    setVisibleCount(categoryItems.length);
    setMoreOpen(false);
  }, [navSignature, categoryItems.length]);

  const recompute = useCallback(() => {
    const menu = menuRef.current;
    const { fixed, categories } = widthsRef.current;
    if (!menu || !categories.length) return;

    // Narrow screens keep the existing horizontal-scroll behaviour.
    if (window.innerWidth <= COLLAPSE_BREAKPOINT) {
      setVisibleCount(categories.length);
      return;
    }

    const budget = menu.clientWidth - fixed;
    const total = categories.reduce((sum, w) => sum + w, 0);
    if (total <= budget) {
      setVisibleCount(categories.length);
      return;
    }

    let used = 0;
    let count = 0;
    for (const w of categories) {
      if (used + w > budget - MORE_TRIGGER_WIDTH) break;
      used += w;
      count += 1;
    }
    // A "More" holding a single category is not worth the click.
    setVisibleCount(categories.length - count === 1 ? categories.length : count);
  }, []);

  // Cache natural widths once, while every item is rendered.
  useLayoutEffect(() => {
    if (measured) return;
    const menu = menuRef.current;
    if (!menu) return;
    const children = Array.from(menu.children).filter(
      (el) => !el.classList.contains("sf-nav-more"),
    ) as HTMLElement[];
    const expected = leadItems.length + categoryItems.length + tailItems.length;
    if (children.length !== expected || expected === 0) return;

    const widths = children.map((el) => Math.ceil(el.getBoundingClientRect().width));
    const catStart = leadItems.length;
    const catEnd = catStart + categoryItems.length;
    widthsRef.current = {
      fixed: widths.slice(0, catStart).concat(widths.slice(catEnd)).reduce((s, w) => s + w, 0),
      categories: widths.slice(catStart, catEnd),
    };
    setMeasured(true);
  }, [measured, leadItems.length, categoryItems.length, tailItems.length]);

  useEffect(() => {
    if (!measured) return;
    recompute();
    const menu = menuRef.current;
    if (!menu || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", recompute);
      return () => window.removeEventListener("resize", recompute);
    }
    const observer = new ResizeObserver(recompute);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [measured, recompute]);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  // Route changes should never leave the dropdown hanging open.
  useEffect(() => setMoreOpen(false), [pathname, searchParams]);

  const inlineItems = [...leadItems, ...categoryItems.slice(0, visibleCount)];
  const overflowItems = categoryItems.slice(visibleCount);

  const activeCategoryId = searchParams.get("categoryId") ?? searchParams.get("id");

  const isNavItemActive = useCallback(
    (item: NavItem) => {
      if (item.categoryId) {
        return pathname.startsWith("/products") && activeCategoryId === item.categoryId;
      }
      if (item.href === "/") return pathname === "/";
      if (item.href === "/products") return false;
      return pathname.startsWith(item.href);
    },
    [pathname, activeCategoryId],
  );

  const overflowHasActive = overflowItems.some(isNavItemActive);

  const headerActions = useMemo(
    () => [
      { label: getDefaultLocationLabel(stableDefaultAddressType), icon: "fas fa-location-dot" },
      { label: "Wishlist", icon: "far fa-heart", href: "/wishlist", badge: stableWishlistCount > 0 ? String(stableWishlistCount) : undefined },
      { label: "Support", icon: "fas fa-headset", href: "/faq" },
      {
        label: accountLabel,
        activeKey: "Account",
        icon: "fas fa-user",
        buttonClass: "account-action",
        // Signed-out shoppers land on login first, then bounce back to their account.
        href: stableIsCustomer ? "/account" : "/login?redirect=/account",
        title: stableIsCustomer ? "My Account" : "Sign in to your account",
      },
      { label: "Cart", icon: "fas fa-shopping-cart", href: "/cart", buttonClass: "cart-action", badge: stableTotalQuantity > 0 ? String(stableTotalQuantity) : undefined },
    ],
    [stableDefaultAddressType, stableWishlistCount, stableTotalQuantity, stableIsCustomer, accountLabel],
  );

  const categoryOptions = useMemo(
    () => ["All Categories", ...liveCategories.slice(0, 8).map((category) => category.name)],
    [liveCategories],
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      router.push("/products");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    if (value === "All Categories") {
      router.push("/products");
      return;
    }

    const selected = liveCategories.find((category) => category.name === value);
    if (selected) router.push(getCategoryUrl(selected));
  };

  return (
    <>
      {/* Temporarily disabled: scrolling announcement bar at the top of the site.
      <div className="sf-ann-bar">
        <div className="sf-ann-track">
          {[...announcementItems, ...announcementItems].map((item, index) => (
            <div key={`${item.text}-${index}`} className="sf-ann-item">
              <i className={`fas ${item.icon}`} />
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
      */}

      <header className="sf-site-header">
        <div className="sf-header-top">
          <Link href="/" className="sf-logo">
            {/* Two files instead of a CSS filter so the mark stays crisp in both themes */}
            <Image
              src="/applenext_logo.png"
              alt="AppleNext Electronics"
              width={774}
              height={272}
              priority
              className="sf-logo-image sf-logo-image--light"
            />
            <Image
              src="/applenext_logo_dark.png"
              alt=""
              aria-hidden="true"
              width={774}
              height={272}
              priority
              className="sf-logo-image sf-logo-image--dark"
            />
          </Link>

          <div className="sf-search-bar">
            <form className="sf-search-inner" onSubmit={handleSearchSubmit}>
              <select value={selectedCategory} onChange={(event) => handleCategoryChange(event.target.value)}>
                {categoryOptions.map((category, index) => (
                  <option key={`${category}-${index}`} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Search for mobiles, laptops, appliances & more..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <button className="sf-search-btn" type="submit" aria-label="Search">
                <i className="fas fa-search" />
              </button>
            </form>
          </div>

          <div className="sf-header-actions">
            <button
              type="button"
              className="sf-theme-toggle"
              onClick={toggleTheme}
              aria-label={themeReady ? (theme === "dark" ? "Switch to light theme" : "Switch to dark theme") : "Change theme"}
              title={themeReady ? (theme === "dark" ? "Light mode" : "Dark mode") : "Change theme"}
            >
              <i className={`fas ${themeReady && theme === "dark" ? "fa-moon" : "fa-sun"}`} aria-hidden="true" />
            </button>

            {headerActions.map((item) => {
              const buttonClass = "buttonClass" in item ? item.buttonClass : "";
              const activeKey = ("activeKey" in item ? item.activeKey : item.label) ?? item.label;
              const title = "title" in item ? item.title : undefined;
              const className = [
                "sf-h-action",
                buttonClass ? `sf-${buttonClass}` : "",
                isActionActive(pathname, activeKey) ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return item.href ? (
                <Link key={activeKey} href={item.href} className={className} title={title}>
                  <i className={item.icon} />
                  <span>{item.label}</span>
                  {item.badge ? <div className="sf-badge">{item.badge}</div> : null}
                </Link>
              ) : (
                <div key={item.label} className={className}>
                  <i className={item.icon} />
                  <span>{item.label}</span>
                  {item.badge ? <div className="sf-badge">{item.badge}</div> : null}
                </div>
              );
            })}
          </div>
        </div>

        <nav className="sf-nav-bar" aria-label="Primary">
          <div className="sf-nav-inner">
            <div className="sf-nav-menu" ref={menuRef}>
              {inlineItems.map((item) => (
                <div
                  key={item.key}
                  className={`sf-nav-item${item.highlighted ? " sf-nav-highlight" : ""}`}
                >
                  <Link
                    href={item.href}
                    className={isNavItemActive(item) ? "active" : ""}
                    aria-current={isNavItemActive(item) ? "page" : undefined}
                  >
                    <i className={`fas ${item.icon}`} /> {item.label}
                  </Link>
                </div>
              ))}

              {overflowItems.length > 0 && (
                <div
                  className={`sf-nav-item sf-nav-more${moreOpen ? " is-open" : ""}`}
                  ref={moreRef}
                >
                  <button
                    type="button"
                    className={overflowHasActive ? "active" : ""}
                    onClick={() => setMoreOpen((open) => !open)}
                    aria-expanded={moreOpen}
                    aria-haspopup="true"
                  >
                    <i className="fas fa-ellipsis" /> More
                    <i className="fas fa-chevron-down sf-nav-more-caret" aria-hidden="true" />
                  </button>

                  {moreOpen && (
                    <div className="sf-nav-dropdown" role="menu">
                      {overflowItems.map((item) => (
                        <Link
                          key={item.key}
                          href={item.href}
                          role="menuitem"
                          className={isNavItemActive(item) ? "active" : ""}
                          aria-current={isNavItemActive(item) ? "page" : undefined}
                          onClick={() => setMoreOpen(false)}
                        >
                          <i className={`fas ${item.icon}`} /> {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tailItems.map((item) => (
                <div
                  key={item.key}
                  className={`sf-nav-item${item.highlighted ? " sf-nav-highlight" : ""}`}
                >
                  <Link
                    href={item.href}
                    className={isNavItemActive(item) ? "active" : ""}
                    aria-current={isNavItemActive(item) ? "page" : undefined}
                  >
                    <i className={`fas ${item.icon}`} /> {item.label}
                  </Link>
                </div>
              ))}
            </div>

            <Link href="/offers" className="sf-nav-offer">
              <i className="fas fa-bolt" />
              Today&apos;s Best Offers
            </Link>
          </div>
        </nav>
      </header>
    </>
  );
}
