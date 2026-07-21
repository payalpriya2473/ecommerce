"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertCircle, Plus } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { categoryAPI } from "@/lib/api"
import type { Category } from "@/lib/api"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ItemGroupFormValues {
  name: string
  categoryId: string
  combineGroup: string
  hsnCode: string
  gst: string
  hasDemoInstallation: boolean
  buyBackValue: string
  maxQty: string
}

export const EMPTY_ITEM_GROUP_FORM: ItemGroupFormValues = {
  name: "",
  categoryId: "",
  combineGroup: "",
  hsnCode: "",
  gst: "",
  hasDemoInstallation: false,
  buyBackValue: "",
  maxQty: "",
}

export function itemGroupToFormValues(group: {
  name: string
  categoryId?: string
  combineGroup?: string
  hsnCode?: string
  gst: number
  hasDemoInstallation: boolean
  buyBackValue?: number
  maxQty?: number
}): ItemGroupFormValues {
  return {
    name:                group.name,
    categoryId:          group.categoryId || "",
    combineGroup:        group.combineGroup || "",
    hsnCode:             group.hsnCode || "",
    gst:                 group.gst.toString(),
    hasDemoInstallation: group.hasDemoInstallation,
    buyBackValue:        group.buyBackValue != null ? group.buyBackValue.toString() : "",
    // treat 0 as blank — maxQty is optional
    maxQty: group.maxQty != null ? String(group.maxQty) : "",
  }
}

const NO_SPINNER_CLASS =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

// ─────────────────────────────────────────────────────────────
// Add Category Mini Modal
// ─────────────────────────────────────────────────────────────

function AddCategoryModal({
  open, onClose, onAdded, companyId,
}: {
  open: boolean
  onClose: () => void
  onAdded: (cat: Category) => void
  companyId?: string
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
      if (companyId) payload.companyId = companyId
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
            <Label htmlFor="igff-cat-name">
              Category Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="igff-cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="igff-cat-margin">
              Margin (%) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="igff-cat-margin"
              type="number"
              value={marginPercent}
              onChange={(e) => setMarginPercent(e.target.value)}
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
            <Button onClick={handleSubmit} disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
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
// Main ItemGroupFormFields
// ─────────────────────────────────────────────────────────────

interface ItemGroupFormFieldsProps {
  values: ItemGroupFormValues
  onChange: (updated: Partial<ItemGroupFormValues>) => void
  onSubmit: () => void
  onCancel?: () => void
  error: string
  isSubmitting: boolean
  mode: "add" | "edit"
  categories: Category[]
  combineGroupOptions?: string[]
  companyId?: string
  onCategoryAdded?: (category: Category) => void
}

export function ItemGroupFormFields({
  values,
  onChange,
  onSubmit,
  onCancel,
  error,
  isSubmitting,
  mode,
  categories: categoriesProp,
  combineGroupOptions = [],
  companyId,
  onCategoryAdded,
}: ItemGroupFormFieldsProps) {
  const [localCats, setLocalCats] = useState<Category[]>([])
  const [addCatOpen, setAddCatOpen] = useState(false)

  // Merge locally-added with parent list
  const mergedCategories = [
    ...localCats.filter((lc) => !categoriesProp.find((pc) => pc.id === lc.id)),
    ...categoriesProp,
  ]

  const uniqueCombineOptions = Array.from(new Set(combineGroupOptions.filter(Boolean)))

  const handleCategoryAdded = (cat: Category) => {
    setLocalCats((prev) => [cat, ...prev])
    onChange({ categoryId: cat.id })
    onCategoryAdded?.(cat)
  }

  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault()
  }
  const handleNumberWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur()
  }

  return (
    <>
      <div className="space-y-4 pt-2">

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="ig-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="ig-name"
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
            autoFocus
          />
        </div>

        {/* Category + Add New button */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>
              Category <span className="text-destructive">*</span>
            </Label>
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
            <SelectTrigger className="w-full h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mergedCategories.length === 0
                ? <div className="p-2 text-sm text-muted-foreground">No categories. Click "+ Add New".</div>
                : mergedCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
            </SelectContent>
          </Select>
        </div>

        {/* Combine Group */}
        <div className="space-y-2">
          <Label htmlFor="ig-combine">Combine Group</Label>
          <Select
            value={values.combineGroup || "__none__"}
            onValueChange={(v) => onChange({ combineGroup: v === "__none__" ? "" : v })}
          >
            <SelectTrigger id="ig-combine" className="w-full h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {uniqueCombineOptions.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* HSN Code + GST */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ig-hsn">
              HSN Code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ig-hsn"
              value={values.hsnCode}
              onChange={(e) => onChange({ hsnCode: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ig-gst">
              GST (%) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ig-gst"
              type="number"
              value={values.gst}
              onChange={(e) => onChange({ gst: e.target.value })}
              step="0.01"
              min="0"
              className={NO_SPINNER_CLASS}
              onKeyDown={handleNumberKeyDown}
              onWheel={handleNumberWheel}
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
          <Label htmlFor="ig-demo" className="cursor-pointer font-semibold text-sm">
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
              step="0.01"
              min="0"
              className={NO_SPINNER_CLASS}
              onKeyDown={handleNumberKeyDown}
              onWheel={handleNumberWheel}
            />
          </div>
          <div className="space-y-2">
            {/* ✅ FIX: Max Qty is OPTIONAL — no asterisk */}
            <Label htmlFor="ig-maxqty">
              Max Qty{" "}
              <span className="text-muted-foreground text-xs font-normal">(optional)</span>
            </Label>
            <Input
              id="ig-maxqty"
              type="number"
              value={values.maxQty}
              onChange={(e) => onChange({ maxQty: e.target.value })}
              min="0"
              className={NO_SPINNER_CLASS}
              onKeyDown={handleNumberKeyDown}
              onWheel={handleNumberWheel}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
          >
            {isSubmitting
              ? (mode === "add" ? "Adding..." : "Saving...")
              : (mode === "add" ? "Add Item Group" : "Save Changes")}
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="flex-1">
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Add Category Modal */}
      <AddCategoryModal
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        onAdded={handleCategoryAdded}
        companyId={companyId}
      />
    </>
  )
}
