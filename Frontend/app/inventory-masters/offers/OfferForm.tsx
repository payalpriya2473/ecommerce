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
import { AlertCircle, Tag, Package2, Landmark, Plus, Trash2 } from "lucide-react"
import { SearchableItemSelect, type ItemOption } from "@/components/masters/searchable-item-select"
import { SearchableMultiItemSelect } from "@/components/masters/searchable-multi-item-select"
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
  brandDealName: string
  discountLabel: string
  // ── Shared card copy for coupon / brand ──
  description: string
  colorTheme: string
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
  brandDealName: "",
  discountLabel: "",
  description: "",
  colorTheme: "blue",
  productIds: [],
}

export const SECTION_OPTIONS: { value: OfferSection; label: string }[] = [
  { value: "flash_sale", label: "Flash Sale" },
  { value: "home_best",  label: "Today's Best Offer (Home)" },
  { value: "bank_offer", label: "Bank Offer" },
  { value: "brand_deal", label: "Brand Deal" },
  { value: "coupon",     label: "Coupon" },
  { value: "combo",      label: "Combo Deal" },
  { value: "clearance",  label: "Clearance" },
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
      brandDealName: v.brandDealName.trim() || null,
      discountLabel: v.discountLabel.trim() || null,
      description: v.description.trim() || null,
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
  }
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
}: {
  values: OfferFormValues
  onChange: (patch: Partial<OfferFormValues>) => void
  onSubmit: () => void
  onCancel: () => void
  error?: string
  isSubmitting: boolean
  mode: "add" | "edit"
  items: OfferItemLite[]
}) {
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
  const isProductBased = !isBank && !isCombo && !isCoupon && !isBrand

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
                onValueChange={(id) => set("itemId", id)}
              />
              <p className="text-xs text-muted-foreground">
                Only products that exist in Item Master can be added. Name, brand, image, MRP, HSN &amp; GST come from the item.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label>Offer Section <span className="text-destructive">*</span></Label>
            <Select value={values.section} onValueChange={(v) => set("section", v as OfferSection)}>
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
              <Input value={values.badge} onChange={(e) => set("badge", e.target.value)} placeholder="e.g. New Arrival, Best Seller" />
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
                  <Input value={bank.bankName} onChange={(e) => setBank(i, { bankName: e.target.value })} placeholder="e.g. HDFC Bank" />
                </div>
                <div className="space-y-2">
                  <Label>Short Code</Label>
                  <Input value={bank.bankAbbr} onChange={(e) => setBank(i, { bankAbbr: e.target.value })} placeholder="e.g. HDFC" />
                </div>
                <div className="space-y-2">
                  <Label>Offer Headline</Label>
                  <Input value={bank.offerText} onChange={(e) => setBank(i, { offerText: e.target.value })} placeholder="e.g. 10% or Rs 200" />
                </div>
                <div className="space-y-2">
                  <Label>Offer Subtitle</Label>
                  <Input value={bank.offerSub} onChange={(e) => setBank(i, { offerSub: e.target.value })} placeholder="e.g. Instant Discount" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <textarea
                    value={bank.description}
                    onChange={(e) => setBank(i, { description: e.target.value })}
                    placeholder="e.g. Up to Rs 10,000 off on HDFC Credit/Debit Cards & EMI on orders above Rs 15,000"
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Card Tags <span className="text-muted-foreground text-xs font-normal">(comma separated)</span></Label>
                  <Input value={bank.tags} onChange={(e) => setBank(i, { tags: e.target.value })} placeholder="e.g. Credit Card, Debit Card, EMI, No Cost EMI" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Card Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {BANK_COLOR_THEMES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setBank(i, { colorTheme: t.value })}
                        title={t.label}
                        className={`h-9 w-9 rounded-lg border-2 transition ${bank.colorTheme === t.value ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-transparent"}`}
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
            <Button type="button" size="sm" variant="outline" onClick={addComboItem} className="gap-1">
              <Plus className="h-4 w-4" /> Add Product
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Combo Title <span className="text-destructive">*</span></Label>
            <Input value={values.comboTitle} onChange={(e) => set("comboTitle", e.target.value)} placeholder="e.g. Work From Home Bundle" />
          </div>

          {comboList.map((ci, i) => (
            <div key={i} className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end rounded-lg border border-border p-3">
              <div className="space-y-2">
                <Label>Product {i + 1} <span className="text-destructive">*</span></Label>
                <SearchableItemSelect
                  value={ci.itemId}
                  items={items}
                  onValueChange={(id) => {
                    const it = items.find((x) => String(x.id) === String(id))
                    setComboItem(i, { itemId: id, itemName: it?.itemName ?? "", price: it?.offerPrice != null ? String(it.offerPrice) : ci.price })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Price (₹)</Label>
                <Input type="number" min="0" value={ci.price} onChange={(e) => setComboItem(i, { price: e.target.value })} placeholder="0" />
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => removeComboItem(i)}
                disabled={comboList.length <= 2}
                className="h-10 w-10 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40" title="Remove">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Combo Price (₹) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" value={values.offerPrice} onChange={(e) => set("offerPrice", e.target.value)} placeholder="Total bundle price" />
            </div>
            <div className="space-y-2">
              <Label>Badge</Label>
              <Input value={values.badge} onChange={(e) => set("badge", e.target.value)} placeholder="e.g. Best Value" />
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
              <Input value={values.couponCode} onChange={(e) => set("couponCode", e.target.value.toUpperCase())} placeholder="e.g. MOTAB10" />
            </div>
            <div className="space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={values.couponTitle} onChange={(e) => set("couponTitle", e.target.value)} placeholder="e.g. Flat Rs 1,000 Off" />
            </div>
            <div className="space-y-2">
              <Label>Category Label</Label>
              <Input value={values.categoryLabel} onChange={(e) => set("categoryLabel", e.target.value)} placeholder="e.g. All Products, Mobiles, TVs" />
            </div>
            <div className="space-y-2">
              <Label>Valid Till</Label>
              <Input type="date" value={values.validTill} onChange={(e) => set("validTill", e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Input value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. On all orders above Rs 15,000" />
            </div>
            <div className="space-y-2">
              <Label>Min Order (₹)</Label>
              <Input type="number" min="0" value={values.minOrder} onChange={(e) => set("minOrder", e.target.value)} placeholder="e.g. 15000" />
            </div>
            <div className="space-y-2">
              <Label>Max Off (₹)</Label>
              <Input type="number" min="0" value={values.maxOff} onChange={(e) => set("maxOff", e.target.value)} placeholder="e.g. 1000" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Card Color</Label>
              <div className="flex flex-wrap gap-2">
                {BANK_COLOR_THEMES.map((t) => (
                  <button key={t.value} type="button" onClick={() => set("colorTheme", t.value)} title={t.label}
                    className={`h-9 w-9 rounded-lg border-2 transition ${values.colorTheme === t.value ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-transparent"}`}
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
              <Label>Brand Name <span className="text-destructive">*</span></Label>
              <Input value={values.brandDealName} onChange={(e) => set("brandDealName", e.target.value)} placeholder="e.g. Apple" />
            </div>
            <div className="space-y-2">
              <Label>Discount Label</Label>
              <Input value={values.discountLabel} onChange={(e) => set("discountLabel", e.target.value)} placeholder="e.g. Up to 20% off" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Input value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. iPhones, MacBooks, iPads & Accessories" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Card Color</Label>
              <div className="flex flex-wrap gap-2">
                {BANK_COLOR_THEMES.map((t) => (
                  <button key={t.value} type="button" onClick={() => set("colorTheme", t.value)} title={t.label}
                    className={`h-9 w-9 rounded-lg border-2 transition ${values.colorTheme === t.value ? "border-foreground ring-2 ring-offset-1 ring-foreground/30" : "border-transparent"}`}
                    style={{ background: t.gradient }} />
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Use “Apply to Products” below to link the products included in this brand deal — the card shows the count.</p>
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
            <Select value={values.discountType} onValueChange={(v) => set("discountType", v as "percent" | "amount")}>
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
              onChange={(e) => set("discountValue", e.target.value)}
              placeholder={values.discountType === "percent" ? "e.g. 10" : "e.g. 1000"} />
          </div>
          <div className="space-y-2">
            <Label>Offer Price (₹) <span className="text-muted-foreground text-xs font-normal">(optional override)</span></Label>
            <Input type="number" min="0" value={values.offerPrice}
              onChange={(e) => set("offerPrice", e.target.value)}
              placeholder="Auto-calculated if blank" />
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
              <Input type="number" min="0" max="100" value={values.soldPercent} onChange={(e) => set("soldPercent", e.target.value)} placeholder="e.g. 78" />
            </div>
            <div className="space-y-2">
              <Label>Stock Left</Label>
              <Input type="number" min="0" value={values.stockLeft} onChange={(e) => set("stockLeft", e.target.value)} placeholder="e.g. 22" />
            </div>
          </div>
        </div>
      )}

      {/* ── Apply to products ── */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package2 className="h-4 w-4 text-accent" /> Apply to Products
          {values.productIds?.length ? <span className="text-xs font-normal text-muted-foreground">({values.productIds.length} selected)</span> : null}
        </h3>
        <SearchableMultiItemSelect
          values={values.productIds ?? []}
          items={items}
          onChange={(ids) => set("productIds", ids)}
        />
        <p className="text-xs text-muted-foreground">
          These product pages will display this offer. Leave empty for an offer that only appears on the Offers page.
        </p>
      </div>

      {/* ── Display & schedule ── */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-semibold text-foreground">Display & Schedule</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Priority <span className="text-muted-foreground text-xs font-normal">(lower = shown first)</span></Label>
            <Input type="number" value={values.priority} onChange={(e) => set("priority", e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Start date &amp; time</Label>
            <Input type="datetime-local" value={values.startAt} onChange={(e) => set("startAt", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>End date &amp; time</Label>
            <Input type="datetime-local" value={values.endAt} onChange={(e) => set("endAt", e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          The offer only appears on the website between the start and end times. Leave blank to show it as long as it&apos;s Active.
        </p>
      </div>

      {/* ── Status ── */}
      <div className="space-y-2 border-t pt-6">
        <Label htmlFor="offer-status">Status</Label>
        <div className="flex items-center gap-3">
          <Switch
            id="offer-status"
            checked={values.isActive}
            onCheckedChange={(c) => set("isActive", c)}
            className="h-6 w-11 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-200 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:shadow"
          />
          <span className={`text-sm font-semibold ${values.isActive ? "text-emerald-600" : "text-muted-foreground"}`}>
            {values.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 border-t pt-6">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
        >
          {isSubmitting ? "Saving..." : mode === "add" ? "Add Offer" : "Save Changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
