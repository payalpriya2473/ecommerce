"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Trash2, AlertCircle, Tag, Edit, Search, CheckCircle2, Loader2 } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { brandAPI, itemAPI } from "@/lib/api"
import type { Brand } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import {
  BrandFormFields, EMPTY_BRAND_FORM, brandToFormValues,
} from "@/components/masters/BrandFormFields"
import type { BrandFormValues } from "@/components/masters/BrandFormFields"
import { API_BASE_URL } from "@/lib/api"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

function toBrandIconUrl(url?: string | null) {
  if (!url) return ""
  if (/^https?:\/\//i.test(url)) return url
  const assetBaseUrl = API_BASE_URL.replace(/\/api\/?$/, "")
  return `${assetBaseUrl}${url.startsWith("/") ? url : `/${url}`}`
}

export function BrandManager() {
  type BrandSortKey = "name"
  const [brands, setBrands] = useState<Brand[]>([])
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
  const [sortState, setSortState] = useState<SortState<BrandSortKey>>({
    key: "name",
    direction: "asc",
  })

  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formValues, setFormValues] = useState<BrandFormValues>(EMPTY_BRAND_FORM)
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null)
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
        const res = await brandAPI.getAll(token, {
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
          setBrands(rows)
          setTotalItems(nextTotal)
          setError("")
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          setBrands([])
          setTotalItems(0)
          setError(res.message || "Failed to load brands")
        }
      } catch {
        if (!cancelled) {
          setBrands([])
          setTotalItems(0)
          setError("Failed to load brands")
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

  const handleSort = (key: BrandSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const handleOpenAdd = () => {
    setDialogMode("add"); setFormValues(EMPTY_BRAND_FORM)
    setEditingBrand(null); setFormError(""); setDialogOpen(true)
  }

  const handleEditClick = (brand: Brand) => {
    setDialogMode("edit"); setFormValues(brandToFormValues(brand))
    setEditingBrand(brand); setFormError(""); setDialogOpen(true)
  }

const handleSubmit = async () => {
  setFormError("")
  if (!formValues.name.trim()) { setFormError("Please enter a brand name"); return }
  setIsSubmitting(true)
  try {
    const token = sessionStorage.getItem("authToken")
    if (!token) return

    const fd = new FormData()
    fd.append("name", formValues.name.trim())
    if (formValues.iconFile) fd.append("icon", formValues.iconFile)
    // Signal removal of existing icon if user cleared it
    if (!formValues.iconFile && !formValues.iconUrl) fd.append("removeIcon", "true")

    if (dialogMode === "add") {
      const res = await brandAPI.register(fd, token)          // pass FormData
      if (res.success) {
        setRefreshToken((v) => v + 1)
        setDialogOpen(false)
        showSuccess(`Brand "${res.data.name}" added successfully`)
      } else { setFormError(res.message || "Failed to add brand") }
    } else {
      if (!editingBrand) return
      const res = await brandAPI.update(editingBrand.id, fd, token)  // pass FormData
      if (res.success) {
        setRefreshToken((v) => v + 1)
        setDialogOpen(false); setEditingBrand(null)
        showSuccess("Brand updated successfully")
      } else { setFormError(res.message || "Failed to update brand") }
    }
  } finally { setIsSubmitting(false) }
}

  const showSuccess = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(""), 3000) }

  const isBrandUsedInItems = async (brand: Brand, token: string): Promise<boolean> => {
    try {
      const res = await itemAPI.getAll(token)
      if (!res.success || !Array.isArray(res.data)) return false
      return res.data.some((item: any) =>
        String(item.brandId ?? item.brand_id ?? "") === brand.id
      )
    } catch { return false }
  }

  // ── Opens delete dialog and immediately checks usage ──
  const handleDeleteClick = async (brand: Brand) => {
    if (!canDelete("brands")) {
      setError("You don't have permission to delete brands")
      setTimeout(() => setError(""), 3000); return
    }

    // Open dialog straight away with loading state
    setBrandToDelete(brand)
    setDeleteBlockedReason("")
    setDeleteDialogOpen(true)
    setIsCheckingUsage(true)

    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const isUsed = await isBrandUsedInItems(brand, token)
      if (isUsed) {
        setDeleteBlockedReason("This brand is used in Items and cannot be deleted.")
      }
    } finally { setIsCheckingUsage(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!brandToDelete || deleteBlockedReason) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      // Double-check before actually deleting
      const isUsed = await isBrandUsedInItems(brandToDelete, token)
      if (isUsed) {
        setDeleteBlockedReason("This brand is used in Items and cannot be deleted.")
        return
      }
      const res = await brandAPI.delete(brandToDelete.id, token)
      if (res.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false); setBrandToDelete(null)
        showSuccess("Brand deleted successfully")
      } else {
        setDeleteBlockedReason(res.message || "Failed to delete brand")
      }
    } finally { setIsDeleting(false) }
  }

  const handleDeleteDialogClose = () => {
    if (isDeleting || isCheckingUsage) return
    setDeleteDialogOpen(false)
    setBrandToDelete(null)
    setDeleteBlockedReason("")
  }

  if (!canView("brands")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view brands.<br />Please contact your administrator.
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
          <p className="text-muted-foreground">Loading brands...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Brands</h1>
            <p className="text-muted-foreground mt-1">View and manage all inventory brands</p>
          </div>
          <PermissionGate module="brands" action="create">
            <Button onClick={handleOpenAdd} className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
              <Plus className="h-4 w-4 mr-2" />Add Brand
            </Button>
          </PermissionGate>
        </div>

        {/* Search */}
        <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
          <CardContent className="p-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by brand name..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-10 text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Table / Empty */}
        {totalItems === 0 ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Tag className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mb-2">No brands found</p>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first brand"}
              </p>
              {!searchTerm && (
                <PermissionGate module="brands" action="create">
                  <Button onClick={handleOpenAdd} className="bg-gradient-to-r from-accent to-accent-secondary">
                    <Plus className="h-4 w-4 mr-2" />Add Brand
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
                    <SortableTableHead label="Brand Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} className="w-[85%]" />
                    <TableHead className="font-semibold text-center w-[15%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((brand) => (
                    <TableRow key={brand.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
  <div className="flex items-center gap-3">
    {brand.iconUrl ? (
      <img
        src={toBrandIconUrl(brand.iconUrl)}
        alt={brand.name}
        className="h-10 w-10 rounded-lg object-contain border bg-white p-1 flex-shrink-0"
      />
    ) : (
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
        <Tag className="h-5 w-5 text-white" />
      </div>
    )}
    <p className="font-medium">{brand.name}</p>
  </div>
</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <PermissionGate module="brands" action="update">
                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(brand)}
                              className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate module="brands" action="delete">
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(brand)}
                              className="h-8 w-8 hover:bg-red-50 hover:text-red-600" title="Delete">
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
              itemLabel="brands"
            />
          </Card>
        )}

        {/* ── ADD / EDIT DIALOG ── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
                  {dialogMode === "add" ? <Plus className="h-4 w-4 text-white" /> : <Edit className="h-4 w-4 text-white" />}
                </div>
                {dialogMode === "add" ? "Add Brand" : "Edit Brand"}
              </DialogTitle>
              <DialogDescription>
                {dialogMode === "add"
                  ? "Create a new brand for inventory management"
                  : <>Update details for <strong>{editingBrand?.name}</strong></>}
              </DialogDescription>
            </DialogHeader>
            <BrandFormFields
              values={formValues}
              onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
              onSubmit={handleSubmit}
              onCancel={() => setDialogOpen(false)}
              error={formError}
              isSubmitting={isSubmitting}
              mode={dialogMode}
            />
          </DialogContent>
        </Dialog>

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
                    Cannot Delete Brand
                  </>
                ) : (
                  "Are you absolutely sure?"
                )}
              </AlertDialogTitle>

              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1">
                  {isCheckingUsage ? (
                    <p className="text-sm text-muted-foreground">
                      Checking if <strong>{brandToDelete?.name}</strong> is used in any items...
                    </p>
                  ) : deleteBlockedReason ? (
                    // ── BLOCKED state ──
                    <Alert variant="destructive" className="mt-1">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{brandToDelete?.name}</strong> is used in Items and cannot be deleted.
                        Please reassign or remove those items first.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    // ── SAFE to delete ──
                    <p>
                      This will{" "}
                      <strong className="text-red-600">permanently delete</strong>{" "}
                      <strong>{brandToDelete?.name}</strong> from the inventory.
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
