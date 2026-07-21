"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, FolderTree } from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { categoryAPI } from "@/lib/api"
import {
  CategoryFormFields,
  EMPTY_CATEGORY_FORM,
  type CategoryFormValues,
} from "@/components/masters/category-manager"

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildCategoryPayload(values: CategoryFormValues) {
  const payload = {
    name: values.name.trim(),
    marginPercent: parseFloat(values.marginPercent),
    slug: values.slug || slugify(values.name),
    displayOrder: values.displayOrder === "" ? undefined : parseInt(values.displayOrder, 10),
    showOnWebsite: values.showOnWebsite,
    description: values.description.trim(),
    seoHeading: values.seoHeading.trim(),
    metaTitle: values.metaTitle.trim(),
    metaDescription: values.metaDescription.trim(),
    parentCategoryId: values.parentCategoryId || undefined,
  }

  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== "") formData.append(key, String(value))
  })
  if (values.categoryIconFile) formData.append("categoryImage", values.categoryIconFile)
  return formData
}

export default function CategoryRegisterPage() {
  const router = useRouter()
  const [formValues, setFormValues] = useState<CategoryFormValues>({ ...EMPTY_CATEGORY_FORM })
  const [formError, setFormError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setFormError("")
    const marginPercent = parseFloat(formValues.marginPercent)
    const displayOrder = formValues.displayOrder === "" ? undefined : parseInt(formValues.displayOrder, 10)

    if (!formValues.name.trim()) { setFormError("Please enter a category name"); return }
    if (formValues.marginPercent === "" || Number.isNaN(marginPercent) || marginPercent < 0) {
      setFormError("Please enter a valid margin percentage"); return
    }
    if (displayOrder !== undefined && (Number.isNaN(displayOrder) || displayOrder < 0)) {
      setFormError("Please enter a valid display order"); return
    }

    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) { setFormError("Not authenticated. Please login again."); return }

      const result = await categoryAPI.register(buildCategoryPayload(formValues), token)
      if (result.success) {
        router.push("/inventory-masters/categories")
      } else {
        setFormError(result.message || "Failed to add category")
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to add category. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-4xl">
            <Button
              variant="ghost"
              onClick={() => router.push("/inventory-masters/categories")}
              className="mb-4 bg-red-700 text-white hover:bg-red-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center shrink-0">
                    <FolderTree className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Add Category</CardTitle>
                    <CardDescription>Create a new inventory category with website configuration</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <CategoryFormFields
                  values={formValues}
                  onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/categories")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="add"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
