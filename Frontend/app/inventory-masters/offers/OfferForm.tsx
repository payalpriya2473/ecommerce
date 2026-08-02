"use client"

import { useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Tag, Package2, Landmark, Plus, Trash2, Calendar, Clock } from "lucide-react"
import { SearchableItemSelect, type ItemOption } from "@/components/masters/searchable-item-select"
import { SearchableMultiItemSelect } from "@/components/masters/searchable-multi-item-select"
import { SearchableBrandSelect, toBrandIconUrl, type BrandOption } from "@/components/masters/searchable-brand-select"
import type { OfferSection } from "@/lib/api"

// ─── Types ────────────────────────────────────────────────────────────────
// One bank offer entry (repeatable — like company "Add Bank")
export interface BankOfferEntry {
  bankName: string
  bankAbbr: string
  offerText: string
  offerSub: string
  description: string
  tags: string
  colorTheme: string
}

export const EMPTY_BANK_ENTRY: BankOfferEntry = {
  bankName: "",
  bankAbbr: "",
  offerText: "",
  offerSub: "",
  description: "",
  tags: "",
  colorTheme: "blue",
}

// One product line inside a combo deal
export interface ComboItemEntry {
  itemId: string
  itemName: string
  price: string
}

export const EMPTY_COMBO_ITEM: ComboItemEntry = { itemId: "", itemName: "", price: "" }

export interface OfferFormValues {
  itemId: string
  section: OfferSection
  badge: string
  couponCode: string
  discountType: "percent" | "amount"
  discountValue: string
  offerPrice: string
  soldPercent: string
  stockLeft: string
  priority: string
  startAt: string
  endAt: string
  isActive: boolean
  // ── Bank offers (repeatable) ──
  banks: BankOfferEntry[]
  // ── Combo deal ──
  comboTitle: string
  comboItems: ComboItemEntry[]
  // ── Coupon (section = 'coupon') ──
  couponTitle: string
  categoryLabel: string
  minOrder: string
  maxOff: string
  validTill: string
  // ── Brand deal (section = 'brand_deal') ──
  brandId: string
  brandDealName: string
  discountLabel: string
  // ── Exchange offer (section = 'exchange_offer') ──
  exchangeTitle: string
  exchangePartnerName: string
  ctaText: string
  // ── Shared card copy for coupon / brand / exchange ──
  description: string
  colorTheme: string
  // ── Eligible categories for exchange offers (comma separated) ──
  tags: string
  // ── Products this offer applies to (shown on those product pages) ──
  productIds: string[]
}

export const EMPTY_OFFER_FORM: OfferFormValues = {
  itemId: "",
  section: "flash_sale",
  badge: "",
  couponCode: "",
  discountType: "percent",
  discountValue: "",
  offerPrice: "",
  soldPercent: "",
  stockLeft: "",
  priority: "0",
  startAt: "",
  endAt: "",
  isActive: true,
  banks: [{ ...EMPTY_BANK_ENTRY }],
  comboTitle: "",
  comboItems: [{ ...EMPTY_COMBO_ITEM }, { ...EMPTY_COMBO_ITEM }],
  couponTitle: "",
  categoryLabel: "",
  minOrder: "",
  maxOff: "",
  validTill: "",
  brandId: "",
  brandDealName: "",
  discountLabel: "",
  exchangeTitle: "",
  exchangePartnerName: "",
  ctaText: "",
  description: "",
  colorTheme: "blue",
  tags: "",
  productIds: [],
}

// Soft pastel card backgrounds for Brand Deal cards on the website (distinct from the
// bold BANK_COLOR_THEMES gradients used for Bank Offer / Coupon cards).
export const BRAND_DEAL_PASTELS: { value: string; label: string; bg: string }[] = [
  { value: "blue",   label: "Blue",   bg: "#eff6ff" },
  { value: "green",  label: "Green",  bg: "#f0fdf4" },
  { value: "orange", label: "Orange", bg: "#fff7ed" },
  { value: "purple", label: "Purple", bg: "#fdf4ff" },
  { value: "red",    label: "Red",    bg: "#fef2f2" },
  { value: "teal",   label: "Teal",   bg: "#f0fdfa" },
  { value: "dark",   label: "Slate",  bg: "#f1f5f9" },
]

// A custom color picked via the "+" swatch is stored directly as a hex string
// (e.g. "#a1b2c3") in colorTheme, instead of one of the preset keys above.
export const isCustomColorTheme = (theme?: string | null): boolean =>
  !!theme && theme.startsWith("#")

export const brandDealPastelBg = (theme?: string | null): string =>
  isCustomColorTheme(theme) ? (theme as string) : (BRAND_DEAL_PASTELS.find((t) => t.value === theme)?.bg ?? BRAND_DEAL_PASTELS[0].bg)

// Which offers sub-module list page a given section belongs to — used so the
// Back/Cancel buttons on Add/Edit/View return to the page the user came from
// instead of the generic Offers root.
export function offersListRouteForSection(section?: string | null): string {
  switch (section) {
    case "bank_offer": return "/inventory-masters/offers/bank"
    case "brand_deal": return "/inventory-masters/offers/brand"
    case "coupon": return "/inventory-masters/offers/coupons"
    case "combo":
    case "clearance": return "/inventory-masters/offers/combo"
    case "exchange_offer": return "/inventory-masters/offers/exchange"
    case "flash_sale":
    case "home_best":
    default: return "/inventory-masters/offers/items"
  }
}

export const SECTION_OPTIONS: { value: OfferSection; label: string }[] = [
  { value: "flash_sale", label: "Flash Sale" },
  { value: "home_best",  label: "Today's Best Offer (Home)" },
  { value: "bank_offer", label: "Bank Offer" },
  { value: "brand_deal", label: "Brand Deal" },
  { value: "coupon",     label: "Coupon" },
  { value: "combo",      label: "Combo Deal" },
  { value: "clearance",  label: "Clearance" },
  { value: "exchange_offer", label: "Exchange Offer" },
]

// Shared color themes for bank offer cards (must match the website map)
export const BANK_COLOR_THEMES: { value: string; label: string; gradient: string }[] = [
  { value: "blue",   label: "Blue",   gradient: "linear-gradient(135deg,#0052cc,#003d99)" },
  { value: "green",  label: "Green",  gradient: "linear-gradient(135deg,#1a6b3a,#145230)" },
  { value: "orange", label: "Orange", gradient: "linear-gradient(135deg,#b45309,#92400e)" },
  { value: "purple", label: "Purple", gradient: "linear-gradient(135deg,#7c3aed,#5b21b6)" },
  { value: "red",    label: "Red",    gradient: "linear-gradient(135deg,#dc2626,#991b1b)" },
  { value: "teal",   label: "Teal",   gradient: "linear-gradient(135deg,#0369a1,#075985)" },
  { value: "dark",   label: "Dark",   gradient: "linear-gradient(135deg,#1e293b,#0f172a)" },
]

export const bankThemeGradient = (theme?: string | null): string =>
  BANK_COLOR_THEMES.find((t) => t.value === theme)?.gradient ?? BANK_COLOR_THEMES[0].gradient

// Item shape the form needs (a light view of Item Master)
export interface OfferItemLite extends ItemOption {
  offerPrice?: number
}

const bankEntryPayload = (b: BankOfferEntry) => ({
  bankName: b.bankName.trim() || null,
  bankAbbr: b.bankAbbr.trim() || null,
  offerText: b.offerText.trim() || null,
  offerSub: b.offerSub.trim() || null,
  description: b.description.trim() || null,
  tags: b.tags.trim() || null,
  colorTheme: b.colorTheme || "blue",
})

// Build the API payload from form values.
// mode "add" for a bank offer emits a banks[] array (creates one row each);
// mode "edit" emits a single flat bank row (the first entry).
export function buildOfferPayload(v: OfferFormValues, mode: "add" | "edit" = "add"): Record<string, unknown> {
  const num = (s: string) => (s === "" || s == null ? undefined : Number(s))
  const isBank = v.section === "bank_offer"

  const common = {
    section: v.section,
    priority: num(v.priority) ?? 0,
    startAt: v.startAt || null,
    endAt: v.endAt || null,
    isActive: v.isActive ? 1 : 0,
    productIds: v.productIds ?? [],
  }

  if (isBank) {
    const all = v.banks ?? []
    const entries = all.filter((b) => b.bankName.trim())
    if (mode === "edit") {
      return { ...common, itemId: null, badge: null, ...bankEntryPayload(entries[0] ?? all[0] ?? EMPTY_BANK_ENTRY) }
    }
    return { ...common, itemId: null, banks: entries.map(bankEntryPayload) }
  }

  if (v.section === "combo") {
    const items = (v.comboItems ?? [])
      .filter((c) => c.itemId)
      .map((c) => ({ itemId: c.itemId, itemName: c.itemName, price: num(c.price) ?? 0 }))
    return {
      ...common,
      itemId: null,
      comboTitle: v.comboTitle.trim() || null,
      comboItems: items,
      offerPrice: num(v.offerPrice) ?? null, // combo price
      badge: v.badge.trim() || null,
      // "Apply to Products" is derived from the bundle's own products instead
      // of asking the admin to re-pick them — this is what makes the combo
      // deal show up on each bundled product's own detail page.
      productIds: items.map((i) => i.itemId),
    }
  }

  if (v.section === "coupon") {
    return {
      ...common,
      itemId: null,
      couponCode: v.couponCode.trim() || null,
      couponTitle: v.couponTitle.trim() || null,
      categoryLabel: v.categoryLabel.trim() || null,
      description: v.description.trim() || null,
      minOrder: num(v.minOrder) ?? null,
      maxOff: num(v.maxOff) ?? null,
      validTill: v.validTill || null,
      colorTheme: v.colorTheme || "blue",
    }
  }

  if (v.section === "brand_deal") {
    return {
      ...common,
      itemId: null,
      brandId: v.brandId || null,
      brandDealName: v.brandDealName.trim() || null,
      discountLabel: v.discountLabel.trim() || null,
      description: v.description.trim() || null,
      colorTheme: v.colorTheme || "blue",
    }
  }

  if (v.section === "exchange_offer") {
    return {
      ...common,
      itemId: null,
      exchangeTitle: v.exchangeTitle.trim() || null,
      exchangePartnerName: v.exchangePartnerName.trim() || null,
      badge: v.badge.trim() || null,
      maxOff: num(v.maxOff) ?? null,
      minOrder: num(v.minOrder) ?? null,
      tags: v.tags.trim() || null,
      description: v.description.trim() || null,
      ctaText: v.ctaText.trim() || null,
      colorTheme: v.colorTheme || "blue",
    }
  }

  return {
    ...common,
    itemId: v.itemId,
    badge: v.badge.trim() || null,
    couponCode: v.section === "coupon" ? (v.couponCode.trim() || null) : null,
    discountType: v.discountType,
    discountPercent: v.discountType === "percent" ? num(v.discountValue) ?? 0 : null,
    discountAmount: v.discountType === "amount" ? num(v.discountValue) ?? 0 : null,
    offerPrice: num(v.offerPrice) ?? null,
    soldPercent: v.section === "flash_sale" ? num(v.soldPercent) ?? null : null,
    stockLeft: v.section === "flash_sale" ? num(v.stockLeft) ?? null : null,
    // "Apply to Products" is derived from the single product already picked
    // above instead of asking the admin to re-select it.
    productIds: v.itemId ? [v.itemId] : [],
  }
}

// Split a "yyyy-MM-ddTHH:mm" datetime-local value into separate date/time parts
// so the form can show them as two distinct, clearly-labeled inputs.
const splitDateTime = (v: string): { date: string; time: string } => {
  const [date = "", time = ""] = (v || "").split("T")
  return { date, time }
}
const joinDateTime = (date: string, time: string): string => {
  if (!date) return ""
  return `${date}T${time || "00:00"}`
}

// ─── Component ────────────────────────────────────────────────────────────
export function OfferFormFields({
  values,
  onChange,
  onSubmit,
  onCancel,
  error,
  isSubmitting,
  mode,
  items,
  brands,
}: {
  values: OfferFormValues
  onChange: (patch: Partial<OfferFormValues>) => void
  onSubmit: () => void
  onCancel: () => void
  error?: string
  isSubmitting: boolean
  mode: "add" | "edit" | "view"
  items: OfferItemLite[]
  brands: BrandOption[]
}) {
  const isView = mode === "view"
  const set = <K extends keyof OfferFormValues>(k: K, val: OfferFormValues[K]) =>
    onChange({ [k]: val } as Partial<OfferFormValues>)

  // ── bank list helpers (repeatable, like company "Add Bank") ──
  // Guard against stale/undefined state (e.g. after hot-reload) so the section never crashes.
  const bankList = values.banks ?? []
  const setBank = (i: number, patch: Partial<BankOfferEntry>) =>
    onChange({ banks: bankList.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) })
  const addBank = () => onChange({ banks: [...bankList, { ...EMPTY_BANK_ENTRY }] })
  const removeBank = (i: number) =>
    onChange({ banks: bankList.length > 1 ? bankList.filter((_, idx) => idx !== i) : bankList })

  // Ensure at least one bank entry exists whenever Bank Offer is selected.
  const isBankSection = values.section === "bank_offer"
  useEffect(() => {
    if (isBankSection && (!values.banks || values.banks.length === 0)) {
      onChange({ banks: [{ ...EMPTY_BANK_ENTRY }] })
    }
  }, [isBankSection]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── combo item helpers (repeatable products in a bundle) ──
  const comboList = values.comboItems ?? []
  const setComboItem = (i: number, patch: Partial<ComboItemEntry>) =>
    onChange({ comboItems: comboList.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) })
  const addComboItem = () => onChange({ comboItems: [...comboList, { ...EMPTY_COMBO_ITEM }] })
  const removeComboItem = (i: number) =>
    onChange({ comboItems: comboList.length > 2 ? comboList.filter((_, idx) => idx !== i) : comboList })

  const isComboSection = values.section === "combo"
  useEffect(() => {
    if (isComboSection && (!values.comboItems || values.comboItems.length < 2)) {
      onChange({ comboItems: [{ ...EMPTY_COMBO_ITEM }, { ...EMPTY_COMBO_ITEM }] })
    }
  }, [isComboSection]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedItem = useMemo(
    () => items.find((i) => String(i.id) === String(values.itemId)) || null,
    [items, values.itemId],
  )

  // ── live price preview ──
  const mrp = Number(selectedItem?.offerPrice ?? 0)
  const finalPrice = useMemo(() => {
    if (values.offerPrice !== "") return Number(values.offerPrice)
    const val = Number(values.discountValue || 0)
    if (!mrp) return 0
    return values.discountType === "percent"
      ? Math.max(0, Math.round(mrp - (mrp * val) / 100))
      : Math.max(0, Math.round(mrp - val))
  }, [values.offerPrice, values.discountValue, values.discountType, mrp])

  const computedPct = mrp > 0 ? Math.round(((mrp - finalPrice) / mrp) * 100) : 0
  const isFlash = values.section === "flash_sale"
  const isBank = values.section === "bank_offer"
  const isCombo = values.section === "combo"
  const isCoupon = values.section === "coupon"
  const isBrand = values.section === "brand_deal"
  const isExchange = values.section === "exchange_offer"
  const isProductBased = !isBank && !isCombo && !isCoupon && !isBrand && !isExchange

  // combo totals for preview
  const comboTotal = comboList.reduce((s, c) => s + (Number(c.price) || 0), 0)
  const comboPrice = Number(values.offerPrice) || 0
  const comboSaving = Math.max(0, comboTotal - comboPrice)

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Product + Offer type ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package2 className="h-4 w-4 text-accent" /> Product & Offer Type
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {isProductBased && (
            <div className="space-y-2 md:col-span-2">
              <Label>Product (from Item Master) <span className="text-destructive">*</span></Label>
              <SearchableItemSelect
                value={values.itemId}
                items={items}
                disabled={isView}
                onValueChange={(id) => set("itemId", id)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Offer Section <span className="text-destructive">*</span></Label>
            <Select value={values.section} onValueChange={(v) => set("section", v as OfferSection)} disabled={isView}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SECTION_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isCoupon && !isBrand && (
            <div className="space-y-2">
              <Label>Badge text</Label>
              <Input value={values.badge} onChange={(e) => set("badge", e.target.value)} disabled={isView} />
            </div>
          )}
        </div>
      </div>

      {/* ── Bank offer details (repeatable) ── */}
      {isBank && (
        <div className="space-y-4 border-t pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Landmark className="h-4 w-4 text-accent" /> Bank Offers
              {mode === "add" && <span className="text-xs font-normal text-muted-foreground">({bankList.length})</span>}
            </h3>
            {mode === "add" && (
              <Button type="button" size="sm" variant="outline" onClick={addBank} className="gap-1">
                <Plus className="h-4 w-4" /> Add Bank
              </Button>
            )}
          </div>

          {bankList.map((bank, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Bank Offer {i + 1}</span>
                {mode === "add" && bankList.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeBank(i)}
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Bank / Card Name <span className="text-destructive">*</span></Label>
                  <Input value={bank.bankName} onChange={(e) => setBank(i, { bankName: e.target.value })} disabled={isView} />
                </div>
                <div className="space-y-2">
                  <Label>Short Code</Label>
                  <Input value={bank.bankAbbr} onChange={(e) => setBank(i, { bankAbbr: e.target.value })} disabled={isView} />
                </div>
                <div className="space-y-2">
                  <Label>Offer Headline</Label>
                  <Input value={bank.offerText} onChange={(e) => setBank(i, { offerText: e.target.value })} disabled={isView} />
                </div>
                <div className="space-y-2">
                  <Label>Offer Subtitle</Label>
                  <Input value={bank.offerSub} onChange={(e) => setBank(i, { offerSub: e.target.value })} disabled={isView} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <textarea
                    value={bank.description}
                    onChange={(e) => setBank(i, { description: e.target.value })}
                    rows={2}
                    disabled={isView}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Card Tags <span className="text-muted-foreground text-xs font-normal">(comma separated)</span></Label>
                  <Input value={bank.tags} onChange={(e) => setBank(i, { tags: e.target.value })} disabled={isView} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Card Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {BANK_COLOR_THEMES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        disabled={isView}
                        onClick={() => setBank(i, { colorTheme: t.value })}
                        title={t.label}
                        className={`h-9 w-9 rounded-lg border-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${bank.colorTheme === t.value ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-transparent"}`}
                        style={{ background: t.gradient }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Bank card preview */}
              <div className="rounded-xl p-5 text-white shadow-md max-w-md" style={{ background: bankThemeGradient(bank.colorTheme) }}>
                <div className="flex items-start justify-between">
                  <div className="text-lg font-bold">{bank.bankName || "Bank Name"}</div>
                  {bank.bankAbbr && <div className="rounded-md bg-white/20 px-2 py-1 text-xs font-bold">{bank.bankAbbr}</div>}
                </div>
                <div className="mt-3 text-2xl font-extrabold">
                  {bank.offerText || "10%"} <span className="text-sm font-medium opacity-90">{bank.offerSub || "Instant Discount"}</span>
                </div>
                {bank.description && <p className="mt-2 text-sm opacity-90 line-clamp-3">{bank.description}</p>}
                {bank.tags && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {bank.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">{t}</span>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-sm font-semibold">View Offer Details →</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Combo builder ── */}
      {isCombo && (
        <div className="space-y-4 border-t pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Package2 className="h-4 w-4 text-accent" /> Combo Products
            </h3>
            {!isView && (
              <Button type="button" size="sm" variant="outline" onClick={addComboItem} className="gap-1">
                <Plus className="h-4 w-4" /> Add Product
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Combo Title <span className="text-destructive">*</span></Label>
            <Input value={values.comboTitle} onChange={(e) => set("comboTitle", e.target.value)} disabled={isView} />
          </div>

          {comboList.map((ci, i) => (
            <div key={i} className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end rounded-lg border border-border p-3">
              <div className="space-y-2">
                <Label>Product {i + 1} <span className="text-destructive">*</span></Label>
                <SearchableItemSelect
                  value={ci.itemId}
                  items={items}
                  disabled={isView}
                  onValueChange={(id) => {
                    const it = items.find((x) => String(x.id) === String(id))
                    setComboItem(i, { itemId: id, itemName: it?.itemName ?? "", price: it?.offerPrice != null ? String(it.offerPrice) : ci.price })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Price (₹)</Label>
                <Input type="number" min="0" value={ci.price} onChange={(e) => setComboItem(i, { price: e.target.value })} disabled={isView} />
              </div>
              {!isView && (
                <Button type="button" size="icon" variant="ghost" onClick={() => removeComboItem(i)}
                  disabled={comboList.length <= 2}
                  className="h-10 w-10 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Combo Price (₹) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" value={values.offerPrice} onChange={(e) => set("offerPrice", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Badge</Label>
              <Input value={values.badge} onChange={(e) => set("badge", e.target.value)} disabled={isView} />
            </div>
          </div>

          {/* Combo preview */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Preview — {values.comboTitle || "Combo"}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground line-through">Rs {comboTotal.toLocaleString("en-IN")}</span>
              <span className="text-lg font-bold text-red-600">Rs {comboPrice.toLocaleString("en-IN")}</span>
              {comboSaving > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Save Rs {comboSaving.toLocaleString("en-IN")}</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Coupon fields ── */}
      {isCoupon && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-accent" /> Coupon Details
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Coupon Code <span className="text-destructive">*</span></Label>
              <Input value={values.couponCode} onChange={(e) => set("couponCode", e.target.value.toUpperCase())} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={values.couponTitle} onChange={(e) => set("couponTitle", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Category Label</Label>
              <Input value={values.categoryLabel} onChange={(e) => set("categoryLabel", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Valid Till</Label>
              <Input type="date" value={values.validTill} onChange={(e) => set("validTill", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Input value={values.description} onChange={(e) => set("description", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Min Order (₹)</Label>
              <Input type="number" min="0" value={values.minOrder} onChange={(e) => set("minOrder", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Max Off (₹)</Label>
              <Input type="number" min="0" value={values.maxOff} onChange={(e) => set("maxOff", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Card Color</Label>
              <div className="flex flex-wrap gap-2">
                {BANK_COLOR_THEMES.map((t) => (
                  <button key={t.value} type="button" disabled={isView} onClick={() => set("colorTheme", t.value)} title={t.label}
                    className={`h-9 w-9 rounded-lg border-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${values.colorTheme === t.value ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-transparent"}`}
                    style={{ background: t.gradient }} />
                ))}
              </div>
            </div>
          </div>
          {/* Coupon preview */}
          <div className="flex overflow-hidden rounded-lg border border-border max-w-md">
            <div className="flex flex-col justify-center p-4 text-white text-center min-w-[120px]" style={{ background: bankThemeGradient(values.colorTheme) }}>
              <div className="text-[11px] uppercase opacity-90">{values.categoryLabel || "All Products"}</div>
              <div className="text-sm font-bold mt-1">{values.couponTitle || "Flat Rs 1,000 Off"}</div>
            </div>
            <div className="flex-1 p-4">
              <p className="text-sm text-muted-foreground">{values.description || "On all orders above…"}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded border border-dashed border-border px-3 py-1 text-sm font-mono font-semibold">{values.couponCode || "CODE"}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Brand deal fields ── */}
      {isBrand && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-accent" /> Brand Deal Details
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Brand <span className="text-destructive">*</span></Label>
              <SearchableBrandSelect
                value={values.brandId}
                brands={brands}
                disabled={isView}
                onValueChange={(id, brand) => onChange({
                  brandId: id,
                  brandDealName: brand?.name ?? "",
                })}
              />
            </div>
            <div className="space-y-2">
              <Label>Discount Label</Label>
              <Input value={values.discountLabel} onChange={(e) => set("discountLabel", e.target.value)} placeholder="e.g. Up to 20% off" disabled={isView} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Input value={values.description} onChange={(e) => set("description", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Card Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {BRAND_DEAL_PASTELS.map((t) => (
                  <button key={t.value} type="button" disabled={isView} onClick={() => set("colorTheme", t.value)} title={t.label}
                    className={`h-9 w-9 rounded-lg border-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${values.colorTheme === t.value ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-border"}`}
                    style={{ background: t.bg }} />
                ))}
                {/* Custom color — click to open the native color picker */}
                <div className="relative h-9 w-9">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 transition ${isView ? "opacity-50" : ""} ${isCustomColorTheme(values.colorTheme) ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-dashed border-border"}`}
                    style={isCustomColorTheme(values.colorTheme) ? { background: values.colorTheme } : undefined}
                    title="Custom color"
                  >
                    {!isCustomColorTheme(values.colorTheme) && <Plus className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <input
                    type="color"
                    disabled={isView}
                    value={isCustomColorTheme(values.colorTheme) ? values.colorTheme : "#ffffff"}
                    onChange={(e) => set("colorTheme", e.target.value)}
                    className="absolute inset-0 h-9 w-9 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                    title="Pick a custom card color"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Brand deal preview — mirrors the website card exactly */}
          <div
            className="max-w-xs rounded-2xl border border-border p-6 text-center shadow-sm"
            style={{ background: brandDealPastelBg(values.colorTheme) }}
          >
            {(() => {
              const selectedBrand = brands.find((b) => String(b.id) === String(values.brandId))
              return selectedBrand?.iconUrl ? (
                <img src={toBrandIconUrl(selectedBrand.iconUrl)} alt={selectedBrand.name} className="mx-auto mb-2 h-12 w-12 object-contain" />
              ) : (
                <div className="mb-2 text-4xl">{(values.brandDealName || "🏷️").slice(0, 1)}</div>
              )
            })()}
            <div className="mb-1 text-lg font-extrabold text-foreground">{values.brandDealName || "Brand Name"}</div>
            <div className="mb-1 text-sm font-bold text-red-600">{values.discountLabel || "Up to 00% off"}</div>
            <div className="mb-2 text-xs text-muted-foreground">{values.description || "Category, product line & accessories"}</div>
            {values.productIds?.length ? (
              <div className="mb-3 text-xs font-semibold text-muted-foreground/70">📦 {values.productIds.length} products</div>
            ) : null}
            <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-accent to-accent-secondary px-4 py-1.5 text-xs font-bold text-white">
              Shop Now →
            </div>
          </div>
        </div>
      )}

      {/* ── Exchange offer fields ── */}
      {isExchange && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-accent" /> Exchange Offer Details
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Exchange Title <span className="text-destructive">*</span></Label>
              <Input value={values.exchangeTitle} onChange={(e) => set("exchangeTitle", e.target.value)} placeholder="e.g. Get Up to Rs 25,000 on Exchange" disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Partner Name</Label>
              <Input value={values.exchangePartnerName} onChange={(e) => set("exchangePartnerName", e.target.value)} placeholder="e.g. Cashify" disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Bonus Amount (₹)</Label>
              <Input type="number" min="0" value={values.maxOff} onChange={(e) => set("maxOff", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Min Device/Order Value (₹)</Label>
              <Input type="number" min="0" value={values.minOrder} onChange={(e) => set("minOrder", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Eligible Categories <span className="text-muted-foreground text-xs font-normal">(comma separated)</span></Label>
              <Input value={values.tags} onChange={(e) => set("tags", e.target.value)} placeholder="e.g. Mobiles, Laptops" disabled={isView} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description / Terms</Label>
              <Input value={values.description} onChange={(e) => set("description", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>CTA Button Text</Label>
              <Input value={values.ctaText} onChange={(e) => set("ctaText", e.target.value)} placeholder="e.g. Check Value" disabled={isView} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Card Color</Label>
              <div className="flex flex-wrap gap-2">
                {BANK_COLOR_THEMES.map((t) => (
                  <button key={t.value} type="button" disabled={isView} onClick={() => set("colorTheme", t.value)} title={t.label}
                    className={`h-9 w-9 rounded-lg border-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${values.colorTheme === t.value ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-transparent"}`}
                    style={{ background: t.gradient }} />
                ))}
              </div>
            </div>
          </div>

          {/* Exchange card preview — mirrors the website promo card */}
          <div className="rounded-xl p-5 text-white shadow-md max-w-md" style={{ background: bankThemeGradient(values.colorTheme) }}>
            <div className="text-xs font-bold uppercase opacity-80">{values.badge || "EXCHANGE OFFER"}</div>
            <div className="mt-2 text-lg font-extrabold">{values.exchangeTitle || "Get Up to Rs 25,000 on Exchange"}</div>
            {values.description && <p className="mt-2 text-sm opacity-90 line-clamp-2">{values.description}</p>}
            <div className="mt-3 text-sm font-semibold">{values.ctaText || "Check Value"} →</div>
          </div>
        </div>
      )}

      {/* ── Pricing ── */}
      {isProductBased && (
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Tag className="h-4 w-4 text-accent" /> Pricing & Discount
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Discount Type</Label>
            <Select value={values.discountType} onValueChange={(v) => set("discountType", v as "percent" | "amount")} disabled={isView}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent (%)</SelectItem>
                <SelectItem value="amount">Flat Amount (₹)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Discount {values.discountType === "percent" ? "(%)" : "(₹)"}</Label>
            <Input type="number" min="0" value={values.discountValue}
              onChange={(e) => set("discountValue", e.target.value)} disabled={isView} />
          </div>
          <div className="space-y-2">
            <Label>Offer Price (₹) <span className="text-muted-foreground text-xs font-normal">(optional override)</span></Label>
            <Input type="number" min="0" value={values.offerPrice}
              onChange={(e) => set("offerPrice", e.target.value)} disabled={isView} />
          </div>
        </div>

        {/* Live price preview */}
        {selectedItem && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold text-foreground">{selectedItem.itemName}{selectedItem.variant ? ` · ${selectedItem.variant}` : ""}</span>
              <span className="text-lg font-bold text-red-600">Rs {finalPrice.toLocaleString("en-IN")}</span>
              {mrp > finalPrice && <span className="text-sm text-muted-foreground line-through">Rs {mrp.toLocaleString("en-IN")}</span>}
              {computedPct > 0 && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{computedPct}% off</span>}
              {values.badge && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">{values.badge}</span>}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Flash-sale extras ── */}
      {isFlash && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold text-foreground">Flash Sale Stock Bar</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Sold (%)</Label>
              <Input type="number" min="0" max="100" value={values.soldPercent} onChange={(e) => set("soldPercent", e.target.value)} disabled={isView} />
            </div>
            <div className="space-y-2">
              <Label>Stock Left</Label>
              <Input type="number" min="0" value={values.stockLeft} onChange={(e) => set("stockLeft", e.target.value)} disabled={isView} />
            </div>
          </div>
        </div>
      )}

      {/* ── Apply to products ──
           Only shown for offer types that have no product picker elsewhere in
           the form (Bank Offer, Coupon, Brand Deal). Flash Sale / Today's Best
           Offer / Clearance already pick their product above, and Combo Deal
           already picks its bundled products below — for those, the
           product↔offer link is derived automatically instead of asking again. */}
      {!isProductBased && !isCombo && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Package2 className="h-4 w-4 text-accent" /> Apply to Products
            {values.productIds?.length ? <span className="text-xs font-normal text-muted-foreground">({values.productIds.length} selected)</span> : null}
          </h3>
          <SearchableMultiItemSelect
            values={values.productIds ?? []}
            items={items}
            disabled={isView}
            onChange={(ids) => set("productIds", ids)}
          />
        </div>
      )}

      {/* ── Display & schedule ── */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-semibold text-foreground">Display & Schedule</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Priority <span className="text-muted-foreground text-xs font-normal">(lower = shown first)</span></Label>
            <Input type="number" value={values.priority} onChange={(e) => set("priority", e.target.value)} disabled={isView} />
          </div>
          <div className="space-y-2">
            <Label>Start date &amp; time</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-9"
                  disabled={isView}
                  value={splitDateTime(values.startAt).date}
                  onChange={(e) => set("startAt", joinDateTime(e.target.value, splitDateTime(values.startAt).time))}
                />
              </div>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="time"
                  className="pl-9"
                  disabled={isView}
                  value={splitDateTime(values.startAt).time}
                  onChange={(e) => set("startAt", joinDateTime(splitDateTime(values.startAt).date, e.target.value))}
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>End date &amp; time</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className="pl-9"
                  disabled={isView}
                  value={splitDateTime(values.endAt).date}
                  onChange={(e) => set("endAt", joinDateTime(e.target.value, splitDateTime(values.endAt).time))}
                />
              </div>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="time"
                  className="pl-9"
                  disabled={isView}
                  value={splitDateTime(values.endAt).time}
                  onChange={(e) => set("endAt", joinDateTime(splitDateTime(values.endAt).date, e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status ── */}
      <div className="space-y-2 border-t pt-6">
        <Label htmlFor="offer-status">Status</Label>
        <div className="flex items-center gap-3">
          <Switch
            id="offer-status"
            checked={values.isActive}
            onCheckedChange={(c) => set("isActive", c)}
            disabled={isView}
            className="h-6 w-11 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-200 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:shadow"
          />
          <span className={`text-sm font-semibold ${values.isActive ? "text-emerald-600" : "text-muted-foreground"}`}>
            {values.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 border-t pt-6">
        {!isView && (
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
          >
            {isSubmitting ? "Saving..." : mode === "add" ? "Add Offer" : "Save Changes"}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {isView ? "Back" : "Cancel"}
        </Button>
      </div>
    </div>
  )
}
