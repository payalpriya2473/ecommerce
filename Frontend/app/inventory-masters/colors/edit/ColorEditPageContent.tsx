"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Palette, AlertCircle, ArrowLeft } from "lucide-react";
import { brandAPI, colorAPI } from "@/lib/api";
import type { Brand } from "@/lib/api";
import {
  ColorFormFields,
  EMPTY_COLOR_FORM,
} from "@/app/inventory-masters/colors/ColorFormFields";
import type { ColorFormValues } from "@/app/inventory-masters/colors/ColorFormFields";

export default function ColorEditPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const colorId = searchParams.get("id");

  const [formValues, setFormValues] = useState<ColorFormValues>({
    ...EMPTY_COLOR_FORM,
  });
  const [brands, setBrands] = useState<Brand[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!colorId) {
      setLoadError("No color ID provided");
      setIsLoading(false);
      return;
    }

    const load = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      try {
        const [colorRes, brandsRes] = await Promise.all([
          colorAPI.getById(token, colorId),
          brandAPI.getAll(token),
        ]);

        if (!colorRes.success) {
          setLoadError(colorRes.message || "Color not found");
          setIsLoading(false);
          return;
        }

        setFormValues({
          brandId: String(colorRes.data.brandId),
          colorName: colorRes.data.colorName,
        });

        if (brandsRes.success) setBrands(brandsRes.data);
      } catch {
        setLoadError("Failed to load color details");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [colorId]);

  const handleSubmit = async () => {
    setFormError("");
    if (!colorId) return;
    if (!formValues.brandId) {
      setFormError("Please select a brand");
      return;
    }
    if (!formValues.colorName.trim()) {
      setFormError("Color name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) {
        setFormError("Not authenticated. Please login again.");
        return;
      }
      const result = await colorAPI.update(
        colorId,
        { brandId: formValues.brandId, colorName: formValues.colorName.trim() },
        token,
      );
      if (result.success) {
        setSuccess("Color updated successfully!");
        setTimeout(() => router.push("/inventory-masters/colors"), 1200);
      } else {
        setFormError(result.message || "Failed to update color");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to update color. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading color details...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  if (loadError) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-xl">
            <Button
              variant="ghost"
              onClick={() => router.push("/inventory-masters/colors")}
              className="mb-4 bg-red-700 text-white hover:bg-red-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center">
                    <Palette className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Edit Color</CardTitle>
                    <CardDescription>
                      Update color details in the color master
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {success && (
                  <Alert className="mb-4 border-green-200 bg-green-50 text-green-800">
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
                <ColorFormFields
                  values={formValues}
                  onChange={(updated) =>
                    setFormValues((prev) => ({ ...prev, ...updated }))
                  }
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/colors")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="edit"
                  brands={brands}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}