"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Tag, ArrowLeft, Loader2 } from "lucide-react"
import { itemAPI, offerAPI, brandAPI, type OfferSection } from "@/lib/api"
import {
  OfferFormFields, EMPTY_OFFER_FORM, buildOfferPayload, offersListRouteForSection,
  type OfferFormValues, type OfferItemLite,
} from "@/app/inventory-masters/offers/OfferForm"
import type { BrandOption } from "@/components/masters/searchable-brand-select"

function toItemLite(raw: any): OfferItemLite {
  const v = raw?.variants?.[0]
  return {
    id: String(raw?.id ?? ""),
    itemName: raw?.itemName ?? "",
    variant: raw?.variant ?? v?.variant ?? "",
    brandName: raw?.brandName ?? "",
    itemGroupName: raw?.itemGroupName ?? "",
    offerPrice: Number(raw?.offerPrice ?? v?.offerPrice ?? 0),
  }
}

function toBrandOption(raw: any): BrandOption {
  return {
    id: String(raw?.id ?? ""),
    name: raw?.name ?? "",
    iconUrl: raw?.iconUrl ?? null,
  }
}

// "2026-07-03T17:30:00.000Z" → "2026-07-03T17:30" for datetime-local
function toLocalInput(v?: string | null): string {
  if (!v) return ""
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function OfferEditContent() {
  const router = useRouter()
  const params = useSearchParams()
  const id = params.get("id") || ""
  const isView = params.get("mode") === "view"

  const [values, setValues] = useState<OfferFormValues>({ ...EMPTY_OFFER_FORM })
  const [items, setItems] = useState<OfferItemLite[]>([])
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token || !id) return
      try {
        const [itemsRes, brandsRes, offerRes] = await Promise.all([
          itemAPI.getAllLite(token),
          brandAPI.getAll(token),
          offerAPI.getById(token, id),
        ])
        if (itemsRes.success && Array.isArray(itemsRes.data)) {
          setItems(itemsRes.data.map(toItemLite).filter((i: OfferItemLite) => i.id))
        }
        if (brandsRes.success && Array.isArray(brandsRes.data)) {
          setBrands(brandsRes.data.map(toBrandOption).filter((b: BrandOption) => b.id))
        }
        if (offerRes.success && offerRes.data) {
          const o = offerRes.data
          const discountType: "percent" | "amount" = o.discountAmount != null && o.discountAmount !== 0 && (o.discountPercent == null || o.discountPercent === 0)
            ? "amount"
            : (o.discountType === "amount" ? "amount" : "percent")
          setValues({
            itemId: String(o.itemId ?? ""),
            section: (o.section ?? "flash_sale") as OfferSection,
            badge: o.badge ?? "",
            couponCode: o.couponCode ?? "",
            discountType,
            discountValue: String(discountType === "amount" ? (o.discountAmount ?? "") : (o.discountPercent ?? "")),
            offerPrice: o.offerPrice != null ? String(o.offerPrice) : "",
            soldPercent: o.soldPercent != null ? String(o.soldPercent) : "",
            stockLeft: o.stockLeft != null ? String(o.stockLeft) : "",
            priority: o.priority != null ? String(o.priority) : "0",
            startAt: toLocalInput(o.startAt),
            endAt: toLocalInput(o.endAt),
            isActive: Boolean(o.isActive),
            banks: [{
              bankName: o.bankName ?? "",
              bankAbbr: o.bankAbbr ?? "",
              offerText: o.offerText ?? "",
              offerSub: o.offerSub ?? "",
              description: o.description ?? "",
              tags: o.tags ?? "",
              colorTheme: o.colorTheme ?? "blue",
            }],
            comboTitle: o.comboTitle ?? "",
            comboItems: Array.isArray(o.comboItems) && o.comboItems.length
              ? o.comboItems.map((c: any) => ({
                  itemId: String(c.itemId ?? ""),
                  itemName: c.itemName ?? "",
                  price: c.price != null ? String(c.price) : "",
                }))
              : [{ itemId: "", itemName: "", price: "" }, { itemId: "", itemName: "", price: "" }],
            productIds: Array.isArray(o.productIds) ? o.productIds.map((x: any) => String(x)) : [],
            couponTitle: o.couponTitle ?? "",
            categoryLabel: o.categoryLabel ?? "",
            minOrder: o.minOrder != null ? String(o.minOrder) : "",
            maxOff: o.maxOff != null ? String(o.maxOff) : "",
            validTill: o.validTill ? String(o.validTill).slice(0, 10) : "",
            brandId: o.brandId != null ? String(o.brandId) : "",
            brandDealName: o.brandDealName ?? "",
            discountLabel: o.discountLabel ?? "",
            exchangeTitle: o.exchangeTitle ?? "",
            exchangePartnerName: o.exchangePartnerName ?? "",
            ctaText: o.ctaText ?? "",
            description: o.description ?? "",
            colorTheme: o.colorTheme ?? "blue",
            tags: o.tags ?? "",
          })
        } else {
          setError(offerRes.message || "Offer not found")
        }
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id])

  const handleSubmit = async () => {
    if (isView) return
    setError("")
    if (values.section === "bank_offer") {
      if (!values.banks?.[0]?.bankName.trim()) { setError("Please enter the bank / card name"); return }
    } else if (values.section === "combo") {
      if (!values.comboTitle.trim()) { setError("Please enter a combo title"); return }
      if ((values.comboItems ?? []).filter((c) => c.itemId).length < 2) { setError("A combo needs at least 2 products"); return }
      if (!values.offerPrice) { setError("Please enter the combo price"); return }
    } else if (values.section === "coupon") {
      if (!values.couponCode.trim()) { setError("Please enter a coupon code"); return }
      if (!values.couponTitle.trim()) { setError("Please enter a coupon title"); return }
    } else if (values.section === "brand_deal") {
      if (!values.brandId) { setError("Please select a brand"); return }
    } else if (values.section === "exchange_offer") {
      if (!values.exchangeTitle.trim()) { setError("Please enter an exchange offer title"); return }
    } else {
      if (!values.itemId) { setError("Please select a product from Item Master"); return }
      if (!values.discountValue && !values.offerPrice) {
        setError("Please enter a discount value or an offer price"); return
      }
    }
    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) { setError("Not authenticated"); return }
      const res = await offerAPI.update(id, buildOfferPayload(values, "edit") as any, token)
      if (res.success) router.push(offersListRouteForSection(values.section))
      else setError(res.message || "Failed to update offer")
    } catch {
      setError("Failed to update offer. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="py-8 px-4">
      <div className="w-full">
        <Button variant="ghost" onClick={() => router.push(offersListRouteForSection(values.section))}
          className="mb-4 bg-red-700 text-white hover:bg-red-800">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                <Tag className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl">{isView ? "View Offer" : "Edit Offer"}</CardTitle>
                <CardDescription>
                  {isView ? "Read-only view of this offer's details" : "Update discount, schedule, and display settings"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-16 text-center text-muted-foreground">Loading offer...</div>
            ) : (
              <OfferFormFields
                values={values}
                onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
                onSubmit={handleSubmit}
                onCancel={() => router.push(offersListRouteForSection(values.section))}
                error={error}
                isSubmitting={isSubmitting}
                mode={isView ? "view" : "edit"}
                items={items}
                brands={brands}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function OfferEditPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <OfferEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
