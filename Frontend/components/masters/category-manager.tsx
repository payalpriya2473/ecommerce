"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, AlertCircle, FolderTree, Edit, Search, CheckCircle2, Loader2, Upload, ImageIcon, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { API_BASE_URL, categoryAPI, itemGroupAPI } from "@/lib/api"
import type { Category } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

// ─────────────────────────────────────────────────────────────────────────────
// CategoryFormValues & CategoryFormFields (exported for reuse)
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryFormValues {
  name: string
  marginPercent: string
  slug: string
  displayOrder: string
  showOnWebsite: boolean
  categoryIconFile: File | null
  categoryIconPreview: string
  description: string
  seoHeading: string
  metaTitle: string
  metaDescription: string
  parentCategoryId: string
}

export const EMPTY_CATEGORY_FORM: CategoryFormValues = {
  name: "",
  marginPercent: "",
  slug: "",
  displayOrder: "",
  showOnWebsite: false,
  categoryIconFile: null,
  categoryIconPreview: "",
  description: "",
  seoHeading: "",
  metaTitle: "",
  metaDescription: "",
  parentCategoryId: "",
}

export function categoryToFormValues(cat: Category): CategoryFormValues {
  const category = cat as Category & {
    display_order?: number
    show_on_website?: boolean | number
    category_image?: string
    categoryIconUrl?: string
    categoryIcon?: string
    seo_heading?: string
    meta_title?: string
    meta_description?: string
    parent_category_id?: string
  }

  return {
    name: cat.name,
    marginPercent: cat.marginPercent.toString(),
    slug: category.slug || slugify(cat.name),
    displayOrder: category.displayOrder?.toString() || category.display_order?.toString() || "",
    showOnWebsite: parseBoolean(category.showOnWebsite ?? category.show_on_website),
    categoryIconFile: null,
    categoryIconPreview: toAssetUrl(category.categoryImage || category.category_image || category.categoryIconUrl || category.categoryIcon || ""),
    description: category.description || "",
    seoHeading: category.seoHeading || category.seo_heading || "",
    metaTitle: category.metaTitle || category.meta_title || "",
    metaDescription: category.metaDescription || category.meta_description || "",
    parentCategoryId: category.parentCategoryId || category.parent_category_id || "",
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function parseBoolean(value: boolean | number | string | undefined) {
  return value === true || value === 1 || value === "1" || value === "true"
}

export function toAssetUrl(url?: string | null) {
  if (!url) return ""
  if (/^https?:\/\//i.test(url)) return url
  const assetBaseUrl = API_BASE_URL.replace(/\/api\/?$/, "")
  return `${assetBaseUrl}${url.startsWith("/") ? url : `/${url}`}`
}

interface CategoryFormFieldsProps {
  values: CategoryFormValues
  onChange: (updated: Partial<CategoryFormValues>) => void
  onSubmit: () => void
  onCancel?: () => void
  error: string
  isSubmitting: boolean
  mode: "add" | "edit"
  hideCancelButton?: boolean
}

export function CategoryFormFields({
  values, onChange, onSubmit, onCancel, error, isSubmitting, mode, hideCancelButton,
}: CategoryFormFieldsProps) {
  const generatedSlug = slugify(values.name)
  const handleCategoryIconChange = (file: File | undefined) => {
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      onChange({ categoryIconFile: file, categoryIconPreview: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="cat-name">Category Name <span className="text-destructive">*</span></Label>
        <Input
          id="cat-name"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value, slug: slugify(e.target.value) })}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cat-margin">Margin (%) <span className="text-destructive">*</span></Label>
        <Input
          id="cat-margin"
          type="number"
          value={values.marginPercent}
          onChange={(e) => onChange({ marginPercent: e.target.value })}
          step="0.01"
          min="0"
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault()
            if (e.key === "Enter") onSubmit()
          }}
          onWheel={(e) => e.currentTarget.blur()}
        />
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Website Configurator</h3>
         
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cat-slug">Slug <span className="text-xs text-muted-foreground">(auto generated)</span></Label>
            <Input id="cat-slug" value={values.slug || generatedSlug} readOnly className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-display-order">Display Order</Label>
            <Input
              id="cat-display-order"
              type="number"
              min="0"
              value={values.displayOrder}
              onChange={(e) => onChange({ displayOrder: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault()
                if (e.key === "Enter") onSubmit()
              }}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border bg-background p-3">
            <div>
              <Label htmlFor="cat-show-website">Show on website</Label>
            </div>
            <Switch
              id="cat-show-website"
              checked={values.showOnWebsite}
              onCheckedChange={(checked) => onChange({ showOnWebsite: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cat-icon">Category Icon</Label>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-lg border bg-background flex items-center justify-center">
                {values.categoryIconPreview ? (
                  <img src={values.categoryIconPreview} alt="Category icon preview" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <Input
                id="cat-icon"
                type="file"
                accept="image/*"
                onChange={(e) => handleCategoryIconChange(e.target.files?.[0])}
                className="min-w-0 flex-1"
              />
              <Upload className="hidden h-5 w-5 text-muted-foreground sm:block" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cat-description">Description</Label>  
          <Textarea
            id="cat-description"
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value })}
            
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cat-seo-heading">SEO - Heading</Label>
            <Input
              id="cat-seo-heading"
              value={values.seoHeading}
              onChange={(e) => onChange({ seoHeading: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-meta-title">Meta Title</Label>
            <Input
              id="cat-meta-title"
              value={values.metaTitle}
              onChange={(e) => onChange({ metaTitle: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cat-meta-description">Meta Description</Label>
          <Textarea
            id="cat-meta-description"
            value={values.metaDescription}
            onChange={(e) => onChange({ metaDescription: e.target.value })}
            
          />
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-3 pt-2">
        <Button onClick={onSubmit} disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
          {isSubmitting
            ? (mode === "add" ? "Adding..." : "Saving...")
            : (mode === "add" ? "Add Category" : "Save Changes")}
        </Button>
        {!hideCancelButton && onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="flex-1">
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main CategoryManager
// ─────────────────────────────────────────────────────────────────────────────

export function CategoryManager() {
  type CategorySortKey = "name" | "marginPercent"
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [refreshToken, setRefreshToken] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [sortState, setSortState] = useState<SortState<CategorySortKey>>({
    key: "name",
    direction: "asc",
  })

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [isCheckingUsage, setIsCheckingUsage] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteBlockedReason, setDeleteBlockedReason] = useState("") // non-empty = blocked

  const { canView, canDelete } = usePermissions()

  // Debounce the search box before hitting the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  // Reset to the first page whenever the search term or sort changes.
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, sortState])

  // Server-side page fetch — re-runs on page/size/search/sort/refresh changes.
  useEffect(() => {
    let cancelled = false
    const loadPage = async () => {
      try {
        if (!hasLoadedOnce) setIsLoading(true)
        const token = sessionStorage.getItem("authToken")
        if (!token) return
        const res = await categoryAPI.getAll(token, {
          page: currentPage,
          limit: pageSize,
          search: debouncedSearchTerm || undefined,
          sortKey: sortState.key,
          sortDirection: sortState.direction,
        })
        if (cancelled) return
        if (res.success) {
          const rows = Array.isArray(res.data) ? res.data : []
          const pagination = res.pagination || {}
          const nextTotal = Number(pagination.totalItems ?? rows.length ?? 0)
          setCategories(rows)
          setTotalItems(nextTotal)
          setError("")
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          setCategories([])
          setTotalItems(0)
          setError(res.message || "Failed to load categories")
        }
      } catch {
        if (!cancelled) {
          setCategories([])
          setTotalItems(0)
          setError("Failed to load categories")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setHasLoadedOnce(true)
        }
      }
    }
    void loadPage()
    return () => { cancelled = true }
  }, [currentPage, pageSize, debouncedSearchTerm, sortState, refreshToken])

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize)
    setCurrentPage(1)
  }

  const handleSort = (key: CategorySortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const handleEditClick = (cat: Category) => {
    router.push(`/inventory-masters/categories/edit?id=${cat.id}`)
  }

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(""), 3000) }

  const isCategoryUsedInItemGroups = async (category: Category, token: string): Promise<boolean> => {
    try {
      const res = await itemGroupAPI.getAll(token)
      if (!res.success || !Array.isArray(res.data)) return false
      return res.data.some((group: any) =>
        String(group.categoryId ?? group.category_id ?? "") === category.id
      )
    } catch { return false }
  }

  // ── Opens the delete dialog and immediately checks usage ──
  const handleDeleteClick = async (cat: Category) => {
    if (!canDelete("categories")) {
      setError("You don't have permission to delete categories")
      setTimeout(() => setError(""), 3000); return
    }

    // Open dialog straight away with a loading state
    setCategoryToDelete(cat)
    setDeleteBlockedReason("")
    setDeleteDialogOpen(true)
    setIsCheckingUsage(true)

    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const isUsed = await isCategoryUsedInItemGroups(cat, token)
      if (isUsed) {
        setDeleteBlockedReason("This category is already used in Item Groups and cannot be deleted.")
      }
    } finally { setIsCheckingUsage(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete || deleteBlockedReason) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      // Double-check before actually deleting
      const isUsed = await isCategoryUsedInItemGroups(categoryToDelete, token)
      if (isUsed) {
        setDeleteBlockedReason("This category is already used in Item Groups and cannot be deleted.")
        return
      }
      const res = await categoryAPI.delete(categoryToDelete.id, token)
      if (res.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false); setCategoryToDelete(null)
        showSuccess("Category deleted successfully")
      } else {
        setDeleteBlockedReason(res.message || "Failed to delete category")
      }
    } finally { setIsDeleting(false) }
  }

  const handleDeleteDialogClose = () => {
    if (isDeleting || isCheckingUsage) return
    setDeleteDialogOpen(false)
    setCategoryToDelete(null)
    setDeleteBlockedReason("")
  }

  if (!canView("categories")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view categories.<br />Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading && !hasLoadedOnce) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading categories...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8 px-4">
      <div className="w-full">

        {success && (
          <Alert className="mb-4 border-green-500 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
            <p className="text-muted-foreground mt-1">View and manage all inventory categories</p>
          </div>
          <PermissionGate module="categories" action="create">
            <Button onClick={() => router.push("/inventory-masters/categories/register")} className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity">
              <Plus className="h-4 w-4 mr-2" />Add Category
            </Button>
          </PermissionGate>
        </div>

        {/* Search */}
        <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
          <CardContent className="p-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by category name..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-10 text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Table / Empty State */}
        {totalItems === 0 ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FolderTree className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mb-2">No categories found</p>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first category"}
              </p>
              {!searchTerm && (
                <PermissionGate module="categories" action="create">
                  <Button onClick={() => router.push("/inventory-masters/categories/register")} className="bg-gradient-to-r from-accent to-accent-secondary">
                    <Plus className="h-4 w-4 mr-2" />Add Category
                  </Button>
                </PermissionGate>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50 shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <SortableTableHead label="Category Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} className="w-[65%]" />
                    <SortableTableHead label="Margin (%)" active={sortState.key === "marginPercent"} direction={sortState.direction} onClick={() => handleSort("marginPercent")} className="text-center w-[20%]" buttonClassName="justify-center" />
                    <TableHead className="font-semibold text-center w-[15%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                            <FolderTree className="h-5 w-5 text-white" />
                          </div>
                          <p className="font-medium">{category.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">{category.marginPercent}%</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => router.push(`/inventory-masters/categories/view?id=${category.id}`)}
                            className="h-8 w-8 hover:bg-accent/10 hover:text-accent transition-colors" title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <PermissionGate module="categories" action="update">
                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(category)}
                              className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate module="categories" action="delete">
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(category)}
                              className="h-8 w-8 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
              itemLabel="categories"
            />
          </Card>
        )}

        {/* ── ADD / EDIT DIALOG ── */}
        {/* ── DELETE DIALOG ── */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) handleDeleteDialogClose() }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {isCheckingUsage ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    Checking usage...
                  </>
                ) : deleteBlockedReason ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    Cannot Delete Category
                  </>
                ) : (
                  "Are you absolutely sure?"
                )}
              </AlertDialogTitle>

              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1">
                  {isCheckingUsage ? (
                    <p className="text-sm text-muted-foreground">
                      Checking if <strong>{categoryToDelete?.name}</strong> is used anywhere...
                    </p>
                  ) : deleteBlockedReason ? (
                    // ── BLOCKED state ──
                    <Alert variant="destructive" className="mt-1">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{categoryToDelete?.name}</strong> is already used in Item Groups and cannot be deleted.
                        Please reassign or remove those item groups first.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    // ── SAFE to delete ──
                    <p>
                      This will{" "}
                      <strong className="text-red-600">permanently delete</strong>{" "}
                      <strong>{categoryToDelete?.name}</strong> from the inventory.
                      This action cannot be undone.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={isDeleting || isCheckingUsage}
                onClick={handleDeleteDialogClose}
              >
                {deleteBlockedReason ? "Close" : "Cancel"}
              </AlertDialogCancel>

              {/* Only show Delete button when NOT blocked and NOT checking */}
              {!deleteBlockedReason && !isCheckingUsage && (
                <Button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isDeleting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting...</>
                  ) : (
                    "Yes, Delete"
                  )}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  )
}
