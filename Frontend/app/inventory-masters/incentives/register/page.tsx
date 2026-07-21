"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { TrendingUp, ArrowLeft } from "lucide-react";
import { incentiveLogAPI } from "@/lib/api";
import {
  IncentiveFormFields,
  EMPTY_INCENTIVE_FORM,
} from "../IncentiveForm";
import type { IncentiveFormValues } from "../IncentiveForm";

export default function IncentiveRegisterPage() {
  const router = useRouter();

  const [formValues, setFormValues] = useState<IncentiveFormValues>({ ...EMPTY_INCENTIVE_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const handleSubmit = async () => {
    setFormError("");
    if (!formValues.brandId)       { setFormError("Please select a brand"); return; }
    if (!formValues.itemGroupId)   { setFormError("Please select an item group"); return; }
    if (!formValues.itemId)        { setFormError("Please select an item"); return; }
    if (!formValues.effectiveDate) { setFormError("Effective date is required"); return; }

    setIsSubmitting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) { setFormError("Not authenticated. Please login again."); return; }

      const result = await incentiveLogAPI.register(
        {
          itemId:        formValues.itemId,
          effectiveDate: formValues.effectiveDate,
          oldNlc:        parseFloat(formValues.oldNlc)        || 0,
          oldIncentive:  parseFloat(formValues.oldIncentive)  || 0,
          oldMargin:     parseFloat(formValues.oldMargin)     || 0,
          oldOfferPrice: parseFloat(formValues.oldOfferPrice) || 0,
          newNlc:        parseFloat(formValues.newNlc)        || 0,
          newIncentive:  parseFloat(formValues.newIncentive)  || 0,
          newMargin:     parseFloat(formValues.newMargin)     || 0,
          newOfferPrice: parseFloat(formValues.newOfferPrice) || 0,
          remarks:       formValues.remarks || undefined,
        },
        token
      );

      if (result.success) {
        router.push("/inventory-masters/incentives");
      } else {
        setFormError(result.message || "Failed to save incentive log");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-3xl">
            <Button
              variant="ghost"
              onClick={() => router.push("/inventory-masters/incentives")}
              className="mb-4 bg-red-700 text-white hover:bg-red-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-8 w-8 text-primary" />
                  <div>
                    <CardTitle className="text-2xl">Add Incentive</CardTitle>
                    <CardDescription>
                      Select brand &amp; item group, then log NLC / margin / incentive / offer price changes
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <IncentiveFormFields
                  values={formValues}
                  onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/incentives")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="add"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}