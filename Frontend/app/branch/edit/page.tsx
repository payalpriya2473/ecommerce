"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Store, Warehouse, ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { branchAPI } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import {
  BranchFormFields,
  EMPTY_BRANCH_FORM,
  validateBranchForm,
  buildBranchPayload,
} from "../BranchForm";
import type { BranchFormValues } from "../BranchForm";

// ─────────────────────────────────────────────────────────────
// Inner content (uses useSearchParams — must be inside Suspense)
// ─────────────────────────────────────────────────────────────

function BranchEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchId = searchParams.get("id") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [values, setValues] = useState<BranchFormValues>(EMPTY_BRANCH_FORM);

  const { canEdit, canView } = usePermissions();

  useEffect(() => {
    if (branchId) fetchBranch();
  }, [branchId]);

  const fetchBranch = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await branchAPI.getById(token, branchId);
      if (result.success) {
        const d = result.data;
        setValues({
          companyId:      d.companyId      || "",
          type:           d.type           || "showroom",
          operationModel: d.operationModel || "company-operated",
          name:           d.name           || "",
          address:        d.address        || "",
          city:           d.city           || "",
          state:          d.state          || "",
          pinCode:        d.pinCode        || "",
          contactPhone:   d.contactPhone   || "",
          contactEmail:   d.contactEmail   || "",
          gstNumber:      d.gstNumber      || "",
          panNumber:      d.panNumber      || "",
          bankName:       d.bankName       || "",
          bankBranch:     d.bankBranch     || "",
          accountNumber:  d.accountNumber  || "",
          ifscCode:       d.ifscCode       || "",
        });
      }
    } catch {
      setError("Failed to load branch details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    const validationError = validateBranchForm(values);
    if (validationError) { setError(validationError); return; }

    const token = sessionStorage.getItem("authToken");
    if (!token) { setError("Authentication required"); return; }

    setIsSubmitting(true);
    try {
      const payload = buildBranchPayload(values);
      const result = await branchAPI.update(branchId, payload, token);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/branch/list"), 1500);
      } else {
        setError(result.message || "Failed to update branch");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update branch");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Access denied ─────────────────────────────────────────
  if (!canEdit("branches")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center mb-6">
              You don't have permission to edit branches.
            </p>
            {canView("branches") && (
              <Link href="/branch/list"><Button>View Branches</Button></Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading branch details...</p>
        </div>
      </div>
    );
  }

  const Icon = values.type === "showroom" ? Store : Warehouse;

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-4xl">
        <Button
          onClick={() => router.push("/branch/list")}
          className="mb-4 bg-red-700 hover:bg-red-800 text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-red-700 flex items-center justify-center shrink-0">
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Edit Branch</CardTitle>
                <CardDescription>Update branch information</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Branch updated successfully! Redirecting...
                </AlertDescription>
              </Alert>
            )}

            <BranchFormFields
              mode="edit"
              values={values}
              onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
              onSubmit={handleSubmit}
              onCancel={() => router.push("/branch/list")}
              isSubmitting={isSubmitting}
              error={error}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Page wrapper with Suspense
// ─────────────────────────────────────────────────────────────

export default function BranchEditPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <BranchEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
