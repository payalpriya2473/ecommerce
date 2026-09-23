"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus, Trash2, AlertCircle, Package, Edit, Search, CheckCircle2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { categoryAPI, itemGroupAPI } from "@/lib/api"
import type { Category, ItemGroup } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { sortCollectionByKey, type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ItemGroupFormValues {
  name: string
  categoryId: string
  combineGroup: string
  hsnCode: string
  gst: string
  hasDemoInstallation: boolean
  buyBackValue: string
  maxQty: string
}

const EMPTY_ITEM_GROUP_FORM: ItemGroupFormValues = {
  name: "",
  categoryId: "",
  combineGroup: "",
  hsnCode: "",
  gst: "",
  hasDemoInstallation: false,
  buyBackValue: "",
  maxQty: "",
}

function itemGroupToFormValues(group: any): ItemGroupFormValues {
  return {
    name:                group?.name || "",
    categoryId:          group?.categoryId || "",
    combineGroup:        group?.combineGroup || "",
    hsnCode:             group?.hsnCode || "",
    gst:                 group?.gst != null ? String(group.gst) : "",
    hasDemoInstallation: Boolean(Number(group?.hasDemoInstallation)),
    buyBackValue:        group?.buyBackValue != null ? String(group.buyBackValue) : "",
    // treat 0 as blank — maxQty is optional
    maxQty: group?.maxQty != null ? String(group.maxQty) : "",
  }
}

const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

// ─────────────────────────────────────────────────────────────
// Add Category Mini Modal (inline)
// ─────────────────────────────────────────────────────────────

function AddCategoryModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean
  onClose: () => void
  onAdded: (cat: Category) => void
}) {
  const [name, setName] = useState("")
  const [marginPercent, setMarginPercent] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const reset = () => { setName(""); setMarginPercent(""); setError("") }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async () => {
    setError("")
    if (!name.trim()) { setError("Category name is required"); return }
    if (marginPercent === "" || parseFloat(marginPercent) < 0) {
      setError("Please enter a valid margin percentage (0 or above)"); return
    }
    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) { setError("Not authenticated"); return }
      const payload: any = { name: name.trim(), marginPercent: parseFloat(marginPercent) || 0 }
      const res = await categoryAPI.register(payload, token)
      if (res.success) { onAdded(res.data); reset(); onClose() }
      else setError(res.message || "Failed to add category")
    } finally { setIsSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
              <Plus className="h-4 w-4 text-white" />
            </div>
            Add Category
          </DialogTitle>
          <DialogDescription>Create a new inventory category with margin settings</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="new-cat-name">Category Name <span className="text-destructive">*</span></Label>
            <Input
              id="new-cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Air Conditioners, Refrigerators"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-cat-margin">Margin (%) <span className="text-destructive">*</span></Label>
            <Input
              id="new-cat-margin"
              type="number"
              value={marginPercent}
              onChange={(e) => setMarginPercent(e.target.value)}
              placeholder="e.g., 15"
              step="0.01"
              min="0"
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault()
                if (e.key === "Enter") handleSubmit()
              }}
              onWheel={(e) => e.currentTarget.blur()}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-3 pt-1">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
            >
              {isSubmitting ? "Adding..." : "Add Category"}
            </Button>
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────
// Item Group Form Fields (inline)
// ─────────────────────────────────────────────────────────────

function ItemGroupFormFields({
  values,
  onChange,
  onSubmit,
  onCancel,
  error,
  isSubmitting,
  mode,
  categories: categoriesProp,
  combineGroupOptions,
  onCategoryAdded,
}: {
  values: ItemGroupFormValues
  onChange: (updated: Partial<ItemGroupFormValues>) => void
  onSubmit: () => void
  onCancel?: () => void
  error: string
  isSubmitting: boolean
  mode: "add" | "edit"
  categories: Category[]
  combineGroupOptions: string[]
  onCategoryAdded?: (cat: Category) => void
}) {
  const [localCats, setLocalCats] = useState<Category[]>([])
  const [addCatOpen, setAddCatOpen] = useState(false)

  // Merge locally-added categories with parent list
  const mergedCategories = [
    ...localCats.filter((lc) => !categoriesProp.find((pc) => pc.id === lc.id)),
    ...categoriesProp,
  ]

  const handleCategoryAdded = (cat: Category) => {
    setLocalCats((prev) => [cat, ...prev])
    onChange({ categoryId: cat.id })
    onCategoryAdded?.(cat)
  }

  const numKD = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault()
  }
  const numWh = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()

  return (
    <>
      <div className="space-y-4 pt-2">

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="ig-name">Name <span className="text-destructive">*</span></Label>
          <Input
            id="ig-name"
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            // placeholder="Name of the item group"
          />
        </div>

        {/* Category + Add New */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Category <span className="text-destructive">*</span></Label>
            <Button
              type="button"
              size="sm"
              onClick={() => setAddCatOpen(true)}
              className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent"
            >
              <Plus className="h-3.5 w-3.5" /> Add New
            </Button>
          </div>
          <Select value={values.categoryId} onValueChange={(v) => onChange({ categoryId: v })}>
            <SelectTrigger className="bg-background w-full h-10">
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent>
              {mergedCategories.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">No categories. Click "+ Add New".</div>
              ) : (
                mergedCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Combine Group */}
        <div className="space-y-2">
          <Label>Combine Group</Label>
          <Select
            value={values.combineGroup || "none"}
            onValueChange={(v) => onChange({ combineGroup: v === "none" ? "" : v })}
          >
            <SelectTrigger className="bg-background w-full h-10">
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {combineGroupOptions.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* HSN Code + GST */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ig-hsn">HSN Code <span className="text-destructive">*</span></Label>
            <Input
              id="ig-hsn"
              value={values.hsnCode}
              onChange={(e) => onChange({ hsnCode: e.target.value })}
              // placeholder="e.g., 84151010"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ig-gst">GST (%) <span className="text-destructive">*</span></Label>
            <Input
              id="ig-gst"
              type="number"
              value={values.gst}
              onChange={(e) => onChange({ gst: e.target.value })}
              step="0.01"
              min="0"
              // placeholder="e.g., 18"
              className={NO_SPINNER}
              onKeyDown={numKD}
              onWheel={numWh}
            />
          </div>
        </div>

        {/* Demo / Installation */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="ig-demo"
            checked={values.hasDemoInstallation}
            onCheckedChange={(v) => onChange({ hasDemoInstallation: v as boolean })}
          />
          <Label htmlFor="ig-demo" className="font-semibold text-sm cursor-pointer">
            Demo / Installation
          </Label>
        </div>

        {/* Buy Back Value + Max Qty (optional) */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ig-buyback">Buy Back Value</Label>
            <Input
              id="ig-buyback"
              type="number"
              value={values.buyBackValue}
              onChange={(e) => onChange({ buyBackValue: e.target.value })}
              // placeholder="Optional"
              step="0.01"
              min="0"
              className={NO_SPINNER}
              onKeyDown={numKD}
              onWheel={numWh}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ig-maxqty">
              Max Qty{" "}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <Input
              id="ig-maxqty"
              type="number"
              value={values.maxQty}
              onChange={(e) => onChange({ maxQty: e.target.value })}
              // placeholder="Optional"
              step="1"
              min="0"
              className={NO_SPINNER}
              onKeyDown={numKD}
              onWheel={numWh}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
          >
            {isSubmitting ? "Saving..." : mode === "add" ? "Add Item Group" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onCancel?.()}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Add Category Modal */}
      <AddCategoryModal
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        onAdded={handleCategoryAdded}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Main ItemGroupManager Page Component
// ─────────────────────────────────────────────────────────────

export function ItemGroupManager() {
  type ItemGroupSortKey = "name" | "category" | "hsnCode" | "gst" | "maxQty" | "demo"
  const [categories, setCategories] = useState<Category[]>([])
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([])
  const [groupNames, setGroupNames] = useState<string[]>([])
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
  const [sortState, setSortState] = useState<SortState<ItemGroupSortKey>>({
    key: "name",
    direction: "asc",
  })

  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formValues, setFormValues] = useState<ItemGroupFormValues>(EMPTY_ITEM_GROUP_FORM)
  const [editingGroup, setEditingGroup] = useState<ItemGroup | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<ItemGroup | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { canView, canDelete } = usePermissions()

  const normalizeItemGroup = (group: any): ItemGroup => ({
    ...group,
    id:                  group?.id || group?._id || "",
    name:                group?.name || "",
    gst:                 group?.gst ?? 0,
    maxQty:              group?.maxQty ?? 0,
    hsnCode:             group?.hsnCode || "",
    categoryId:          group?.categoryId || "",
    categoryName:        group?.categoryName || "",
    combineGroup:        group?.combineGroup || "",
    hasDemoInstallation: group?.hasDemoInstallation ?? false,
    buyBackValue:        group?.buyBackValue ?? undefined,
    isActive:            group?.isActive ?? true,
  })

  const loadCategories = async () => {
    const token = sessionStorage.getItem("authToken")
    if (!token) return
    const res = await categoryAPI.getAll(token)
    if (res.success) setCategories(Array.isArray(res.data) ? res.data : [])
  }

  // The Combine Group dropdown needs ALL group names, not just one page,
  // so this is fetched separately (no pagination params = returns all).
  const loadGroupNames = async () => {
    const token = sessionStorage.getItem("authToken")
    if (!token) return
    const res = await itemGroupAPI.getAll(token)
    if (res.success) {
      const names = (Array.isArray(res.data) ? res.data : [])
        .map((g: any) => g?.name)
        .filter(Boolean)
      setGroupNames(names)
    }
  }

  const refreshCategories = loadCategories

  useEffect(() => {
    void loadCategories()
    void loadGroupNames()
  }, [])

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
        const res = await itemGroupAPI.getAll(token, undefined, {
          page: currentPage,
          limit: pageSize,
          search: debouncedSearchTerm || undefined,
          sortKey: sortState.key,
          sortDirection: sortState.direction,
        })
        if (cancelled) return
        if (res.success) {
          const rows = Array.isArray(res.data) ? res.data.map(normalizeItemGroup) : []
          const pagination = res.pagination || {}
          const nextTotal = Number(pagination.totalItems ?? rows.length ?? 0)
          setItemGroups(rows)
          setTotalItems(nextTotal)
          setError("")
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          setItemGroups([])
          setTotalItems(0)
          setError(res.message || "Failed to load item groups")
        }
      } catch {
        if (!cancelled) {
          setItemGroups([])
          setTotalItems(0)
          setError("Failed to load item groups")
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

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize)
    setCurrentPage(1)
  }

  const handleSort = (key: ItemGroupSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const handleOpenAdd = async () => {
    await refreshCategories()
    setDialogMode("add")
    setFormValues({ ...EMPTY_ITEM_GROUP_FORM })
    setEditingGroup(null)
    setFormError("")
    setDialogOpen(true)
  }

  const handleEditClick = async (group: ItemGroup) => {
    await refreshCategories()
    try {
      const token = sessionStorage.getItem("authToken")
      let groupData = group
      if (token && group.id) {
        const res = await itemGroupAPI.getById(token, group.id)
        if (res.success && res.data) groupData = normalizeItemGroup(res.data)
      }
      setDialogMode("edit")
      setFormValues(itemGroupToFormValues(groupData))
      setEditingGroup(groupData)
      setFormError("")
      setDialogOpen(true)
    } catch {
      setDialogMode("edit")
      setFormValues(itemGroupToFormValues(group))
      setEditingGroup(group)
      setFormError("")
      setDialogOpen(true)
    }
  }

  const validateForm = (): boolean => {
    if (!formValues.name.trim())                                    { setFormError("Please enter item group name"); return false }
    if (!formValues.categoryId)                                     { setFormError("Please select a category"); return false }
    if (!formValues.hsnCode.trim())                                 { setFormError("Please enter HSN code"); return false }
    if (formValues.gst === "" || parseFloat(formValues.gst) < 0)   { setFormError("Please enter a valid GST rate"); return false }
    return true
  }

  const handleSubmit = async () => {
    setFormError("")
    if (!validateForm()) return
    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const payload = {
        categoryId:          formValues.categoryId,
        name:                formValues.name.trim(),
        combineGroup:        formValues.combineGroup.trim() || undefined,
        hsnCode:             formValues.hsnCode.trim(),
        gst:                 parseFloat(formValues.gst),
        hasDemoInstallation: formValues.hasDemoInstallation,
        buyBackValue:        formValues.buyBackValue ? parseFloat(formValues.buyBackValue) : undefined,
        // maxQty is optional — send undefined if blank
        maxQty: formValues.maxQty !== "" ? parseInt(formValues.maxQty) : 0,
      }
      if (dialogMode === "add") {
        const res = await itemGroupAPI.register(payload, token)
        if (res.success) {
          setRefreshToken((v) => v + 1)
          void loadGroupNames()
          setDialogOpen(false)
          showSuccess(`Item Group "${res.data.name}" added successfully`)
        } else { setFormError(res.message || "Failed to add item group") }
      } else {
        if (!editingGroup?.id) { setFormError("Cannot update: item group ID is missing"); return }
        const res = await itemGroupAPI.update(editingGroup.id, payload, token)
        if (res.success) {
          setRefreshToken((v) => v + 1)
          void loadGroupNames()
          setDialogOpen(false)
          setEditingGroup(null)
          showSuccess("Item group updated successfully")
        } else { setFormError(res.message || "Failed to update item group") }
      }
    } finally { setIsSubmitting(false) }
  }

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 3000)
  }

  const handleDeleteClick = (group: ItemGroup) => {
    if (!canDelete("item_groups")) {
      setError("You don't have permission to delete item groups")
      setTimeout(() => setError(""), 3000); return
    }
    setGroupToDelete(group); setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!groupToDelete) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await itemGroupAPI.delete(groupToDelete.id, token)
      if (res.success) {
        setRefreshToken((v) => v + 1)
        void loadGroupNames()
        setDeleteDialogOpen(false); setGroupToDelete(null)
        showSuccess("Item group deleted successfully")
      } else { setError(res.message || "Failed to delete item group") }
    } finally { setIsDeleting(false) }
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setDialogOpen(false)
      setEditingGroup(null)
      setFormError("")
      setFormValues({ ...EMPTY_ITEM_GROUP_FORM })
    }
  }

  if (!canView("item_groups")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view item groups.<br />
              Please contact your administrator.
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
          <p className="text-muted-foreground">Loading item groups...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Item Groups</h1>
            <p className="text-muted-foreground mt-1">View and manage all inventory item groups</p>
          </div>
          <PermissionGate module="item_groups" action="create">
            <Button
              onClick={handleOpenAdd}
              className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4 mr-2" />Add Item Group
            </Button>
          </PermissionGate>
        </div>

        {/* Search */}
        <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
          <CardContent className="p-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, category, or HSN code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        {totalItems === 0 ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mb-2">No item groups found</p>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                {searchTerm
                  ? "Try adjusting your search criteria"
                  : "Get started by adding your first item group"}
              </p>
              {!searchTerm && (
                <PermissionGate module="item_groups" action="create">
                  <Button onClick={handleOpenAdd} className="bg-gradient-to-r from-accent to-accent-secondary">
                    <Plus className="h-4 w-4 mr-2" />Add Item Group
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
                    <SortableTableHead label="Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} className="w-[28%]" />
                    <SortableTableHead label="Category" active={sortState.key === "category"} direction={sortState.direction} onClick={() => handleSort("category")} className="w-[18%]" />
                    <SortableTableHead label="HSN Code" active={sortState.key === "hsnCode"} direction={sortState.direction} onClick={() => handleSort("hsnCode")} className="w-[14%]" />
                    <SortableTableHead label="GST (%)" active={sortState.key === "gst"} direction={sortState.direction} onClick={() => handleSort("gst")} className="text-center w-[11%]" buttonClassName="justify-center" />
                    <SortableTableHead label="Max Qty" active={sortState.key === "maxQty"} direction={sortState.direction} onClick={() => handleSort("maxQty")} className="text-center w-[10%]" buttonClassName="justify-center" />
                    <SortableTableHead label="Demo" active={sortState.key === "demo"} direction={sortState.direction} onClick={() => handleSort("demo")} className="text-center w-[8%]" buttonClassName="justify-center" />
                    <TableHead className="font-semibold text-center w-[11%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemGroups.map((group) => (
                    <TableRow key={group.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                            <Package className="h-5 w-5 text-white" />
                          </div>
                          <p className="font-medium">{group.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {group.categoryName
                          ? <Badge variant="secondary" className="text-xs">{group.categoryName}</Badge>
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{group.hsnCode || "—"}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">{group.gst}%</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">
                          {group.maxQty && group.maxQty > 0 ? group.maxQty : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {Number(group.hasDemoInstallation) === 1
                          ? <Badge variant="outline" className="text-xs">Yes</Badge>
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <PermissionGate module="item_groups" action="update">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(group)}
                              className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate module="item_groups" action="delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(group)}
                              className="h-8 w-8 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
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
              itemLabel="groups"
            />
          </Card>
        )}

        {/* Add / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
                  {dialogMode === "add"
                    ? <Plus className="h-4 w-4 text-white" />
                    : <Edit className="h-4 w-4 text-white" />}
                </div>
                {dialogMode === "add" ? "Add Item Group" : "Edit Item Group"}
              </DialogTitle>
              <DialogDescription>
                {dialogMode === "add"
                  ? "Create a new item group for inventory categorization"
                  : <><span>Update details for </span><strong>{editingGroup?.name}</strong></>}
              </DialogDescription>
            </DialogHeader>

            <ItemGroupFormFields
              values={formValues}
              onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
              onSubmit={handleSubmit}
              onCancel={() => handleDialogClose(false)}
              error={formError}
              isSubmitting={isSubmitting}
              mode={dialogMode}
              categories={categories}
              combineGroupOptions={groupNames
                .filter((n) => !editingGroup || n !== editingGroup.name)}
              onCategoryAdded={(cat) => setCategories((prev) => [cat, ...prev])}
            />
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will{" "}
                <strong className="text-red-600">permanently delete</strong>{" "}
                <strong>{groupToDelete?.name}</strong> from the inventory.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  )
}
