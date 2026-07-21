"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Edit, FileText, FolderTree, Globe2, Image as ImageIcon, Search } from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { categoryAPI } from "@/lib/api"
import type { Category } from "@/lib/api"
import { toAssetUrl } from "@/components/masters/category-manager"

function readCategoryValue(category: Category, camelKey: keyof Category, snakeKey: string) {
  return (category as any)[camelKey] ?? (category as any)[snakeKey]
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value || "-"}</span>
    </div>
  )
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="text-destructive">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function CategoryViewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const categoryId = searchParams.get("id") || ""

  const [category, setCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const loadCategory = async () => {
      if (!categoryId) { setError("No category ID provided"); setLoading(false); return }
      const token = sessionStorage.getItem("authToken")
      if (!token) { router.replace("/login"); return }

      try {
        const res = await categoryAPI.getById(token, categoryId)
        if (res.success) {
          setCategory(res.data)
        } else {
          setError(res.message || "Category not found")
        }
      } catch (err: any) {
        setError(err.message || "Failed to load category")
      } finally {
        setLoading(false)
      }
    }

    loadCategory()
  }, [categoryId, router])

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading category details...</div>
  }

  if (error || !category) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] px-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderTree className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Category Not Found</h2>
            <p className="text-muted-foreground text-center">{error || "Category details could not be loaded."}</p>
            <Button onClick={() => router.push("/inventory-masters/categories")} className="mt-4 bg-red-700 text-white hover:bg-red-800">
              Back to Categories
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const categoryIcon = toAssetUrl(
    readCategoryValue(category, "categoryImage", "category_image") ||
    (category as any).categoryIconUrl ||
    (category as any).categoryIcon
  )
  const displayOrder = readCategoryValue(category, "displayOrder", "display_order")
  const showOnWebsite = readCategoryValue(category, "showOnWebsite", "show_on_website")
  const seoHeading = readCategoryValue(category, "seoHeading", "seo_heading")
  const metaTitle = readCategoryValue(category, "metaTitle", "meta_title")
  const metaDescription = readCategoryValue(category, "metaDescription", "meta_description")
  const parentCategoryId = readCategoryValue(category, "parentCategoryId", "parent_category_id")
  const slug = category.slug || "-"
  const visibleOnWebsite = showOnWebsite === true || showOnWebsite === 1 || showOnWebsite === "1" || showOnWebsite === "true"

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50/40 via-background to-background">
      <div className="space-y-6 w-full px-4 md:px-6">
        <Button onClick={() => router.push("/inventory-masters/categories")} className="bg-red-700 text-white hover:bg-red-800 shadow-sm gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-destructive to-red-800 flex items-center justify-center flex-shrink-0">
                <FolderTree className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{category.name}</h1>
                <p className="text-muted-foreground text-sm mt-0.5">{slug}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="secondary">{category.marginPercent}% Margin</Badge>
                  <Badge variant={visibleOnWebsite ? "default" : "outline"}>
                    {visibleOnWebsite ? "Shown on website" : "Hidden on website"}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              onClick={() => router.push(`/inventory-masters/categories/edit?id=${category.id}`)}
              className="bg-destructive hover:bg-red-800 text-white gap-2"
            >
              <Edit className="h-4 w-4" /> Edit Category
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <SectionCard title="Website Configurator" icon={<Globe2 className="h-5 w-5" />}>
            <InfoRow label="Slug" value={slug} />
            <InfoRow label="Display Order" value={displayOrder} />
            <InfoRow label="Show on Website" value={visibleOnWebsite ? "Yes" : "No"} />
            <InfoRow label="Parent Category ID" value={parentCategoryId} />
          </SectionCard>

          <SectionCard title="SEO" icon={<Search className="h-5 w-5" />}>
            <InfoRow label="SEO Heading" value={seoHeading} />
            <InfoRow label="Meta Title" value={metaTitle} />
            <div className="space-y-1 pt-2">
              <span className="text-sm text-muted-foreground">Meta Description</span>
              <p className="text-sm font-medium bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">{metaDescription || "-"}</p>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Description" icon={<FileText className="h-5 w-5" />}>
          <p className="text-sm font-medium bg-muted/40 rounded-lg p-3 whitespace-pre-wrap">{category.description || "-"}</p>
        </SectionCard>

        <SectionCard title="Category Icon" icon={<ImageIcon className="h-5 w-5" />}>
          {categoryIcon ? (
            <img src={categoryIcon} alt={`${category.name} icon`} className="h-28 w-28 rounded-lg object-cover border" />
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <span>No category icon uploaded</span>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

export default function CategoryViewPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
          <CategoryViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
