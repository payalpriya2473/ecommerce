"use client"

import { API_BASE_URL } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Upload, X } from "lucide-react"
import { useRef, useState } from "react"

export interface BrandFormValues {
  name: string
  iconUrl?: string        // existing icon (from DB)
  iconFile?: File | null  // new file to upload
}

export const EMPTY_BRAND_FORM: BrandFormValues = {
  name: "",
  iconUrl: "",
  iconFile: null,
}

function toBrandIconUrl(url?: string | null) {
  if (!url) return ""
  if (/^https?:\/\//i.test(url)) return url
  const assetBaseUrl = API_BASE_URL.replace(/\/api\/?$/, "")
  return `${assetBaseUrl}${url.startsWith("/") ? url : `/${url}`}`
}

export function brandToFormValues(brand: { name: string; iconUrl?: string }): BrandFormValues {
  return {
    name: brand.name,
    iconUrl: toBrandIconUrl(brand.iconUrl),
    iconFile: null,
  }
}

interface BrandFormFieldsProps {
  values: BrandFormValues
  onChange: (updated: Partial<BrandFormValues>) => void
  onSubmit: () => void
  onCancel?: () => void
  error: string
  isSubmitting: boolean
  mode: "add" | "edit"
}

export function BrandFormFields({
  values, onChange, onSubmit, onCancel, error, isSubmitting, mode,
}: BrandFormFieldsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (file) {
      const url = URL.createObjectURL(file)
      setPreview(url)
      onChange({ iconFile: file })
    }
  }

  const handleRemoveFile = () => {
    setPreview(null)
    onChange({ iconFile: null, iconUrl: "" })
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const displayImage = preview || values.iconUrl

  return (
    <div className="space-y-4 pt-2">
      {/* Brand Name */}
      <div className="space-y-2">
        <Label htmlFor="brand-name">
          Brand Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="brand-name"
          value={values.name}
          onChange={e => onChange({ name: e.target.value })}
          onKeyDown={e => e.key === "Enter" && onSubmit()}
          autoFocus
        />
      </div>

      {/* Brand Icon Upload */}
      <div className="space-y-2">
        <Label>Brand Icon</Label>

        {displayImage ? (
          <div className="flex items-center gap-4 p-3 border rounded-lg bg-muted/30">
            <img
              src={displayImage}
              alt="Brand icon preview"
              className="h-16 w-16 object-contain rounded-md border bg-white p-1"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {values.iconFile ? values.iconFile.name : "Current icon"}
              </p>
              <p className="text-xs text-muted-foreground">
                {values.iconFile
                  ? `${(values.iconFile.size / 1024).toFixed(1)} KB`
                  : "Saved icon"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleRemoveFile}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-accent transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Click to upload brand icon</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG up to 2MB</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {!displayImage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Choose Image
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
        >
          {isSubmitting
            ? (mode === "add" ? "Adding..." : "Saving...")
            : (mode === "add" ? "Add Brand" : "Save Changes")}
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="flex-1">
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
