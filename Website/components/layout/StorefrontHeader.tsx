"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCategories } from "@/lib/hooks/usePublicData";
import { getCategoryUrl, slugifyCategoryName, type Category } from "@/lib/api/publicApi";
import { useWishlist } from "@/lib/wishlist/wishlist-context";
import { useCart } from "@/lib/cart/cart-context";
import { useAccount } from "@/lib/account/account-context";
import { isLoggedIn, onCustomerAuthChange } from "@/lib/api/customerApi";
import { announcementItems, navLinks } from "@/lib/data/homePageData";
import "./StorefrontHeader.css";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  mobiles: ["mobile", "phone", "smartphone"],
  tvs: ["tv", "television"],
  laptops: ["laptop", "pc", "computer"],
  appliances: ["appliance", "refrigerator", "washing-machine", "air-conditioner", "ac"],
};

function getCategoryLinkByLabel(categories: Category[], label: string): string {
  const normalizedLabel = slugifyCategoryName(label);
  const keywords = CATEGORY_KEYWORDS[normalizedLabel] ?? [normalizedLabel];

  const matched = categories.find((category) => {
    const slug = slugifyCategoryName(category.slug || category.name);
    return keywords.some((keyword) => slug.includes(keyword) || keyword.includes(slug));
  });

  return matched ? getCategoryUrl(matched) : "/products";
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

  const navItems = useMemo(
    () =>
      navLinks.map((item) => ({
        ...item,
        href: ["Mobiles", "TVs", "Laptops", "Appliances"].includes(item.label)
          ? getCategoryLinkByLabel(liveCategories, item.label)
          : item.href === "/category"
            ? "/products"
            : item.href,
      })),
    [liveCategories],
  );

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

      <header className="sf-site-header">
        <div className="sf-header-top">
          <Link href="/" className="sf-logo">
            <Image
              src="/motabhai_log.jpeg"
              alt="Motabhai Electronics"
              width={615}
              height={220}
              priority
              className="sf-logo-image"
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
            {headerActions.map((item) => {
              const buttonClass = "buttonClass" in item ? item.buttonClass : "";
              const activeKey = "activeKey" in item ? item.activeKey : item.label;
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

        <nav className="sf-nav-bar">
          <div className="sf-nav-inner">
            <div className="sf-nav-menu">
              {navItems.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href !== "/products" && item.href !== "/category"
                      ? pathname.startsWith(item.href)
                      : false;

                return (
                  <div key={`${item.label}-${item.href}`} className={`sf-nav-item${item.highlighted ? " sf-nav-highlight" : ""}`}>
                    <Link href={item.href} className={active ? "active" : ""}>
                      <i className={`fas ${item.icon}`} /> {item.label}
                    </Link>
                  </div>
                );
              })}
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
