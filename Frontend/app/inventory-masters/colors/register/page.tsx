"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Palette, ArrowLeft } from "lucide-react";
import { brandAPI, colorAPI } from "@/lib/api";
import type { Brand } from "@/lib/api";
import {
  ColorFormFields,
  EMPTY_COLOR_FORM,
} from "@/app/inventory-masters/colors/ColorFormFields";
import type { ColorFormValues } from "@/app/inventory-masters/colors/ColorFormFields";

export default function ColorRegisterPage() {
  const router = useRouter();

  const [formValues, setFormValues] = useState<ColorFormValues>({
    ...EMPTY_COLOR_FORM,
  });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const load = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const bRes = await brandAPI.getAll(token);
      if (bRes.success) setBrands(bRes.data);
    };
    load();
  }, []);

  const handleSubmit = async () => {
    setFormError("");
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
      const result = await colorAPI.register(
        { brandId: formValues.brandId, colorName: formValues.colorName.trim() },
        token,
      );
      if (result.success) {
        router.push("/inventory-masters/colors");
      } else {
        setFormError(result.message || "Failed to register color");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to register color. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
                    <CardTitle className="text-2xl">Add Color</CardTitle>
                    <CardDescription>
                      Add a new brand-wise color to the color master
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ColorFormFields
                  values={formValues}
                  onChange={(updated) =>
                    setFormValues((prev) => ({ ...prev, ...updated }))
                  }
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/colors")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="add"
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