"use client";
import { resolveAssetUrl } from "@/lib/asset-url"

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Package2, AlertCircle, ArrowLeft } from "lucide-react";
import { brandAPI, itemGroupAPI, itemAPI } from "@/lib/api";
import type { Brand, ItemGroup } from "@/lib/api";
import {
  ItemFormFields,
  EMPTY_ITEM_FORM,
  EMPTY_VARIANT_ROW,
  EMPTY_COLOR,
  buildItemFormData,
  toWholeNumberString,
} from "../ItemForm";
import type { ItemFormValues, ItemVariantRow, VariantColorEntry } from "../ItemForm";

function toAbsoluteImageUrl(url?: string) {
  return resolveAssetUrl(url);
}

// ─────────────────────────────────────────────────────────────
// Map API color array → VariantColorEntry[]
// ─────────────────────────────────────────────────────────────
function mapApiColorsToForm(apiColors: any[]): VariantColorEntry[] {
  if (!Array.isArray(apiColors) || apiColors.length === 0) return [{ ...EMPTY_COLOR }];
  return apiColors.map((c: any) => ({
    id:             String(c.id || ""),
    colorName:      c.colorName || "",
    colorHex:       c.colorHex  || "",
    deleteImageIds: [],
    images: Array.isArray(c.images)
      ? c.images.map((img: any) => ({
          id:         String(img.id || ""),
          imageUrl:   String(img.imageUrl || ""),
          previewUrl: toAbsoluteImageUrl(String(img.imageUrl || "")),
          toDelete:   false,
        }))
      : [],
  }));
}

// ─────────────────────────────────────────────────────────────
// Edit Page Content
// ─────────────────────────────────────────────────────────────
function ItemEditPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("id");

  const [formValues, setFormValues] = useState<ItemFormValues>({ ...EMPTY_ITEM_FORM });
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);

  const [isLoading,    setIsLoading]    = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError,    setFormError]    = useState("");
  const [success,      setSuccess]      = useState("");
  const [loadError,    setLoadError]    = useState("");

  useEffect(() => {
    if (!itemId) { setLoadError("No item ID provided"); setIsLoading(false); return; }

    const load = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      try {
        const res = await itemAPI.getById(token, itemId);
        if (!res.success) { setLoadError(res.message || "Item not found"); setIsLoading(false); return; }

        const item = res.data;
        // ── Map variants ─────────────────────────────────────
        const fallbackVariants: any[] = item.variants || [];
        let variantRows: ItemVariantRow[];

        if (fallbackVariants.length > 0) {
          variantRows = fallbackVariants.map((v: any) => ({
            id:            String(v.id || ""),
            variant:       v.variant       || "",
            openingStock:  toWholeNumberString(v.openingStock),
            minimumQty:    toWholeNumberString(v.minimumQty),
            maxMOPPercent: String(v.maxMOPPercent ?? ""),
            offerPrice:    String(v.offerPrice    ?? ""),
            stockValue:    toWholeNumberString(v.stockValue),
            margin:        String(v.margin        ?? ""),
            incentive:     String(v.incentive     ?? ""),
            maxMOPAmount:  String(v.maxMOPAmount  ?? ""),
            nlc:           String(v.nlc           ?? ""),
          }));
        } else {
          variantRows = [{ ...EMPTY_VARIANT_ROW }];
        }

        // ── Map colors ───────────────────────────────────────
        // item.colors = merged unique colors returned by the updated controller
        const productColors: VariantColorEntry[] = mapApiColorsToForm(item.colors || []);

        setFormValues({
          itemGroupId:         item.itemGroupId   || "",
          brandId:             item.brandId       || "",
          itemName:            item.itemName,
          uom:                 item.uom,
          hsnCode:             item.hsnCode       || "",
          gst:                 String(item.gst    ?? ""),
          hasDemoInstallation: !!item.hasDemoInstallation,
          isActive:            !!item.isActive,
          description:         item.description || "",
          freeService:         item.freeService   || "",
          billPrintNote:       item.billPrintNote || "",
          warranty:            item.warranty      || "",
          colors:              productColors,
          variants:            variantRows,
        });

        const [bRes, gRes] = await Promise.all([
          brandAPI.getAll(token),
          itemGroupAPI.getAll(token),
        ]);
        if (bRes.success) setBrands(bRes.data);
        if (gRes.success) setItemGroups(gRes.data);
      } catch {
        setLoadError("Failed to load item details");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [itemId]);

  const handleSubmit = async () => {
    setFormError("");
    if (!itemId) return;
    if (!formValues.itemName.trim()) { setFormError("Item name is required"); return; }
    if (!formValues.hsnCode.trim())  { setFormError("HSN Code is required");  return; }
    if (!formValues.gst || parseFloat(formValues.gst) < 0) { setFormError("GST % is required"); return; }
    if (!Array.isArray(formValues.colors)   || formValues.colors.length   === 0) { setFormError("At least one product color is required");  return; }
    if (!Array.isArray(formValues.variants) || formValues.variants.length === 0) { setFormError("At least one variant is required"); return; }

    setIsSubmitting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) { setFormError("Not authenticated. Please login again."); return; }

      const payload = buildItemFormData(formValues);
      const result  = await itemAPI.update(itemId, payload, token);
      if (result.success) {
        setSuccess("Item updated successfully!");
        setTimeout(() => router.push("/inventory-masters/items"), 1200);
      } else {
        setFormError(result.message || "Failed to update item");
      }
    } catch (err: any) {
      const message = String(err?.message || "");
      setFormError(
        /fetch|payload too large|413/i.test(message)
          ? "Upload is too large. Please use fewer or smaller images and try again."
          : message || "Failed to update item. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AuthGuard><AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading item details…</p>
          </div>
        </div>
      </AuthenticatedLayout></AuthGuard>
    );
  }

  if (loadError) {
    return (
      <AuthGuard><AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        </div>
      </AuthenticatedLayout></AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">
            <Button variant="ghost" onClick={() => router.push("/inventory-masters/items")}
              className="mb-4 bg-red-700 text-white hover:bg-red-800">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                    <Package2 className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-2xl">Edit Item</CardTitle>
                    <CardDescription>Update item details, variants, colors and images</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {success && (
                  <Alert className="mb-4 border-green-200 bg-green-50 text-green-800">
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
                <ItemFormFields
                  values={formValues}
                  onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/items")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="edit"
                  initialBrands={brands}
                  initialItemGroups={itemGroups}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}

export default function ItemEditPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>}>
      <ItemEditPageContent />
    </Suspense>
  );
}
