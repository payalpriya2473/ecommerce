"use client";
// components/masters/VariantColorEditor.tsx
// Drop-in replacement / addition to ItemFormFields.
// Handles the new variant+color+image system.

import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, ImagePlus, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

export interface ColorEntry {
  id?: string;
  colorName: string;
  colorCode: string;
  sortOrder?: number;
  // existing saved images
  images?: ColorImage[];
  // new files to upload
  newFiles?: File[];
  // ids of existing images to delete
  deleteImageIds?: string[];
}

export interface ColorImage {
  id: string;
  imageUrl: string;
  sortOrder?: number;
}

export interface VariantEntry {
  id?: string;
  variantLabel: string;
  offerPrice: string;
  nlc: string;
  margin: string;
  incentive: string;
  maxMOPPercent: string;
  maxMOPAmount: string;
  openingStock: string;
  minimumQty: string;
  stockValue: string;
  colors: ColorEntry[];
  // existing saved images (no color)
  images?: ColorImage[];
  // new files to upload (no color)
  newFiles?: File[];
  deleteImageIds?: string[];
  open?: boolean;
}

export const EMPTY_COLOR: ColorEntry = {
  colorName: "",
  colorCode: "#000000",
  newFiles: [],
  deleteImageIds: [],
};

export const EMPTY_VARIANT: VariantEntry = {
  variantLabel: "",
  offerPrice: "",
  nlc: "",
  margin: "",
  incentive: "",
  maxMOPPercent: "",
  maxMOPAmount: "",
  openingStock: "",
  minimumQty: "",
  stockValue: "",
  colors: [],
  newFiles: [],
  deleteImageIds: [],
  open: true,
};

// ─── Build FormData for save ──────────────────────────────────

export function buildVariantFormData(
  itemName: string,
  companyId: string,
  itemGroupId: string,
  brandId: string,
  variants: VariantEntry[]
): FormData {
  const fd = new FormData();
  fd.append("itemName", itemName);
  if (companyId) fd.append("companyId", companyId);
  if (itemGroupId) fd.append("itemGroupId", itemGroupId);
  if (brandId) fd.append("brandId", brandId);

  const variantsJson = variants.map((v, vi) => ({
    id: v.id,
    variantLabel: v.variantLabel,
    offerPrice: parseFloat(v.offerPrice) || 0,
    nlc: parseFloat(v.nlc) || 0,
    margin: parseFloat(v.margin) || 0,
    incentive: parseFloat(v.incentive) || 0,
    maxMOPPercent: parseFloat(v.maxMOPPercent) || 0,
    maxMOPAmount: parseFloat(v.maxMOPAmount) || 0,
    openingStock: parseFloat(v.openingStock) || 0,
    minimumQty: parseFloat(v.minimumQty) || 0,
    stockValue: parseFloat(v.stockValue) || 0,
    deleteImageIds: v.deleteImageIds || [],
    colors: (v.colors || []).map((c, ci) => ({
      id: c.id,
      colorName: c.colorName,
      colorCode: c.colorCode,
      deleteImageIds: c.deleteImageIds || [],
    })),
  }));
  fd.append("variants", JSON.stringify(variantsJson));

  // Attach image files
  variants.forEach((v, vi) => {
    (v.newFiles || []).forEach((f) => fd.append(`variantImages_${vi}`, f));
    (v.colors || []).forEach((c, ci) => {
      (c.newFiles || []).forEach((f) => fd.append(`colorImages_${vi}_${ci}`, f));
    });
  });

  return fd;
}

// ─── Sub-components ───────────────────────────────────────────

function NumInput({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-gray-600">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 text-sm"
        onWheel={(e) => e.currentTarget.blur()}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
        }}
      />
    </div>
  );
}

function ColorRow({
  color,
  variantIdx,
  colorIdx,
  onChange,
  onRemove,
}: {
  color: ColorEntry;
  variantIdx: number;
  colorIdx: number;
  onChange: (updated: Partial<ColorEntry>) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    onChange({ newFiles: [...(color.newFiles || []), ...files] });
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeNewFile = (idx: number) => {
    const updated = [...(color.newFiles || [])];
    updated.splice(idx, 1);
    onChange({ newFiles: updated });
  };

  const removeExistingImage = (imgId: string) => {
    onChange({
      images: (color.images || []).filter((i) => i.id !== imgId),
      deleteImageIds: [...(color.deleteImageIds || []), imgId],
    });
  };

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3">
      <div className="flex items-center gap-3">
        {/* Color swatch */}
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={color.colorCode}
            onChange={(e) => onChange({ colorCode: e.target.value })}
            className="w-10 h-10 rounded-full border-2 border-gray-300 cursor-pointer p-0.5"
            title="Pick color"
          />
        </div>

        <div className="flex-1 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">Color Name</Label>
            <Input
              value={color.colorName}
              onChange={(e) => onChange({ colorName: e.target.value })}
              placeholder="e.g. Midnight Black"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-gray-600">Hex Code</Label>
            <Input
              value={color.colorCode}
              onChange={(e) => onChange({ colorCode: e.target.value })}
              placeholder="#1C1C1E"
              className="h-9 text-sm font-mono"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-9 w-9 text-red-500 hover:bg-red-50 flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Color Images */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-gray-500">
          Images for this color{" "}
          <span className="font-normal">(optional)</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {/* Existing saved images */}
          {(color.images || []).map((img) => (
            <div
              key={img.id}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.imageUrl} alt="color img" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeExistingImage(img.id)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {/* New file previews */}
          {(color.newFiles || []).map((f, fi) => (
            <div
              key={fi}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-blue-300 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(f)}
                alt="new"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeNewFile(fi)}
                className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {/* Add button */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-red-400 hover:text-red-500 transition-colors"
          >
            <ImagePlus className="h-4 w-4" />
            <span className="text-[9px] mt-0.5">Add</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </div>
    </div>
  );
}

function VariantCard({
  variant,
  index,
  onChange,
  onRemove,
}: {
  variant: VariantEntry;
  index: number;
  onChange: (updated: Partial<VariantEntry>) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const updateColor = (ci: number, updated: Partial<ColorEntry>) => {
    const colors = [...(variant.colors || [])];
    colors[ci] = { ...colors[ci], ...updated };
    onChange({ colors });
  };

  const removeColor = (ci: number) => {
    const colors = [...(variant.colors || [])];
    colors.splice(ci, 1);
    onChange({ colors });
  };

  const addColor = () => {
    onChange({ colors: [...(variant.colors || []), { ...EMPTY_COLOR }] });
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    onChange({ newFiles: [...(variant.newFiles || []), ...files] });
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeNewFile = (fi: number) => {
    const updated = [...(variant.newFiles || [])];
    updated.splice(fi, 1);
    onChange({ newFiles: updated });
  };

  const removeExistingImage = (imgId: string) => {
    onChange({
      images: (variant.images || []).filter((i) => i.id !== imgId),
      deleteImageIds: [...(variant.deleteImageIds || []), imgId],
    });
  };

  const open = variant.open !== false;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-red-700 text-white cursor-pointer select-none"
        onClick={() => onChange({ open: !open })}
      >
        <div className="flex items-center gap-2 font-semibold text-sm">
          <span className="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-xs">
            {index + 1}
          </span>
          {variant.variantLabel || `Variant ${index + 1}`}
          {variant.offerPrice && (
            <span className="ml-2 text-white/70 font-normal">
              ₹{parseFloat(variant.offerPrice).toLocaleString("en-IN")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-5">
          {/* Variant Label */}
          <div className="space-y-1">
            <Label className="text-sm font-semibold">
              Storage / Size Label <span className="text-red-500">*</span>
            </Label>
            <Input
              value={variant.variantLabel}
              onChange={(e) => onChange({ variantLabel: e.target.value })}
              placeholder="e.g. 256GB, 512GB, 8GB RAM"
              className="max-w-xs"
            />
          </div>

          {/* Pricing */}
          <div>
            <p className="text-sm font-semibold mb-2 text-gray-700">Pricing</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <NumInput label="Offer Price (₹)" value={variant.offerPrice} onChange={(v) => onChange({ offerPrice: v })} />
              <NumInput label="NLC (₹)" value={variant.nlc} onChange={(v) => onChange({ nlc: v })} />
              <NumInput label="Margin %" value={variant.margin} onChange={(v) => onChange({ margin: v })} />
              <NumInput label="Incentive %" value={variant.incentive} onChange={(v) => onChange({ incentive: v })} />
              <NumInput label="Max MOP %" value={variant.maxMOPPercent} onChange={(v) => onChange({ maxMOPPercent: v })} />
              <NumInput label="Max MOP Amt (₹)" value={variant.maxMOPAmount} onChange={(v) => onChange({ maxMOPAmount: v })} />
              <NumInput label="Opening Stock" value={variant.openingStock} onChange={(v) => onChange({ openingStock: v })} />
              <NumInput label="Min Qty" value={variant.minimumQty} onChange={(v) => onChange({ minimumQty: v })} />
              <NumInput label="Stock Value (₹)" value={variant.stockValue} onChange={(v) => onChange({ stockValue: v })} />
            </div>
          </div>

          {/* Variant-level images (no color) */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">
              General Images{" "}
              <span className="text-xs font-normal text-gray-400">
                (shown when no color selected)
              </span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {(variant.images || []).map((img) => (
                <div key={img.id} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeExistingImage(img.id)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {(variant.newFiles || []).map((f, fi) => (
                <div key={fi} className="relative w-20 h-20 rounded-lg overflow-hidden border border-blue-300 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeNewFile(fi)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-red-400 hover:text-red-500 transition-colors"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px] mt-1">Add</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleFiles} />
          </div>

          {/* Colors */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-gray-700">Colors</Label>
              <Button
                type="button"
                size="sm"
                onClick={addColor}
                className="border border-red-700 text-red-700 hover:bg-red-50 bg-transparent h-7 px-3 text-xs gap-1"
              >
                <Plus className="h-3 w-3" /> Add Color
              </Button>
            </div>
            {(variant.colors || []).length === 0 && (
              <p className="text-xs text-gray-400 italic">
                No colors added. Add colors if this variant comes in multiple colors.
              </p>
            )}
            {(variant.colors || []).map((c, ci) => (
              <ColorRow
                key={ci}
                color={c}
                variantIdx={index}
                colorIdx={ci}
                onChange={(u) => updateColor(ci, u)}
                onRemove={() => removeColor(ci)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────

interface VariantColorEditorProps {
  variants: VariantEntry[];
  onChange: (variants: VariantEntry[]) => void;
}

export function VariantColorEditor({ variants, onChange }: VariantColorEditorProps) {
  const addVariant = () => onChange([...variants, { ...EMPTY_VARIANT, colors: [] }]);

  const updateVariant = (vi: number, updated: Partial<VariantEntry>) => {
    const next = variants.map((v, i) => (i === vi ? { ...v, ...updated } : v));
    onChange(next);
  };

  const removeVariant = (vi: number) => {
    if (variants.length <= 1) return;
    onChange(variants.filter((_, i) => i !== vi));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="font-semibold text-lg">Storage Variants & Colors</h3>
        <Button
          type="button"
          size="sm"
          onClick={addVariant}
          className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-3 text-xs gap-1 bg-transparent"
        >
          <Plus className="h-3.5 w-3.5" /> Add Storage Variant
        </Button>
      </div>

      {variants.length === 0 && (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-xl">
          <p className="text-sm">No variants yet. Click "Add Storage Variant" to start.</p>
        </div>
      )}

      {variants.map((v, vi) => (
        <VariantCard
          key={vi}
          variant={v}
          index={vi}
          onChange={(u) => updateVariant(vi, u)}
          onRemove={() => removeVariant(vi)}
        />
      ))}
    </div>
  );
}