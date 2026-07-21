"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, FolderTree } from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { categoryAPI } from "@/lib/api"
import {
  CategoryFormFields,
  EMPTY_CATEGORY_FORM,
  categoryToFormValues,
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

function CategoryEditContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const categoryId = searchParams.get("id") || ""

  const [formValues, setFormValues] = useState<CategoryFormValues>({ ...EMPTY_CATEGORY_FORM })
  const [categoryName, setCategoryName] = useState("")
  const [loadError, setLoadError] = useState("")
  const [formError, setFormError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const loadCategory = async () => {
      if (!categoryId) { setLoadError("No category ID provided"); setIsLoading(false); return }
      const token = sessionStorage.getItem("authToken")
      if (!token) { router.replace("/login"); return }

      try {
        const res = await categoryAPI.getById(token, categoryId)
        if (res.success) {
          setFormValues(categoryToFormValues(res.data))
          setCategoryName(res.data.name || "")
        } else {
          setLoadError(res.message || "Category not found")
        }
      } catch (err: any) {
        setLoadError(err.message || "Failed to load category")
      } finally {
        setIsLoading(false)
      }
    }

    loadCategory()
  }, [categoryId, router])

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

      const result = await categoryAPI.update(categoryId, buildCategoryPayload(formValues), token)
      if (result.success) {
        router.push("/inventory-masters/categories")
      } else {
        setFormError(result.message || "Failed to update category")
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to update category. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading category...</div>
  }

  if (loadError) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>
        <Button onClick={() => router.push("/inventory-masters/categories")} className="mt-4 bg-red-700 text-white hover:bg-red-800">
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
      </div>
    )
  }

  return (
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
                <CardTitle className="text-2xl">Edit Category</CardTitle>
                <CardDescription>Update details for {categoryName || "this category"}</CardDescription>
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
              mode="edit"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function CategoryEditPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
          <CategoryEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
