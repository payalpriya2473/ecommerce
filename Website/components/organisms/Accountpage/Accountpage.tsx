"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getImageUrl } from "@/lib/api/publicApi";
import { customerAuthAPI, isLoggedIn, onCustomerAuthChange } from "@/lib/api/customerApi";
import { useCart } from "@/lib/cart/cart-context";
import { useWishlist } from "@/lib/wishlist/wishlist-context";
import { useAccount, AccountAddress, AccountPanelSettingKey } from "@/lib/account/account-context";
import { announcementItems, headerActions, navLinks } from "@/lib/data/homePageData";
import "./Accountpage.css";

type Panel = "overview" | "orders" | "addresses" | "wishlist" | "wallet" | "profile" | "settings";
type ToastType = "success" | "warning" | "info";

interface Toast {
  id: number;
  html: string;
  type: ToastType;
}

type AddressFormState = {
  type: AccountAddress["type"];
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pinCode: string;
  isDefault: boolean;
};

const STATUS_CLASS = {
  delivered: "acc-status-delivered",
  shipped: "acc-status-shipped",
  processing: "acc-status-processing",
  cancelled: "acc-status-cancelled",
  returned: "acc-status-returned",
} as const;

const STATUS_ICON = {
  delivered: "fas fa-check-circle",
  shipped: "fas fa-truck",
  processing: "fas fa-rotate",
  cancelled: "fas fa-xmark",
  returned: "fas fa-rotate-left",
} as const;

const fp = (value: number) => `Rs ${value.toLocaleString("en-IN")}`;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatMemberSince(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Member since recently";
  return `Member since ${date.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`;
}

function initials(firstName: string, lastName: string, email: string) {
  const base = `${firstName} ${lastName}`.trim() || email.trim();
  if (!base) return "A";
  return base
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";
}

function createEmptyAddress(profileName: string, profilePhone: string): AddressFormState {
  return {
    type: "home",
    name: profileName,
    phone: profilePhone,
    line1: "",
    line2: "",
    city: "",
    state: "",
    pinCode: "",
    isDefault: false,
  };
}

export default function AccountPage() {
  const [panel, setPanel] = useState<Panel>("overview");
  const [orderFilter, setOrderFilter] = useState("all");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [profileEdit, setProfileEdit] = useState(false);
  const [showTrackId, setShowTrackId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<AddressFormState>(createEmptyAddress("", ""));
  const [addressEditId, setAddressEditId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressBusy, setAddressBusy] = useState(false);
  const toastIdRef = useRef(0);

  const { items: cartItems, totalQuantity, addItem: addCartItem } = useCart();
  const { items: wishlistItems, itemCount: wishlistCount, removeItem: removeWishlistItem } = useWishlist();
  const {
    profile,
    saveProfile,
    addresses,
    addAddress,
    updateAddress,
    removeAddress,
    setDefaultAddress,
    orders,
    settings,
    updateSetting,
  } = useAccount();

  const [draftProfile, setDraftProfile] = useState(profile);

  useEffect(() => {
    setDraftProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!showAddressForm || addressEditId) return;
    setAddressForm(createEmptyAddress(`${profile.firstName} ${profile.lastName}`.trim(), profile.phone));
  }, [showAddressForm, addressEditId, profile.firstName, profile.lastName, profile.phone]);

  const activeOrder = useMemo(
    () => orders.find((order) => order.id === showTrackId) ?? null,
    [orders, showTrackId]
  );

  const rewardsPoints = useMemo(
    () => orders.reduce((sum, order) => sum + Math.floor(order.total / 1000), 0),
    [orders]
  );
  const walletBalance = rewardsPoints / 10;
  const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
  const activeOrdersCount = orders.filter((order) => order.status === "processing" || order.status === "shipped").length;
  const recentOrder = orders[0] ?? null;

  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") return orders;
    if (orderFilter === "active") {
      return orders.filter((order) => order.status === "processing" || order.status === "shipped");
    }
    return orders.filter((order) => order.status === orderFilter);
  }, [orders, orderFilter]);

  const showToast = (html: string, type: ToastType = "success") => {
    const id = ++toastIdRef.current;
    setToasts((current) => [...current, { id, html, type }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const switchPanel = (nextPanel: Panel) => {
    setPanel(nextPanel);
    window.history.replaceState(null, "", `/account#${nextPanel}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmLogout = async () => {
    if (!window.confirm("Are you sure you want to sign out?")) return;
    await customerAuthAPI.logout();
    window.location.href = "/login";
  };

  // ── Sign-in state: /account is only meaningful for a logged-in customer ──
  const [authState, setAuthState] = useState<"checking" | "guest" | "member">("checking");

  useEffect(() => {
    const sync = () => setAuthState(isLoggedIn() ? "member" : "guest");
    sync();
    return onCustomerAuthChange(sync);
  }, []);

  useEffect(() => {
    const syncPanelFromHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (["overview", "orders", "addresses", "wishlist", "wallet", "profile", "settings"].includes(hash)) {
        setPanel(hash as Panel);
      }
    };

    syncPanelFromHash();
    window.addEventListener("hashchange", syncPanelFromHash);

    return () => window.removeEventListener("hashchange", syncPanelFromHash);
  }, []);

  function handleRemoveWishlistItem(id: string) {
    removeWishlistItem(id);
    showToast('<i class="fas fa-xmark"></i> Removed from wishlist', "warning");
  }

  function handleMoveWishlistToCart(id: string) {
    const item = wishlistItems.find((entry) => entry.id === id);
    if (!item) return;

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
    showToast(`<i class="fas fa-cart-plus"></i> ${item.itemName} added to cart`);
  }

  async function handleDeleteAddress(id: string) {
    const target = addresses.find((address) => address.id === id);
    if (!target) return;
    if (target.isDefault) {
      showToast('<i class="fas fa-triangle-exclamation"></i> Cannot delete default address', "warning");
      return;
    }

    await removeAddress(id);
    showToast('<i class="fas fa-trash"></i> Address removed', "warning");
  }

  async function handleSaveProfile() {
    await saveProfile(draftProfile);
    setProfileEdit(false);
    showToast('<i class="fas fa-check-circle"></i> Profile updated successfully!');
  }

  function resetAddressForm() {
    setAddressEditId(null);
    setShowAddressForm(false);
    setAddressForm(createEmptyAddress(`${profile.firstName} ${profile.lastName}`.trim(), profile.phone));
  }

  function openNewAddressForm() {
    setAddressEditId(null);
    setAddressForm(createEmptyAddress(`${profile.firstName} ${profile.lastName}`.trim(), profile.phone));
    setShowAddressForm(true);
  }

  function openEditAddressForm(address: AccountAddress) {
    setAddressEditId(address.id);
    setAddressForm({
      type: address.type,
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city ?? "",
      state: address.state ?? "",
      pinCode: address.pinCode ?? "",
      isDefault: address.isDefault,
    });
    setShowAddressForm(true);
  }

  async function handleSaveAddress() {
    if (!addressForm.name.trim() || !addressForm.phone.trim() || !addressForm.line1.trim()) {
      showToast('<i class="fas fa-triangle-exclamation"></i> Name, phone, and address line 1 are required', "warning");
      return;
    }

    setAddressBusy(true);
    const payload = {
      ...addressForm,
      name: addressForm.name.trim(),
      phone: addressForm.phone.trim(),
      line1: addressForm.line1.trim(),
      line2: addressForm.line2.trim(),
      city: addressForm.city.trim(),
      state: addressForm.state.trim(),
      pinCode: addressForm.pinCode.trim(),
      isDefault: addressForm.isDefault || addresses.length === 0,
    };

    if (addressEditId) {
      await updateAddress(addressEditId, payload);
      showToast('<i class="fas fa-pen"></i> Address updated everywhere');
    } else {
      await addAddress(payload);
      showToast('<i class="fas fa-location-dot"></i> Address saved and ready for checkout');
    }

    setAddressBusy(false);
    resetAddressForm();
  }

  const profileName = `${profile.firstName} ${profile.lastName}`.trim() || "AppleNext Customer";
  const profileEmail = profile.email || "Add your email in profile settings";
  const profilePhone = profile.phone || "Add your phone number";
  const currentPanelLabel = panel === "wishlist" ? "Wishlist" : panel === "addresses" ? "Saved Addresses" : panel === "orders" ? "My Orders" : panel === "wallet" ? "Wallet & Rewards" : panel === "profile" ? "Edit Profile" : panel === "settings" ? "Settings" : "My Account";

  const settingsRows: Array<{
    title: string;
    icon: string;
    rows: { key: AccountPanelSettingKey; title: string; subtitle: string }[];
  }> = [
    {
      title: "Notifications",
      icon: "fas fa-bell",
      rows: [
        { key: "orderUpdates", title: "Order Updates", subtitle: "Get SMS and email updates on order status" },
        { key: "offersPromotions", title: "Offers & Promotions", subtitle: "Flash sales, coupons, and exclusive deals" },
        { key: "priceDropAlerts", title: "Price Drop Alerts", subtitle: "Notify when wishlist items go on sale" },
        { key: "whatsAppNotifications", title: "WhatsApp Notifications", subtitle: "Receive order updates via WhatsApp" },
      ],
    },
    {
      title: "Privacy & Security",
      icon: "fas fa-shield-halved",
      rows: [
        { key: "twoFactorAuth", title: "Two-Factor Authentication", subtitle: "Extra security via OTP on every login" },
        { key: "loginActivityAlerts", title: "Login Activity Alerts", subtitle: "Get notified of new device logins" },
        { key: "personalisedRecommendations", title: "Personalised Recommendations", subtitle: "Show products based on browsing history" },
      ],
    },
  ];

  if (authState !== "member") {
    return (
      <div className="acc-root">
        <div className="acc-breadcrumb-bar"><div className="acc-breadcrumb">
          <Link href="/">Home</Link><i className="fas fa-chevron-right acc-sep" />
          <span className="acc-current">My Account</span>
        </div></div>

        <div className="acc-signin-gate">
          <div className="acc-signin-icon"><i className="fas fa-user-lock" /></div>
          <h2>{authState === "checking" ? "Checking your session…" : "Sign in to view your account"}</h2>
          <p>
            {authState === "checking"
              ? "One moment while we load your details."
              : "Your profile, orders, saved addresses and wishlist all live here once you're signed in."}
          </p>
          {authState === "guest" && (
            <div className="acc-signin-actions">
              <Link href="/login?redirect=/account" className="acc-signin-primary">
                <i className="fas fa-right-to-bracket" /> Sign In / Register
              </Link>
              <Link href="/products" className="acc-signin-outline">
                <i className="fas fa-store" /> Continue Shopping
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="acc-root">
      <div className="acc-breadcrumb-bar"><div className="acc-breadcrumb">
        <Link href="/">Home</Link><i className="fas fa-chevron-right acc-sep" />
        <span className="acc-current">{currentPanelLabel}</span>
      </div></div>

      <div className="acc-page-inner">
        <aside className="acc-sidebar">
          <div className="acc-profile-card">
            <div className="acc-avatar-wrap">
              <div className="acc-avatar">{initials(profile.firstName, profile.lastName, profile.email)}</div>
              <div className="acc-avatar-edit" onClick={() => switchPanel("profile")}><i className="fas fa-camera" /></div>
            </div>
            <div className="acc-profile-name">{profileName}</div>
            <div className="acc-profile-email">{profileEmail}</div>
            <div className="acc-profile-since"><i className="fas fa-calendar-days" /> {formatMemberSince(profile.memberSince)}</div>
            <div className="acc-profile-badges">
              <div className="acc-pb verified"><i className="fas fa-check-circle" /> Verified</div>
              <div className="acc-pb gold"><i className="fas fa-crown" /> {rewardsPoints >= 5000 ? "Gold" : "Member"}</div>
            </div>
          </div>

          <div className="acc-points-card">
            <div className="acc-points-header">
              <h4><i className="fas fa-star" /> AppleNext Reward Points</h4>
              <button className="acc-points-link" onClick={() => switchPanel("wallet")}>View Wallet</button>
            </div>
            <div className="acc-points-val">{rewardsPoints.toLocaleString("en-IN")}</div>
            <div className="acc-points-sub">≈ {fp(walletBalance)} credit</div>
            <div className="acc-points-bar"><div className="acc-points-fill" style={{ width: `${Math.min(100, (rewardsPoints / 5000) * 100)}%` }} /></div>
            <div className="acc-points-next"><span>{rewardsPoints.toLocaleString("en-IN")} pts</span><span>Gold: 5,000 pts</span></div>
          </div>

          <div className="acc-sidebar-nav">
            {([
              { key: "overview", icon: "fas fa-grid-2", label: "Dashboard" },
              { key: "orders", icon: "fas fa-bag-shopping", label: "My Orders", badge: String(orders.length) },
              { key: "addresses", icon: "fas fa-location-dot", label: "Saved Addresses", badge: String(addresses.length) },
              { key: "wishlist", icon: "fas fa-heart", label: "Wishlist", badge: String(wishlistCount), href: "/wishlist" },
              { key: "wallet", icon: "fas fa-wallet", label: "Wallet & Rewards", badge: fp(walletBalance), badgeGreen: true },
              { key: "profile", icon: "fas fa-user-pen", label: "Edit Profile" },
              { key: "settings", icon: "fas fa-gear", label: "Settings" },
            ] as { key: Panel; icon: string; label: string; badge?: string; badgeGreen?: boolean; href?: string }[]).map((item) => {
              const content = (
                <>
                  <i className={item.icon} /> {item.label}
                  {item.badge && <div className={`acc-nav-badge${item.badgeGreen ? " green" : ""}`}>{item.badge}</div>}
                </>
              );

              return item.href ? (
                <Link key={item.key} href={item.href} className={`acc-nav-item-side${panel === item.key ? " active" : ""}`}>
                  {content}
                </Link>
              ) : (
                <div key={item.key} className={`acc-nav-item-side${panel === item.key ? " active" : ""}`} onClick={() => switchPanel(item.key)}>
                  {content}
                </div>
              );
            })}
            <div className="acc-nav-item-side acc-logout" onClick={confirmLogout}>
              <i className="fas fa-right-from-bracket" /> Sign Out
            </div>
          </div>
        </aside>

        <div className="acc-main-content">
          {panel === "overview" && (
            <div className="acc-panel">
              <div className="acc-overview-stats">
                {[
                  { num: String(orders.length), label: "Total Orders", icon: "fas fa-bag-shopping", bg: "var(--brand-tint)", color: "var(--brand)", onClick: () => switchPanel("orders") },
                  { num: String(wishlistCount), label: "Wishlist Items", icon: "fas fa-heart", bg: "#fdf4ff", color: "#a855f7", href: "/wishlist" },
                  { num: fp(totalSpent), label: "Total Spent", icon: "fas fa-indian-rupee-sign", bg: "var(--success-tint)", color: "var(--success)", onClick: () => switchPanel("wallet") },
                  { num: String(cartItems.length), label: "Cart Items", icon: "fas fa-shopping-cart", bg: "var(--info-tint)", color: "var(--info)", href: "/cart" },
                ].map((stat, index) => {
                  const content = (
                    <>
                      <div className="acc-stat-icon" style={{ background: stat.bg }}><i className={stat.icon} style={{ color: stat.color }} /></div>
                      <div className="acc-stat-num">{stat.num}</div>
                      <div className="acc-stat-label">{stat.label}</div>
                    </>
                  );

                  return stat.href ? (
                    <Link key={index} href={stat.href} className="acc-stat-card" style={{ animationDelay: `${index * 0.05}s` }}>
                      {content}
                    </Link>
                  ) : (
                    <div key={index} className="acc-stat-card" style={{ animationDelay: `${index * 0.05}s` }} onClick={stat.onClick}>
                      {content}
                    </div>
                  );
                })}
              </div>

              <div className="acc-sec-card">
                <div className="acc-sec-head">
                  <h2><i className="fas fa-truck-fast" /> Active Orders</h2>
                  <button className="acc-edit-btn" onClick={() => switchPanel("orders")}><i className="fas fa-arrow-right" /> View All</button>
                </div>
                <div className="acc-sec-body">
                  {recentOrder ? (
                    <div className="acc-order-card">
                      <div className="acc-order-head">
                        <div className="acc-order-id"><i className="fas fa-hashtag" /> {recentOrder.id}</div>
                        <div className="acc-order-date"><i className="fas fa-calendar" /> {recentOrder.date}</div>
                        <div className={`acc-order-status ${STATUS_CLASS[recentOrder.status]}`}><i className={STATUS_ICON[recentOrder.status]} /> {recentOrder.statusLabel}</div>
                      </div>
                      <div className="acc-order-body">
                        <div className="acc-order-thumbs">
                          {recentOrder.items.map((item) => (
                            <div key={item.id} className="acc-thumb"><img src={getImageUrl(item.img, "/placeholder.svg")} alt={item.name} loading="lazy" /><div className="acc-qty-badge">x{item.qty}</div></div>
                          ))}
                        </div>
                        <div className="acc-order-desc">{recentOrder.items.map((item) => item.name).join(" · ")}</div>
                        <div className="acc-order-footer">
                          <div className="acc-order-total">Total: <strong>{fp(recentOrder.total)}</strong></div>
                          <div className="acc-order-actions">
                            {recentOrder.canTrack ? <button className="acc-action-btn acc-btn-track" onClick={() => setShowTrackId(recentOrder.id)}><i className="fas fa-map-pin" /> Track</button> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="acc-empty">
                      <i className="fas fa-box-open" />
                      <div>No real orders yet. Place an order and it will appear here.</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="acc-sec-card">
                <div className="acc-sec-head"><h2><i className="fas fa-clock-rotate-left" /> Recent Activity</h2></div>
                <div className="acc-sec-body acc-activity-list">
                  {[
                    wishlistCount > 0 ? { icon: "fas fa-heart", bg: "var(--brand-tint)", ic: "var(--brand)", title: `${wishlistCount} item${wishlistCount === 1 ? "" : "s"} in wishlist`, sub: "Live wishlist synced with the wishlist page", time: "Now" } : null,
                    totalQuantity > 0 ? { icon: "fas fa-cart-shopping", bg: "var(--info-tint)", ic: "var(--info)", title: `${totalQuantity} item${totalQuantity === 1 ? "" : "s"} in cart`, sub: "Cart is synced across the site", time: "Now" } : null,
                    addresses.length > 0 ? { icon: "fas fa-location-dot", bg: "var(--success-tint)", ic: "var(--success)", title: `${addresses.length} saved address${addresses.length === 1 ? "" : "es"}`, sub: "Default delivery address available for checkout", time: "Saved" } : null,
                  ].filter(Boolean).map((activity, index) => (
                    <div key={index} className="acc-activity-item">
                      <div className="acc-activity-icon" style={{ background: activity!.bg, color: activity!.ic }}><i className={activity!.icon} /></div>
                      <div className="acc-activity-body">
                        <div className="acc-activity-title">{activity!.title}</div>
                        <div className="acc-activity-sub">{activity!.sub}</div>
                      </div>
                      <div className="acc-activity-time">{activity!.time}</div>
                    </div>
                  ))}
                  {wishlistCount === 0 && totalQuantity === 0 && addresses.length === 0 ? (
                    <div className="acc-empty">
                      <i className="fas fa-bolt" />
                      <div>Your account activity will appear here as you use the site.</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {panel === "orders" && (
            <div className="acc-panel">
              <div className="acc-sec-card">
                <div className="acc-sec-head"><h2><i className="fas fa-bag-shopping" /> My Orders</h2><span className="acc-sec-meta">{orders.length} orders</span></div>
                <div className="acc-sec-body">
                  <div className="acc-order-filters">
                    {[
                      { key: "all", label: "All" },
                      { key: "active", label: "Active" },
                      { key: "delivered", label: "Delivered" },
                      { key: "cancelled", label: "Cancelled" },
                    ].map((filter) => (
                      <button key={filter.key} className={`acc-filter-btn${orderFilter === filter.key ? " active" : ""}`} onClick={() => setOrderFilter(filter.key)}>
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {filteredOrders.length > 0 ? filteredOrders.map((order) => (
                    <div key={order.id} className="acc-order-card">
                      <div className="acc-order-head">
                        <div className="acc-order-id"><i className="fas fa-hashtag" /> {order.id}</div>
                        <div className="acc-order-date"><i className="fas fa-calendar" /> {order.date}</div>
                        <div className={`acc-order-status ${STATUS_CLASS[order.status]}`}><i className={STATUS_ICON[order.status]} /> {order.statusLabel}</div>
                      </div>
                      <div className="acc-order-body">
                        <div className="acc-order-thumbs">
                          {order.items.map((item) => (
                            <div key={item.id} className="acc-thumb"><img src={getImageUrl(item.img, "/placeholder.svg")} alt={item.name} loading="lazy" /><div className="acc-qty-badge">x{item.qty}</div></div>
                          ))}
                        </div>
                        <div className="acc-order-desc">{order.items.map((item) => item.name).join(" · ")}</div>
                        <div className="acc-order-footer">
                          <div className="acc-order-total">Total: <strong>{fp(order.total)}</strong></div>
                          <div className="acc-order-actions">
                            {order.canTrack ? <button className="acc-action-btn acc-btn-track" onClick={() => setShowTrackId(order.id)}><i className="fas fa-map-pin" /> Track</button> : null}
                            <button className="acc-action-btn acc-btn-invoice" onClick={() => showToast('<i class="fas fa-file-invoice"></i> Invoice feature is ready for live backend integration', "info")}><i className="fas fa-file-invoice" /> Invoice</button>
                            {order.canReturn ? <button className="acc-action-btn acc-btn-return" onClick={() => showToast('<i class="fas fa-rotate-left"></i> Return request initiated', "info")}><i className="fas fa-rotate-left" /> Return</button> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="acc-empty">
                      <i className="fas fa-box-open" />
                      <div>No real orders available yet.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {panel === "addresses" && (
            <div className="acc-panel">
              <div className="acc-sec-card">
                <div className="acc-sec-head"><h2><i className="fas fa-location-dot" /> Saved Addresses</h2><span className="acc-sec-meta">{addresses.length} saved</span></div>
                <div className="acc-sec-body">
                  <div className="acc-address-manager">
                    <div>
                      <div className="acc-address-manager-title">{addressEditId ? "Edit Address" : "Add Address"}</div>
                      <div className="acc-address-manager-sub">Saved here and instantly available on checkout.</div>
                    </div>
                    {!showAddressForm ? (
                      <button className="acc-edit-btn" type="button" onClick={openNewAddressForm}>
                        <i className="fas fa-plus-circle" /> Add Address
                      </button>
                    ) : (
                      <div className="acc-address-form-actions">
                        <button className="acc-save-btn" type="button" onClick={handleSaveAddress} disabled={addressBusy}>
                          <i className={`fas ${addressBusy ? "fa-spinner fa-spin" : addressEditId ? "fa-floppy-disk" : "fa-plus-circle"}`} />
                          {addressBusy ? "Saving..." : addressEditId ? "Update Address" : "Save Address"}
                        </button>
                        <button className="acc-ghost-btn" type="button" onClick={resetAddressForm}>
                          <i className="fas fa-xmark" /> Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  {showAddressForm ? (
                    <div className="acc-address-form-card">
                      <div className="acc-form-grid-2">
                        <div className="acc-fg">
                          <label>Full Name</label>
                          <input className="acc-finput acc-finput-plain" type="text" value={addressForm.name} onChange={(event) => setAddressForm((current) => ({ ...current, name: event.target.value }))} />
                        </div>
                        <div className="acc-fg">
                          <label>Phone Number</label>
                          <input className="acc-finput acc-finput-plain" type="tel" value={addressForm.phone} onChange={(event) => setAddressForm((current) => ({ ...current, phone: event.target.value }))} />
                        </div>
                        <div className="acc-fg">
                          <label>Address Line 1</label>
                          <input className="acc-finput acc-finput-plain" type="text" value={addressForm.line1} onChange={(event) => setAddressForm((current) => ({ ...current, line1: event.target.value }))} />
                        </div>
                        <div className="acc-fg">
                          <label>Address Line 2</label>
                          <input className="acc-finput acc-finput-plain" type="text" value={addressForm.line2} onChange={(event) => setAddressForm((current) => ({ ...current, line2: event.target.value }))} />
                        </div>
                        <div className="acc-fg">
                          <label>City</label>
                          <input className="acc-finput acc-finput-plain" type="text" value={addressForm.city} onChange={(event) => setAddressForm((current) => ({ ...current, city: event.target.value }))} />
                        </div>
                        <div className="acc-fg">
                          <label>State</label>
                          <input className="acc-finput acc-finput-plain" type="text" value={addressForm.state} onChange={(event) => setAddressForm((current) => ({ ...current, state: event.target.value }))} />
                        </div>
                        <div className="acc-fg">
                          <label>Pin Code</label>
                          <input className="acc-finput acc-finput-plain" type="text" value={addressForm.pinCode} onChange={(event) => setAddressForm((current) => ({ ...current, pinCode: event.target.value }))} />
                        </div>
                        <div className="acc-fg">
                          <label>Address Type</label>
                          <select className="acc-fselect" value={addressForm.type} onChange={(event) => setAddressForm((current) => ({ ...current, type: event.target.value as AccountAddress["type"] }))}>
                            <option value="home">Home</option>
                            <option value="work">Work</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                      <label className="acc-check-row">
                        <input type="checkbox" checked={addressForm.isDefault} onChange={(event) => setAddressForm((current) => ({ ...current, isDefault: event.target.checked }))} />
                        Use this as my default address
                      </label>
                    </div>
                  ) : null}
                  <div className="acc-address-grid">
                    {addresses.map((address) => (
                      <div key={address.id} className={`acc-addr-card${address.isDefault ? " default" : ""}`}>
                        {address.isDefault ? <div className="acc-default-badge"><i className="fas fa-check-circle" /> Default</div> : null}
                        <div className={`acc-addr-tag ${address.type}`}>{address.type}</div>
                        <div className="acc-addr-name">{address.name}</div>
                        <div className="acc-addr-text">
                          {address.line1}
                          {address.line2 ? <><br />{address.line2}</> : null}
                          {address.city || address.state || address.pinCode ? <><br />{[address.city, address.state, address.pinCode].filter(Boolean).join(", ")}</> : null}
                        </div>
                        <div className="acc-addr-phone"><i className="fas fa-phone" />{address.phone}</div>
                        <div className="acc-addr-actions">
                          <button className="acc-addr-btn edit" onClick={() => openEditAddressForm(address)}><i className="fas fa-pen" /> Edit</button>
                          {!address.isDefault ? <button className="acc-addr-btn default-btn" onClick={async () => { await setDefaultAddress(address.id); showToast('<i class="fas fa-check"></i> Default address updated'); }}><i className="fas fa-check" /> Set Default</button> : null}
                          <button className="acc-addr-btn del" onClick={() => handleDeleteAddress(address.id)}><i className="fas fa-trash" /> Remove</button>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="acc-add-addr" onClick={openNewAddressForm}>
                      <i className="fas fa-plus-circle" />
                      <span>Add New Address</span>
                    </button>
                  </div>
                  {addresses.length === 0 ? (
                    <div className="acc-empty">
                      <i className="fas fa-location-dot" />
                      <div>No saved addresses yet. Add one here and it will appear in checkout automatically.</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {panel === "wallet" && (
            <div className="acc-panel">
              <div className="acc-sec-card">
                <div className="acc-sec-head"><h2><i className="fas fa-wallet" /> Wallet &amp; Rewards</h2></div>
                <div className="acc-sec-body">
                  <div className="acc-wallet-hero">
                    <div>
                      <div className="acc-wallet-bal-label">Available Balance</div>
                      <div className="acc-wallet-bal-val">{fp(walletBalance)}</div>
                      <div className="acc-wallet-bal-sub">{rewardsPoints.toLocaleString("en-IN")} AppleNext Points · Based on real orders</div>
                    </div>
                    <div className="acc-wallet-actions">
                      <button className="acc-wallet-btn add" onClick={() => showToast('<i class="fas fa-plus"></i> Wallet top-up needs payment gateway integration', "info")}><i className="fas fa-plus" /> Add Money</button>
                      <button className="acc-wallet-btn withdraw" onClick={() => showToast('<i class="fas fa-arrow-right-from-bracket"></i> Wallet withdrawal needs backend integration', "info")}><i className="fas fa-arrow-right-from-bracket" /> Withdraw</button>
                    </div>
                  </div>
                  <div className="acc-txn-title"><i className="fas fa-clock-rotate-left" /> Reward Activity</div>
                  <div className="acc-txn-list">
                    {orders.map((order) => (
                      <div key={order.id} className="acc-txn-item">
                        <div className="acc-txn-icon credit"><i className="fas fa-arrow-down" /></div>
                        <div className="acc-txn-body">
                          <div className="acc-txn-title-text">Reward points from {order.id}</div>
                          <div className="acc-txn-sub">{order.date} · {Math.floor(order.total / 1000)} pts earned</div>
                        </div>
                        <div className="acc-txn-amount credit">+{fp(Math.floor(order.total / 10000))}</div>
                      </div>
                    ))}
                    {orders.length === 0 ? (
                      <div className="acc-empty">
                        <i className="fas fa-star" />
                        <div>Reward activity will appear after your first order.</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {panel === "profile" && (
            <div className="acc-panel">
              <div className="acc-sec-card">
                <div className="acc-sec-head">
                  <h2><i className="fas fa-user-pen" /> Edit Profile</h2>
                  <div style={{ display: "flex", gap: 8 }}>
                    {!profileEdit ? <button className="acc-edit-btn" onClick={() => setProfileEdit(true)}><i className="fas fa-pen" /> Edit</button> : null}
                    {profileEdit ? <button className="acc-save-btn" onClick={handleSaveProfile}><i className="fas fa-check" /> Save Changes</button> : null}
                  </div>
                </div>
                <div className="acc-sec-body">
                  <div className="acc-form-grid-2">
                    {[
                      { key: "firstName", label: "First Name", icon: "fas fa-user", type: "text" },
                      { key: "lastName", label: "Last Name", icon: "fas fa-user", type: "text" },
                      { key: "phone", label: "Mobile Number", icon: "fas fa-phone", type: "tel" },
                      { key: "email", label: "Email Address", icon: "fas fa-envelope", type: "email" },
                      { key: "dob", label: "Date of Birth", icon: "fas fa-cake-candles", type: "date" },
                    ].map((field) => (
                      <div key={field.key} className="acc-fg">
                        <label>{field.label}</label>
                        <div className="acc-input-wrap">
                          <i className={`${field.icon} acc-prefix-icon`} />
                          <input
                            className="acc-finput"
                            type={field.type}
                            value={draftProfile[field.key as keyof typeof draftProfile] as string}
                            disabled={!profileEdit}
                            onChange={(event) => setDraftProfile((current) => ({ ...current, [field.key]: event.target.value }))}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="acc-fg">
                      <label>Gender</label>
                      <select className="acc-fselect" disabled={!profileEdit} value={draftProfile.gender} onChange={(event) => setDraftProfile((current) => ({ ...current, gender: event.target.value as "male" | "female" | "other" }))}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="acc-pwd-section">
                    <div className="acc-pwd-title"><i className="fas fa-lock" /> Account Details</div>
                    <div className="acc-form-grid-2">
                      <div className="acc-fg"><label>Current email</label><div className="acc-input-wrap"><i className="fas fa-envelope acc-prefix-icon" /><input className="acc-finput" type="text" value={profileEmail} disabled /></div></div>
                      <div className="acc-fg"><label>Current phone</label><div className="acc-input-wrap"><i className="fas fa-phone acc-prefix-icon" /><input className="acc-finput" type="text" value={profilePhone} disabled /></div></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {panel === "settings" && (
            <div className="acc-panel">
              <div className="acc-sec-card">
                <div className="acc-sec-head"><h2><i className="fas fa-gear" /> Account Settings</h2></div>
                <div className="acc-sec-body">
                  {settingsRows.map((group) => (
                    <div key={group.title} className="acc-settings-group">
                      <h3><i className={group.icon} /> {group.title}</h3>
                      {group.rows.map((row) => (
                        <div key={row.key} className="acc-setting-row">
                          <div className="acc-setting-left">
                            <div className="acc-setting-title">{row.title}</div>
                            <div className="acc-setting-sub">{row.subtitle}</div>
                          </div>
                          <label className="acc-toggle">
                            <input type="checkbox" checked={settings[row.key]} onChange={(event) => updateSetting(row.key, event.target.checked)} />
                            <span className="acc-slider" />
                          </label>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="acc-settings-group">
                    <h3><i className="fas fa-trash" /> Account Actions</h3>
                    <div className="acc-setting-row">
                      <div className="acc-setting-left"><div className="acc-setting-title">Download My Data</div><div className="acc-setting-sub">Download your stored profile, addresses, and order history</div></div>
                      <button className="acc-action-btn acc-btn-invoice" onClick={() => showToast('<i class="fas fa-download"></i> Data export is ready for backend integration', "info")}><i className="fas fa-download" /> Request</button>
                    </div>
                    <div className="acc-setting-row">
                      <div className="acc-setting-left"><div className="acc-setting-title" style={{ color: "var(--brand-light)" }}>Delete Account</div><div className="acc-setting-sub">Permanently remove your account and stored data</div></div>
                      <button className="acc-action-btn" style={{ border: "1.5px solid var(--brand-light)", color: "var(--brand-light)" }} onClick={() => showToast('<i class="fas fa-triangle-exclamation"></i> Contact support to delete your account', "warning")}><i className="fas fa-trash" /> Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {panel === "wishlist" && (
            <div className="acc-panel">
              <div className="acc-sec-card">
                <div className="acc-sec-head"><h2><i className="fas fa-heart" /> Wishlist</h2><span className="acc-sec-meta">{wishlistCount} live items</span></div>
                <div className="acc-sec-body">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ color: "var(--text-secondary)", fontSize: ".88rem" }}>
                      This view stays inside your account UI while using the same live wishlist data.
                    </div>
                    <Link href="/wishlist" className="acc-ghost-btn"><i className="fas fa-arrow-up-right-from-square" /> Open Standalone Wishlist</Link>
                  </div>
                  {wishlistItems.length > 0 ? (
                    <div className="acc-wishlist-grid" style={{ marginTop: 18 }}>
                      {wishlistItems.map((item) => (
                        <div key={item.id} className="acc-wish-card">
                          <div className="acc-wish-img">
                            <img src={getImageUrl(item.primaryImage, "/placeholder.svg")} alt={item.itemName} loading="lazy" />
                            <button className="acc-wish-remove" onClick={() => handleRemoveWishlistItem(item.id)}><i className="fas fa-xmark" /></button>
                            <div className="acc-wish-badge">{item.originalPrice > item.offerPrice ? `${Math.round(((item.originalPrice - item.offerPrice) / item.originalPrice) * 100)}% Off` : "Saved"}</div>
                          </div>
                          <div className="acc-wish-body">
                            <div className="acc-wish-brand">{item.brandName || "AppleNext"}</div>
                            <div className="acc-wish-name">{item.itemName}</div>
                            <div className="acc-wish-price">{fp(item.offerPrice)} {item.originalPrice > item.offerPrice ? <span className="acc-wish-orig">{fp(item.originalPrice)}</span> : null}</div>
                            <div className="acc-wish-saving">{item.categoryName || item.variant || "Saved in wishlist"}</div>
                            <button className="acc-wish-add-btn" onClick={() => handleMoveWishlistToCart(item.id)}><i className="fas fa-cart-plus" /> Add to Cart</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="acc-empty">
                      <i className="fas fa-heart-crack" />
                      <div>No wishlist items saved yet.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeOrder ? (
        <div className="acc-track-overlay" onClick={(event) => { if (event.target === event.currentTarget) setShowTrackId(null); }}>
          <div className="acc-track-modal">
            <div className="acc-track-head">
              <div>
                <h3>Track Order <span style={{ color: "var(--brand)" }}>{activeOrder.id}</span></h3>
                <p>Placed on {activeOrder.date} · {activeOrder.items.length} items</p>
              </div>
              <button className="acc-track-close" onClick={() => setShowTrackId(null)}><i className="fas fa-xmark" /></button>
            </div>
            <div className="acc-track-body">
              <div className={`acc-delivery-banner${activeOrder.status === "delivered" ? " delivered" : " in-transit"}`}>
                <div className={`acc-db-icon${activeOrder.status === "delivered" ? " green" : " blue"}`}><i className={activeOrder.status === "delivered" ? "fas fa-circle-check" : "fas fa-truck-fast"} /></div>
                <div className="acc-db-text">
                  <h4>{activeOrder.status === "delivered" ? "Delivered Successfully!" : activeOrder.statusLabel}</h4>
                  <p>{activeOrder.status === "delivered" ? `Delivered on ${activeOrder.date}` : "Your order is being processed through the live account store."}</p>
                </div>
                <div className="acc-db-date"><div className="acc-date-label">Order date</div><div className="acc-date-val">{activeOrder.date}</div></div>
              </div>
              <div className="acc-timeline">
                {[
                  { state: "done", title: "Order Placed", sub: "Order confirmed successfully", time: activeOrder.date },
                  { state: activeOrder.status === "processing" ? "active" : "done", title: "Processing", sub: "Preparing your order", time: activeOrder.date },
                  { state: activeOrder.status === "shipped" ? "active" : activeOrder.status === "delivered" ? "done" : "pending", title: "Shipped", sub: "Order is on the way", time: activeOrder.date },
                  { state: activeOrder.status === "delivered" ? "done" : "pending", title: "Delivered", sub: "Delivery confirmation", time: activeOrder.date },
                ].map((step, index) => (
                  <div key={index} className="acc-tl-item">
                    <div className={`acc-tl-dot ${step.state}`} />
                    <div className="acc-tl-content">
                      <div className={`acc-tl-title${step.state === "pending" ? " pending" : ""}`}>{step.title}</div>
                      <div className="acc-tl-sub">{step.sub}</div>
                      <div className="acc-tl-time"><i className="fas fa-clock" />{step.time}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="acc-track-items">
                <h4><i className="fas fa-box" /> Items in this order</h4>
                {activeOrder.items.map((item) => (
                  <div key={item.id} className="acc-track-item-row">
                    <div className="acc-track-item-img"><img src={getImageUrl(item.img, "/placeholder.svg")} alt={item.name} loading="lazy" /></div>
                    <div className="acc-track-item-info"><div className="acc-track-item-name">{item.name}</div><div className="acc-track-item-meta">Qty: {item.qty}</div></div>
                    <div className="acc-track-item-price">{fp(item.price * item.qty)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <footer className="acc-footer">
        <div className="acc-footer-inner">
          <div className="acc-fb-brand">
            <div className="acc-fb-logo">APPLENEXT</div>
            <p>Your one-stop destination for the latest electronics, mobile phones, laptops, and home appliances at the best prices with genuine warranty.</p>
          </div>
          {[
            { title: "Quick Links", links: [{ href: "/", label: "Home" }, { href: "/about", label: "About Us" }, { href: "/brands", label: "Brands" }, { href: "/blog", label: "Blog" }, { href: "/offers", label: "Offers" }] },
            { title: "Customer Service", links: [{ href: "/faq", label: "Help Center" }, { href: "/account", label: "Track Order" }, { href: "/faq", label: "Return Policy" }, { href: "/faq", label: "Warranty Info" }, { href: "/faq", label: "EMI Options" }] },
            { title: "My Account", links: [{ href: "/login", label: "Login / Register" }, { href: "/account", label: "My Orders" }, { href: "/cart", label: "My Cart" }, { href: "/wishlist", label: "Wishlist" }, { href: "/products", label: "Search Products" }] },
          ].map((column) => (
            <div key={column.title} className="acc-fc">
              <h4>{column.title}</h4>
              {column.links.map((link) => <Link key={link.href + link.label} href={link.href}>{link.label}</Link>)}
            </div>
          ))}
        </div>
        <div className="acc-footer-bottom">
          <p>&copy; 2026 AppleNext Electronics. All rights reserved.</p>
          <div className="acc-pay-tags"><span>Visa</span><span>Mastercard</span><span>UPI</span><span>Net Banking</span><span>EMI</span></div>
        </div>
      </footer>

      <div className="acc-toast-wrap">
        {toasts.map((toast) => <div key={toast.id} className={`acc-toast ${toast.type}`} dangerouslySetInnerHTML={{ __html: toast.html }} />)}
      </div>
    </div>
  );
}
