"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Tag, ArrowLeft, Loader2 } from "lucide-react"
import { itemAPI, offerAPI, brandAPI } from "@/lib/api"
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

const VALID_SECTIONS = ["flash_sale", "home_best", "bank_offer", "brand_deal", "coupon", "combo", "clearance", "exchange_offer"]

function OfferRegisterContent() {
  const router = useRouter()
  const params = useSearchParams()
  const presetSection = params.get("section") || ""
  const [values, setValues] = useState<OfferFormValues>({
    ...EMPTY_OFFER_FORM,
    section: (VALID_SECTIONS.includes(presetSection) ? presetSection : EMPTY_OFFER_FORM.section) as OfferFormValues["section"],
  })
  const [items, setItems] = useState<OfferItemLite[]>([])
  const [brands, setBrands] = useState<BrandOption[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const [itemsRes, brandsRes] = await Promise.all([
        itemAPI.getAllLite(token),
        brandAPI.getAll(token),
      ])
      if (itemsRes.success && Array.isArray(itemsRes.data)) {
        setItems(itemsRes.data.map(toItemLite).filter((i: OfferItemLite) => i.id))
      }
      if (brandsRes.success && Array.isArray(brandsRes.data)) {
        setBrands(brandsRes.data.map(toBrandOption).filter((b: BrandOption) => b.id))
      }
    }
    load()
  }, [])

  const handleSubmit = async () => {
    setError("")
    if (!values.section) { setError("Please select an offer section"); return }
    if (values.section === "bank_offer") {
      if (!(values.banks ?? []).some((b) => b.bankName.trim())) { setError("Please add at least one bank offer with a bank name"); return }
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
      const res = await offerAPI.register(buildOfferPayload(values) as any, token)
      if (res.success) router.push(offersListRouteForSection(values.section))
      else setError(res.message || "Failed to create offer")
    } catch {
      setError("Failed to create offer. Please try again.")
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
                <CardTitle className="text-2xl">Add Offer</CardTitle>
                
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <OfferFormFields
              values={values}
              onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
              onSubmit={handleSubmit}
              onCancel={() => router.push(offersListRouteForSection(values.section))}
              error={error}
              isSubmitting={isSubmitting}
              mode="add"
              items={items}
              brands={brands}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function OfferRegisterPage() {
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
          <OfferRegisterContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
