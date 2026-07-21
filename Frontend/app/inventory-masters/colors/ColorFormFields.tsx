"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { Brand } from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface ColorFormValues {
  brandId: string;
  colorName: string;
}

export const EMPTY_COLOR_FORM: ColorFormValues = {
  brandId: "",
  colorName: "",
};

// ─────────────────────────────────────────────────────────────
// Field Label helper
// ─────────────────────────────────────────────────────────────
function FL({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <Label htmlFor={htmlFor} className="font-semibold text-sm text-foreground">
      {children}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────
interface ColorFormFieldsProps {
  values: ColorFormValues;
  onChange: (updated: Partial<ColorFormValues>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  error: string;
  isSubmitting: boolean;
  mode: "add" | "edit";
  brands: Brand[];
}

// ─────────────────────────────────────────────────────────────
// Main Form Component
// ─────────────────────────────────────────────────────────────
export function ColorFormFields({
  values,
  onChange,
  onSubmit,
  onCancel,
  error,
  isSubmitting,
  mode,
  brands,
}: ColorFormFieldsProps) {
  const set = (field: keyof ColorFormValues, value: string) =>
    onChange({ [field]: value });

  return (
    <div className="space-y-6">
      {/* Brand Selection */}
      <div className="space-y-2">
        <FL required>Brand Name</FL>
        <Select value={values.brandId} onValueChange={(v) => set("brandId", v)}>
          <SelectTrigger className="bg-background w-full h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {brands.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">
                No brands available. Please add a brand first.
              </div>
            ) : (
              brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Color Name */}
      <div className="space-y-2">
        <FL htmlFor="colorName" required>
          Color Name
        </FL>
        <Input
          id="colorName"
          value={values.colorName}
          onChange={(e) => set("colorName", e.target.value)}
          className="bg-background"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
        >
          {isSubmitting
            ? "Saving..."
            : mode === "add"
              ? "Add Color"
              : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => (onCancel ? onCancel() : window.history.back())}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
