"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Plus,
  ImagePlus,
  Trash2,
  Palette,
  ChevronDown,
  ChevronUp,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  RemoveFormatting,
  Undo2,
  Redo2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brandAPI, itemGroupAPI, categoryAPI } from "@/lib/api";
import type { Brand, ItemGroup, Category } from "@/lib/api";

import {
  BrandFormFields,
  EMPTY_BRAND_FORM,
} from "@/components/masters/BrandFormFields";
import type { BrandFormValues } from "@/components/masters/BrandFormFields";

import {
  ItemGroupFormFields,
  EMPTY_ITEM_GROUP_FORM,
} from "@/components/masters/ItemGroupFormFields";
import type { ItemGroupFormValues } from "@/components/masters/ItemGroupFormFields";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ItemImageEntry {
  file?: File;
  previewUrl: string;
  id?: string;
  imageUrl?: string;
  toDelete?: boolean;
}

export interface VariantColorEntry {
  id?: string;
  colorName: string;
  colorHex: string;
  images: ItemImageEntry[];
  deleteImageIds?: string[];
}

export const EMPTY_COLOR: VariantColorEntry = {
  colorName: "",
  colorHex: "",
  images: [],
  deleteImageIds: [],
};

export interface ItemVariantRow {
  id?: string;
  variant: string;
  openingStock: string;
  minimumQty: string;
  maxMOPPercent: string;
  offerPrice: string;
  stockValue: string;
  margin: string;
  incentive: string;
  maxMOPAmount: string;
  nlc: string;
}

export const EMPTY_VARIANT_ROW: ItemVariantRow = {
  variant: "",
  openingStock: "",
  minimumQty: "",
  maxMOPPercent: "",
  offerPrice: "",
  stockValue: "",
  margin: "",
  incentive: "",
  maxMOPAmount: "",
  nlc: "",
};

export interface ItemFormValues {
  itemGroupId: string;
  brandId: string;
  itemName: string;
  uom: string;
  hsnCode: string;
  gst: string;
  hasDemoInstallation: boolean;
  isActive: boolean;
  description: string;
  freeService: string;
  billPrintNote: string;
  warranty: string;
  colors: VariantColorEntry[];
  variants: ItemVariantRow[];
}

export const EMPTY_ITEM_FORM: ItemFormValues = {
  itemGroupId: "",
  brandId: "",
  itemName: "",
  uom: "Pcs",
  hsnCode: "",
  gst: "",
  hasDemoInstallation: false,
  isActive: true,
  description: "",
  freeService: "",
  billPrintNote: "",
  warranty: "",
  colors: [{ ...EMPTY_COLOR }],
  variants: [{ ...EMPTY_VARIANT_ROW }],
};

const DEFAULT_UOM_OPTIONS = [
  "Pcs", "Kg", "Ltr", "Box", "Set", "Meter", "Sq.Ft", "Ton", "Unit",
];

const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const CELL =
  `w-full h-12 rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 ${NO_SPINNER}`;

const MAX_IMAGE_DIMENSION = 1600;
const MAX_IMAGE_BYTES_BEFORE_OPTIMIZE = 900 * 1024;
const TARGET_IMAGE_QUALITY = 0.82;

// ─────────────────────────────────────────────────────────────
// Helpers
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

export function toWholeNumberString(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return String(Math.trunc(parsed));
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error(`Could not read image: ${file.name}`));
    };
    image.src = imageUrl;
  });
}

async function optimizeImageFile(file: File): Promise<File> {
  const shouldResize = file.size > MAX_IMAGE_BYTES_BEFORE_OPTIMIZE;
  if (!shouldResize) return file;

  const image = await loadImageElement(file);
  const ratio = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.width, image.height),
  );
  const outputWidth = Math.max(1, Math.round(image.width * ratio));
  const outputHeight = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", TARGET_IMAGE_QUALITY),
  );

  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, {
    type: "image/webp",
    lastModified: Date.now(),
  });
}

function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== value) {
      editor.innerHTML = value || "";
    }
  }, [value]);

  const emitChange = () => {
    const editor = editorRef.current;
    if (!editor) return;
    onChange(editor.innerHTML);
  };

  const exec = (command: string, arg?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, arg);
    emitChange();
  };

  const handleLink = () => {
    const url = window.prompt("Enter link URL");
    if (!url) return;
    exec("createLink", url);
  };

  const toolbarButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-2">
        <button type="button" className={toolbarButtonClass} onClick={() => exec("bold")} title="Bold" aria-label="Bold">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => exec("italic")} title="Italic" aria-label="Italic">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => exec("underline")} title="Underline" aria-label="Underline">
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => exec("strikeThrough")} title="Strikethrough" aria-label="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={toolbarButtonClass} onClick={() => exec("insertUnorderedList")} title="Bullet list" aria-label="Bullet list">
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => exec("insertOrderedList")} title="Numbered list" aria-label="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={handleLink} title="Insert link" aria-label="Insert link">
          <Link2 className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => exec("removeFormat")} title="Clear formatting" aria-label="Clear formatting">
          <RemoveFormatting className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button type="button" className={toolbarButtonClass} onClick={() => exec("undo")} title="Undo" aria-label="Undo">
          <Undo2 className="h-4 w-4" />
        </button>
        <button type="button" className={toolbarButtonClass} onClick={() => exec("redo")} title="Redo" aria-label="Redo">
          <Redo2 className="h-4 w-4" />
        </button>
      </div>
      <div className="relative">
        {!value && !isFocused && (
          <div className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
            {placeholder ?? "Write product description..."}
          </div>
        )}
        <div
          id={id}
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className="min-h-[220px] rounded-lg border border-border bg-background px-3 py-3 text-sm leading-7 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          style={{ whiteSpace: "pre-wrap" }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UOM quick-add modal
// ─────────────────────────────────────────────────────────────
function UomModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (uom: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const handleSubmit = () => {
    if (!value.trim()) { setError("UOM name is required"); return; }
    onAdd(value.trim());
    setValue(""); setError(""); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setValue(""); setError(""); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add UOM</DialogTitle>
          <DialogDescription>Add a custom unit of measurement</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="uom-name">UOM Name</Label>
            <Input id="uom-name" value={value} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }} autoFocus />
          </div>
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="flex gap-3 pt-1">
            <Button onClick={handleSubmit} className="flex-1 bg-red-700 hover:bg-red-800 text-white">Add UOM</Button>
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Color Images Upload
// ─────────────────────────────────────────────────────────────
function ColorImagesUpload({ images, onChange }: { images: ItemImageEntry[]; onChange: (images: ItemImageEntry[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const visible = images.filter((i) => !i.toDelete);
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/jpg", "image/webp"]);

  const appendFiles = async (incomingFiles: File[]) => {
    const remainingSlots = Math.max(0, 10 - visible.length);
    if (!incomingFiles.length || remainingSlots <= 0) return;

    const files = incomingFiles
      .filter((file) => allowedTypes.has(file.type))
      .slice(0, remainingSlots);

    if (!files.length) return;
    setIsOptimizing(true);
    const optimizedFiles = await Promise.all(
      files.map(async (file) => {
        try {
          return await optimizeImageFile(file);
        } catch {
          return file;
        }
      }),
    );
    setIsOptimizing(false);

    const entries: ItemImageEntry[] = optimizedFiles.map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }));
    onChange([...images, ...entries]);
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await appendFiles(files);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (visible.length >= 10) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    await appendFiles(Array.from(e.dataTransfer.files || []));
  };

  const remove = (index: number) => {
    const updated = [...images];
    const entry = updated[index];
    if (entry.file && entry.previewUrl.startsWith("blob:")) URL.revokeObjectURL(entry.previewUrl);
    if (entry.id) {
      updated[index] = { ...entry, toDelete: true };
    } else {
      updated.splice(index, 1);
    }
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/jpg,image/webp" multiple className="hidden" onChange={handleFiles} />
      <div
        className={`rounded-2xl border border-dashed p-4 transition-colors ${
          isDragOver
            ? "border-red-400 bg-red-50/80"
            : "border-border bg-white"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Drag and drop multiple images here, or click Add to browse.
          </p>
          <p className="text-xs text-muted-foreground">
            {visible.length}/10 images
          </p>
        </div>
        {isOptimizing && (
          <p className="mb-3 text-xs text-muted-foreground">
            Optimizing images before upload...
          </p>
        )}

        <div className="flex flex-wrap gap-3">
        {images.map((img, idx) => {
          if (img.toDelete) return null;
          return (
            <div key={idx} className="relative group rounded-lg overflow-hidden border border-border bg-muted w-20 h-20 sm:w-24 sm:h-24">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.previewUrl} alt={`Color image ${idx + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button type="button" variant="destructive" size="icon" className="h-7 w-7" onClick={() => remove(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">{idx + 1}</div>
            </div>
          );
        })}
        {visible.length < 10 && (
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}
            className="h-20 w-20 sm:h-24 sm:w-24 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-1.5 rounded-lg p-2">
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground leading-none">Add</span>
          </Button>
        )}
        </div>
      </div>
      {visible.length >= 10 && <p className="text-xs text-muted-foreground">Maximum of 10 images reached.</p>}
      <p className="text-xs text-muted-foreground">
        Large images are automatically optimized before upload to reduce save failures.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Color Row
// ─────────────────────────────────────────────────────────────
function ColorRow({
  color, colorIndex, canDelete, onChange, onDelete,
}: {
  color: VariantColorEntry;
  colorIndex: number;
  canDelete: boolean;
  onChange: (updated: VariantColorEntry) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(colorIndex === 0);
  const imageCount = color.images.filter((i) => !i.toDelete).length;
  const previewImage = color.images.find((img) => !img.toDelete)?.previewUrl;
  const handleImagesChange = (imgs: ItemImageEntry[]) => {
  const deleteImageIds = imgs
    .filter((img) => img.toDelete && img.id)
    .map((img) => img.id as string);
  onChange({ ...color, images: imgs, deleteImageIds });
};

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-3 text-left md:flex-1">
          <div className="relative h-16 w-16 flex-shrink-0 rounded-xl border border-slate-300 bg-white p-1 shadow-sm">
            <div className="h-full w-full overflow-hidden rounded-full border border-black/10 bg-slate-100">
              {previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImage} alt={color.colorName || `Color ${colorIndex + 1}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Input value={color.colorName} onChange={(e) => onChange({ ...color, colorName: e.target.value })}
              placeholder="Color name (e.g. Deep Blue)" className="h-10 border-slate-200 bg-white text-sm"
              onClick={(e) => e.stopPropagation()} />
            <p className="mt-2 text-xs text-muted-foreground">The first uploaded image will be used as the color preview.</p>
          </div>
        </button>

        <div className="flex items-center gap-2 md:self-start">
          <Badge variant="outline" className="h-9 rounded-xl px-3 text-xs">{imageCount} img</Badge>
          <button type="button" onClick={() => setExpanded((e) => !e)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-muted-foreground transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {canDelete && (
            <button type="button" onClick={onDelete}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-slate-50/70 p-4">
          <ColorImagesUpload images={color.images} onChange={handleImagesChange} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Product Colors Panel
// ─────────────────────────────────────────────────────────────
function ProductColorsPanel({ colors, onChange }: { colors: VariantColorEntry[]; onChange: (colors: VariantColorEntry[]) => void }) {
  const addColor = () => onChange([...colors, { ...EMPTY_COLOR, colorName: "", colorHex: "", images: [], deleteImageIds: [] }]);
  const updateColor = (idx: number, updated: VariantColorEntry) => onChange(colors.map((c, i) => (i === idx ? updated : c)));
  const removeColor = (idx: number) => { if (colors.length <= 1) return; onChange(colors.filter((_, i) => i !== idx)); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-lg">Product Colors &amp; Images</h3>
        </div>
        <Button type="button" size="sm" onClick={addColor}
          className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent">
          <Plus className="h-3.5 w-3.5" /> Add Color
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Define each color once and upload its images once. Every variant below will share these same product colors.
      </p>
      <div className="space-y-2">
        {colors.map((color, idx) => (
          <ColorRow key={color.id || idx} color={color} colorIndex={idx} canDelete={colors.length > 1}
            onChange={(updated) => updateColor(idx, updated)} onDelete={() => removeColor(idx)} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Variants Table
// ─────────────────────────────────────────────────────────────
const VARIANT_NUM_FIELDS: Array<keyof Omit<ItemVariantRow, "variant" | "id">> = [
  "openingStock", "minimumQty", "maxMOPPercent", "offerPrice",
  "stockValue", "margin", "incentive", "maxMOPAmount", "nlc",
];

function VariantsTable({ variants, onChange }: { variants: ItemVariantRow[]; onChange: (variants: ItemVariantRow[]) => void }) {
  const noSpin = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();
  const noArrow = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault(); };

  const update = (index: number, field: keyof ItemVariantRow, value: string) =>
    onChange(variants.map((row, i) => (i !== index ? row : { ...row, [field]: value })));

  const headers = [
    { label: "#", width: "48px" }, { label: "Variant", width: "170px" },
    { label: "Opening Stock", width: "125px" }, { label: "Min Qty", width: "105px" },
    { label: "Max MOP %", width: "110px" }, { label: "Offer Price", width: "115px" },
    { label: "Stock Value", width: "115px" }, { label: "Margin %", width: "105px" },
    { label: "Incentive %", width: "110px" }, { label: "Max MOP Amt", width: "125px" },
    { label: "NLC", width: "105px" }, { label: "", width: "52px" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="font-semibold text-lg">Variants &amp; Pricing</h3>
        <Button type="button" size="sm" onClick={() => onChange([...variants, { ...EMPTY_VARIANT_ROW }])}
          className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-3 text-xs gap-1 bg-transparent">
          <Plus className="h-3.5 w-3.5" /> Add Variant
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <table className="w-full border-collapse text-sm" style={{ minWidth: "1240px" }}>
          <thead>
            <tr className="bg-red-700 text-white">
              {headers.map((h) => (
                <th key={h.label} style={{ width: h.width, minWidth: h.width }}
                  className="border border-red-600 px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap">{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((row, index) => (
              <tr key={`row-${index}`} className="bg-white hover:bg-gray-50 transition-colors">
                <td className="border border-gray-200 px-3 py-1 text-center text-sm text-muted-foreground font-medium">{index + 1}</td>
                <td className="border border-gray-200 p-0">
                  <Input value={row.variant} onChange={(e) => update(index, "variant", e.target.value)} placeholder="e.g. 1TB" className={CELL} />
                </td>
                {VARIANT_NUM_FIELDS.map((field) => (
                  <td key={field} className="border border-gray-200 p-0">
                    <Input type="number" value={(row as any)[field]}
                      onChange={(e) => update(index, field as keyof ItemVariantRow, e.target.value)}
                      step="0.01" min="0" className={CELL} onWheel={noSpin} onKeyDown={noArrow} />
                  </td>
                ))}
                <td className="border border-gray-200 px-2 py-1 text-center">
                  <Button type="button" variant="ghost" size="sm" onClick={() => onChange(variants.filter((_, i) => i !== index))}
                    disabled={variants.length === 1}
                    className="h-8 w-8 p-0 text-red-600 disabled:text-muted-foreground hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Palette className="h-3.5 w-3.5" />
        Variants only control pricing and stock values. Product colors and images are shared across every variant.
      </p>
    </div>
  );
}

interface ItemFormFieldsProps {
  values: ItemFormValues;
  onChange: (updated: Partial<ItemFormValues>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  error: string;
  isSubmitting: boolean;
  mode: "add" | "edit";
  companyId?: string;
  initialBrands?: Brand[];
  initialItemGroups?: ItemGroup[];
}

// ─────────────────────────────────────────────────────────────
// Main ItemFormFields
// ─────────────────────────────────────────────────────────────
export function ItemFormFields({
  values, onChange, onSubmit, onCancel, error, isSubmitting, mode, companyId,
  initialBrands, initialItemGroups,
}: ItemFormFieldsProps) {
  const normalizeItemGroup = (group: any): ItemGroup => ({ ...group, id: group?.id || group?._id || "" });

  const [brands, setBrands] = useState<Brand[]>(initialBrands ?? []);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>(initialItemGroups ?? []);
  const [uomOptions, setUomOptions] = useState<string[]>(DEFAULT_UOM_OPTIONS);

  const [igModalOpen, setIgModalOpen] = useState(false);
  const [igFormValues, setIgFormValues] = useState<ItemGroupFormValues>(EMPTY_ITEM_GROUP_FORM);
  const [igCategories, setIgCategories] = useState<Category[]>([]);
  const [igSubmitting, setIgSubmitting] = useState(false);
  const [igFormError, setIgFormError] = useState("");

  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandFormValues, setBrandFormValues] = useState<BrandFormValues>(EMPTY_BRAND_FORM);
  const [brandSubmitting, setBrandSubmitting] = useState(false);
  const [brandFormError, setBrandFormError] = useState("");

  const [uomModalOpen, setUomModalOpen] = useState(false);

  useEffect(() => { if (initialBrands) setBrands(initialBrands); }, [initialBrands]);
  useEffect(() => { if (initialItemGroups) setItemGroups(initialItemGroups); }, [initialItemGroups]);

  useEffect(() => {
    if (!Array.isArray(values.variants) || values.variants.length === 0) onChange({ variants: [{ ...EMPTY_VARIANT_ROW }] });
    if (!Array.isArray(values.colors) || values.colors.length === 0) onChange({ colors: [{ ...EMPTY_COLOR }] });
  }, []);

  useEffect(() => {
    if (values.uom && !DEFAULT_UOM_OPTIONS.includes(values.uom)) {
      setUomOptions((prev) => prev.includes(values.uom) ? prev : [...prev, values.uom]);
    }
  }, [values.uom]);

  const set = (field: keyof ItemFormValues, value: string | boolean) => onChange({ [field]: value });
  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault(); };
  const handleNumberWheel = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

  const openIgModal = async () => {
    const token = sessionStorage.getItem("authToken");
    if (token) { const res = await categoryAPI.getAll(token, companyId); if (res.success) setIgCategories(res.data); }
    setIgFormValues(EMPTY_ITEM_GROUP_FORM); setIgFormError(""); setIgModalOpen(true);
  };

  const handleIgSubmit = async () => {
    setIgFormError("");
    if (!igFormValues.name.trim()) { setIgFormError("Please enter item group name"); return; }
    if (!igFormValues.categoryId) { setIgFormError("Please select a category"); return; }
    if (!igFormValues.hsnCode.trim()) { setIgFormError("Please enter HSN code"); return; }
    if (igFormValues.gst === "" || parseFloat(igFormValues.gst) < 0) { setIgFormError("Please enter a valid GST rate"); return; }
    setIgSubmitting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const payload: any = {
        name: igFormValues.name.trim(), categoryId: igFormValues.categoryId,
        combineGroup: igFormValues.combineGroup.trim() || undefined,
        hsnCode: igFormValues.hsnCode.trim(), gst: parseFloat(igFormValues.gst),
        hasDemoInstallation: igFormValues.hasDemoInstallation,
        buyBackValue: igFormValues.buyBackValue ? parseFloat(igFormValues.buyBackValue) : undefined,
        maxQty: igFormValues.maxQty ? parseInt(igFormValues.maxQty) : 0,
      };
      if (companyId) payload.companyId = companyId;
      const res = await itemGroupAPI.register(payload, token);
      if (res.success) {
        const createdGroup = normalizeItemGroup(res.data);
        setItemGroups((prev) => [createdGroup, ...prev]);
        onChange({ itemGroupId: createdGroup.id, hsnCode: createdGroup.hsnCode || "", gst: createdGroup.gst !== undefined ? String(createdGroup.gst) : "" });
        setIgModalOpen(false);
      } else { setIgFormError(res.message || "Failed to add item group"); }
    } finally { setIgSubmitting(false); }
  };

  const handleBrandSubmit = async () => {
    setBrandFormError("");
    if (!brandFormValues.name.trim()) { setBrandFormError("Brand name is required"); return; }
    setBrandSubmitting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const payload: any = { name: brandFormValues.name.trim() };
      if (companyId) payload.companyId = companyId;
      const res = await brandAPI.register(payload, token);
      if (res.success) { setBrands((prev) => [res.data, ...prev]); onChange({ brandId: res.data.id }); setBrandModalOpen(false); }
      else { setBrandFormError(res.message || "Failed to add brand"); }
    } finally { setBrandSubmitting(false); }
  };

  const variants = Array.isArray(values.variants) && values.variants.length > 0 ? values.variants : [{ ...EMPTY_VARIANT_ROW }];
  const colors = Array.isArray(values.colors) && values.colors.length > 0 ? values.colors : [{ ...EMPTY_COLOR }];

  return (
    <>
      <div className="space-y-8">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
          <div className="space-y-2">
            <FL htmlFor="itemName" required>Item Name</FL>
            <Input id="itemName" value={values.itemName} onChange={(e) => set("itemName", e.target.value)} className="bg-background" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FL required>Item Group</FL>
                <Button type="button" size="sm" onClick={openIgModal}
                  className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent">
                  <Plus className="h-3.5 w-3.5" /> Add New
                </Button>
              </div>
              <Select value={values.itemGroupId} onValueChange={(v) => {
                const sg = itemGroups.find((g) => g.id === v);
                onChange({ itemGroupId: v, hsnCode: sg?.hsnCode || "", gst: sg?.gst !== undefined ? String(sg.gst) : "" });
              }}>
                <SelectTrigger className="bg-background w-full h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {itemGroups.length === 0 ? <div className="p-2 text-sm text-muted-foreground">No item groups. Click &quot;+ Add New&quot;.</div>
                    : itemGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FL required>Brand</FL>
                <Button type="button" size="sm" onClick={() => { setBrandFormValues(EMPTY_BRAND_FORM); setBrandFormError(""); setBrandModalOpen(true); }}
                  className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent">
                  <Plus className="h-3.5 w-3.5" /> Add New
                </Button>
              </div>
              <Select value={values.brandId} onValueChange={(v) => set("brandId", v)}>
                <SelectTrigger className="bg-background w-full h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {brands.length === 0 ? <div className="p-2 text-sm text-muted-foreground">No brands. Click &quot;+ Add New&quot;.</div>
                    : brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <div className="flex items-center justify-between min-h-[28px]">
                <FL required>UOM</FL>
                <Button type="button" size="sm" onClick={() => setUomModalOpen(true)}
                  className="border border-red-700 text-red-700 hover:bg-red-50 h-7 px-2 text-xs gap-1 bg-transparent">
                  <Plus className="h-3 w-3" /> Add New
                </Button>
              </div>
              <Select value={values.uom} onValueChange={(v) => set("uom", v)}>
                <SelectTrigger className="bg-background w-full h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{uomOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <FL htmlFor="hsnCode" required>HSN Code</FL>
              <Input id="hsnCode" value={values.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} className="bg-background h-10" />
            </div>
            <div className="space-y-2">
              <FL htmlFor="gst" required>GST (%)</FL>
              <Input id="gst" type="number" value={values.gst} onChange={(e) => set("gst", e.target.value)}
                step="0.01" min="0" className={`bg-background h-10 ${NO_SPINNER}`}
                onKeyDown={handleNumberKeyDown} onWheel={handleNumberWheel} />
            </div>
          </div>
        </div>

        <ProductColorsPanel colors={colors} onChange={(updated) => onChange({ colors: updated })} />
        <VariantsTable variants={variants} onChange={(updated) => onChange({ variants: updated })} />

        <div className="space-y-4">
          <h3 className="font-semibold text-lg border-b pb-2">Description</h3>
          <div className="space-y-2">
            <FL htmlFor="item-description">Product Description</FL>
            <RichTextEditor
              id="item-description"
              value={values.description}
              onChange={(next) => set("description", next)}
              placeholder="Write the product description that should appear on the website..."
            />
          </div>
        </div>

        {/* Additional Information */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg border-b pb-2">Additional Information</h3>
          <div className="flex items-center space-x-2">
            <Checkbox id="hasDemoInstallation" checked={values.hasDemoInstallation}
              onCheckedChange={(v) => set("hasDemoInstallation", v as boolean)} />
            <Label htmlFor="hasDemoInstallation" className="font-semibold text-sm cursor-pointer">Demo / Installation</Label>
          </div>
          <div className="space-y-2">
            <FL htmlFor="freeService">Free Service</FL>
            <Input id="freeService" value={values.freeService} onChange={(e) => set("freeService", e.target.value)} className="bg-background" />
          </div>
          <div className="space-y-2">
            <FL htmlFor="billPrintNote">Bill Print Note</FL>
            <Textarea id="billPrintNote" value={values.billPrintNote} onChange={(e) => set("billPrintNote", e.target.value)} rows={3} className="bg-background" />
          </div>
          <div className="space-y-2">
            <FL htmlFor="warranty">Warranty</FL>
            <Textarea id="warranty" value={values.warranty} onChange={(e) => set("warranty", e.target.value)} rows={3} className="bg-background" />
          </div>
          <div className="space-y-2">
            <FL htmlFor="item-status">STATUS</FL>
            <div className="flex items-center gap-3">
              <Switch
                id="item-status"
                checked={values.isActive}
                onCheckedChange={(checked) => set("isActive", checked)}
                className="h-6 w-11 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-200 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:bg-white [&_[data-slot=switch-thumb]]:shadow"
              />
              <span className={`text-sm font-semibold ${values.isActive ? "text-emerald-600" : "text-muted-foreground"}`}>
                {values.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" onClick={onSubmit} disabled={isSubmitting}
            className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
            {isSubmitting ? "Saving…" : mode === "add" ? "Add Item Master" : "Save Changes"}
          </Button>
          <Button type="button" variant="outline" disabled={isSubmitting}
            onClick={() => (onCancel ? onCancel() : window.history.back())} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>

      {/* Item Group Modal */}
      <Dialog open={igModalOpen} onOpenChange={(v) => { if (!v) setIgModalOpen(false); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
                <Plus className="h-4 w-4 text-white" />
              </div>
              Add Item Group
            </DialogTitle>
            <DialogDescription>Create a new item group for inventory categorization</DialogDescription>
          </DialogHeader>
          <ItemGroupFormFields values={igFormValues} onChange={(u) => setIgFormValues((p) => ({ ...p, ...u }))}
            onSubmit={handleIgSubmit} onCancel={() => setIgModalOpen(false)}
            error={igFormError} isSubmitting={igSubmitting} mode="add"
            categories={igCategories} combineGroupOptions={itemGroups.map((g) => g.name)} />
        </DialogContent>
      </Dialog>

      {/* Brand Modal */}
      <Dialog open={brandModalOpen} onOpenChange={(v) => { if (!v) setBrandModalOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
                <Plus className="h-4 w-4 text-white" />
              </div>
              Add Brand
            </DialogTitle>
            <DialogDescription>Create a new brand for inventory management</DialogDescription>
          </DialogHeader>
          <BrandFormFields values={brandFormValues} onChange={(u) => setBrandFormValues((p) => ({ ...p, ...u }))}
            onSubmit={handleBrandSubmit} onCancel={() => setBrandModalOpen(false)}
            error={brandFormError} isSubmitting={brandSubmitting} mode="add" />
        </DialogContent>
      </Dialog>

      {/* UOM Modal */}
      <UomModal open={uomModalOpen} onClose={() => setUomModalOpen(false)}
        onAdd={(uom) => { if (!uomOptions.includes(uom)) setUomOptions((prev) => [...prev, uom]); onChange({ uom }); }} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// buildItemFormData — the KEY fix:
// Colors are sent as:
//   colors          = JSON array of { id?, colorName, colorHex, deleteImageIds[] }
//   productColorImages_<ci>_<imageIdx>  = File
// ─────────────────────────────────────────────────────────────
export function buildItemFormData(v: ItemFormValues): FormData {
  const fd = new FormData();

  fd.append("itemGroupId",         v.itemGroupId || "");
  fd.append("brandId",             v.brandId || "");
  fd.append("itemName",            v.itemName.trim());
  fd.append("uom",                 v.uom);
  fd.append("hsnCode",             v.hsnCode.trim());
  fd.append("gst",                 String(parseFloat(v.gst) || 0));
  fd.append("hasDemoInstallation", v.hasDemoInstallation ? "1" : "0");
  fd.append("isActive",            v.isActive ? "1" : "0");
  fd.append("description",         v.description.trim());
  fd.append("freeService",         v.freeService.trim());
  fd.append("billPrintNote",       v.billPrintNote.trim());
  fd.append("warranty",            v.warranty.trim());

  const rawVariants = Array.isArray(v.variants) && v.variants.length > 0 ? v.variants : [{ ...EMPTY_VARIANT_ROW }];
  const rawColors   = Array.isArray(v.colors)   && v.colors.length   > 0 ? v.colors   : [{ ...EMPTY_COLOR }];

  // Variants JSON
  const cleanVariants = rawVariants.map((row) => ({
    id:            row.id || undefined,
    variant:       row.variant?.trim() || null,
    openingStock:  parseFloat(row.openingStock)  || 0,
    minimumQty:    parseFloat(row.minimumQty)    || 0,
    maxMOPPercent: parseFloat(row.maxMOPPercent) || 0,
    offerPrice:    parseFloat(row.offerPrice)    || 0,
    stockValue:    parseFloat(row.stockValue)    || 0,
    margin:        parseFloat(row.margin)        || 0,
    incentive:     parseFloat(row.incentive)     || 0,
    maxMOPAmount:  parseFloat(row.maxMOPAmount)  || 0,
    nlc:           parseFloat(row.nlc)           || 0,
  }));
  fd.append("variants", JSON.stringify(cleanVariants));

  // Colors JSON (metadata only, no files here)
  const cleanColors = rawColors.map((c) => ({
    id:             c.id || undefined,
    colorName:      c.colorName || "Default",
    colorHex:       null,
    deleteImageIds: (c.deleteImageIds || []).filter(Boolean),
  }));
  fd.append("colors", JSON.stringify(cleanColors));

  // Color image files: productColorImages_<colorIndex>_<imageIndex>
  rawColors.forEach((color, ci) => {
    let imageIndex = 0;
    (color.images || []).forEach((img) => {
      if (img.file && !img.toDelete) {
        fd.append(`productColorImages_${ci}_${imageIndex}`, img.file, img.file.name);
        imageIndex++;
      }
    });
  });

  return fd;
}
