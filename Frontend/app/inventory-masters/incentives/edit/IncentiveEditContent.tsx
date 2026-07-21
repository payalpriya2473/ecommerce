"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { TrendingUp, AlertCircle, ArrowLeft } from "lucide-react";
import { incentiveLogAPI } from "@/lib/api";
import {
  IncentiveFormFields,
  EMPTY_INCENTIVE_FORM,
} from "../IncentiveForm";
import type { IncentiveFormValues } from "../IncentiveForm";

export default function IncentiveEditContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const logId        = searchParams.get("id");

  const [formValues, setFormValues] = useState<IncentiveFormValues>({ ...EMPTY_INCENTIVE_FORM });
  const [isLoading, setIsLoading]   = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError]   = useState("");
  const [success, setSuccess]       = useState("");
  const [loadError, setLoadError]   = useState("");

  useEffect(() => {
    if (!logId) { setLoadError("No log ID provided"); setIsLoading(false); return; }

    const load = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      try {
        const res = await incentiveLogAPI.getById(token, logId);
        if (!res.success) { setLoadError(res.message || "Log not found"); setIsLoading(false); return; }

        const log = res.data;
        setFormValues({
          // Pre-fill brand and itemGroup from the saved log
          brandId:       log.brandId     || "",
          itemGroupId:   log.itemGroupId || "",
          itemId:        log.itemId,
          effectiveDate: log.effectiveDate?.split("T")[0] || log.effectiveDate,
          oldNlc:        String(log.oldNlc),
          oldIncentive:  String(log.oldIncentive),
          oldMargin:     String(log.oldMargin),
          oldOfferPrice: String(log.oldOfferPrice),
          newNlc:        String(log.newNlc),
          newIncentive:  String(log.newIncentive),
          newMargin:     String(log.newMargin),
          newOfferPrice: String(log.newOfferPrice),
          remarks:       log.remarks || "",
        });
      } catch {
        setLoadError("Failed to load incentive log");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [logId]);

  const handleSubmit = async () => {
    setFormError("");
    if (!logId) return;
    if (!formValues.effectiveDate) { setFormError("Effective date is required"); return; }

    setIsSubmitting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) { setFormError("Not authenticated. Please login again."); return; }

      const result = await incentiveLogAPI.update(logId, {
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
      }, token);

      if (result.success) {
        setSuccess("Incentive log updated successfully!");
        setTimeout(() => router.push("/inventory-masters/incentives"), 1200);
      } else {
        setFormError(result.message || "Failed to update");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to update. Please try again.");
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
            <p className="text-muted-foreground">Loading incentive log...</p>
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
                    <CardTitle className="text-2xl">Edit Incentive Log</CardTitle>
                    <CardDescription>Update incentive / margin / NLC / offer price values</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {success && (
                  <Alert className="mb-4 border-green-200 bg-green-50 text-green-800">
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
                <IncentiveFormFields
                  values={formValues}
                  onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/inventory-masters/incentives")}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="edit"
                  lockItem
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}