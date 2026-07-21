"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Tag, ArrowLeft } from "lucide-react"
import { itemAPI, offerAPI } from "@/lib/api"
import {
  OfferFormFields, EMPTY_OFFER_FORM, buildOfferPayload,
  type OfferFormValues, type OfferItemLite,
} from "@/app/inventory-masters/offers/OfferForm"

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

const VALID_SECTIONS = ["flash_sale", "home_best", "bank_offer", "brand_deal", "coupon", "combo", "clearance"]

export default function OfferRegisterPage() {
  const router = useRouter()
  const params = useSearchParams()
  const presetSection = params.get("section") || ""
  const [values, setValues] = useState<OfferFormValues>({
    ...EMPTY_OFFER_FORM,
    section: (VALID_SECTIONS.includes(presetSection) ? presetSection : EMPTY_OFFER_FORM.section) as OfferFormValues["section"],
  })
  const [items, setItems] = useState<OfferItemLite[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await itemAPI.getAllLite(token)
      if (res.success && Array.isArray(res.data)) {
        setItems(res.data.map(toItemLite).filter((i: OfferItemLite) => i.id))
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
      if (!values.brandDealName.trim()) { setError("Please enter a brand name"); return }
    } else if (!values.itemId) {
      setError("Please select a product from Item Master"); return
    }
    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) { setError("Not authenticated"); return }
      const res = await offerAPI.register(buildOfferPayload(values) as any, token)
      if (res.success) router.push("/inventory-masters/offers")
      else setError(res.message || "Failed to create offer")
    } catch {
      setError("Failed to create offer. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">
            <Button variant="ghost" onClick={() => router.push("/inventory-masters/offers")}
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
                    <CardDescription>Create a website offer from an existing Item Master product</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <OfferFormFields
                  values={values}
                  onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/offers")}
                  error={error}
                  isSubmitting={isSubmitting}
                  mode="add"
                  items={items}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
