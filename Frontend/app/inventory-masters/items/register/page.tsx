"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Package2, ArrowLeft } from "lucide-react"
import { brandAPI, itemGroupAPI, itemAPI } from "@/lib/api"
import type { Brand, ItemGroup } from "@/lib/api"
import {
  ItemFormFields,
  EMPTY_ITEM_FORM,
  buildItemFormData,
} from "@/app/inventory-masters/items/ItemForm"
import type { ItemFormValues } from "@/app/inventory-masters/items/ItemForm"

export default function ItemRegisterPage() {
  const router = useRouter()

  const [formValues, setFormValues] = useState<ItemFormValues>({ ...EMPTY_ITEM_FORM })
  const [brands, setBrands]         = useState<Brand[]>([])
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError]   = useState("")

  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const [bRes, gRes] = await Promise.all([
        brandAPI.getAll(token),
        itemGroupAPI.getAll(token),
      ])
      if (bRes.success) setBrands(bRes.data)
      if (gRes.success) setItemGroups(gRes.data)
    }
    load()
  }, [])

  const handleSubmit = async () => {
    setFormError("")
    if (!formValues.itemName.trim()) { setFormError("Item name is required"); return }
    if (!formValues.itemGroupId)     { setFormError("Please select an item group"); return }
    if (!formValues.brandId)         { setFormError("Please select a brand"); return }
    if (!formValues.hsnCode.trim())  { setFormError("HSN Code is required"); return }
    if (!formValues.gst || parseFloat(formValues.gst) < 0) {
      setFormError("GST % is required"); return
    }
    if (!Array.isArray(formValues.colors) || formValues.colors.length === 0) {
      setFormError("At least one product color is required"); return
    }
    if (!Array.isArray(formValues.variants) || formValues.variants.length === 0) {
      setFormError("At least one variant is required"); return
    }

    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) { setFormError("Not authenticated. Please login again."); return }

      const payload = buildItemFormData(formValues)
      const result = await itemAPI.register(payload, token)
      if (result.success) {
        router.push("/inventory-masters/items")
      } else {
        setFormError(result.message || "Failed to register item")
      }
    } catch (err: any) {
      const message = String(err?.message || "")
      setFormError(
        /fetch|payload too large|413/i.test(message)
          ? "Upload is too large. Please use fewer or smaller images and try again."
          : message || "Failed to register item. Please try again."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">
            <Button variant="ghost"
              onClick={() => router.push("/inventory-masters/items")}
              className="mb-4 bg-red-700 text-white hover:bg-red-800">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                    <Package2 className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-2xl">Add Item Master</CardTitle>
                    <CardDescription>Create a new item in the inventory system</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ItemFormFields
                  values={formValues}
                  onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/items")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="add"
                  initialBrands={brands}
                  initialItemGroups={itemGroups}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
