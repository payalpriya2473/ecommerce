"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Store, Warehouse, ArrowLeft } from "lucide-react";
import { branchAPI, companyAPI } from "@/lib/api";
import {
  BranchFormFields,
  EMPTY_BRANCH_FORM,
  validateBranchForm,
  buildBranchPayload,
} from "../BranchForm";
import type { BranchFormValues } from "../BranchForm";

export default function BranchRegisterPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [values, setValues] = useState<BranchFormValues>(EMPTY_BRANCH_FORM);

  // Auto-resolve companyId silently on mount — user never sees a selector
  useEffect(() => {
    const resolveCompany = async () => {
      try {
        const token = sessionStorage.getItem("authToken");
        const companyId = sessionStorage.getItem("companyId");

        // Prefer companyId already stored in session
        if (companyId) {
          setValues((p) => ({ ...p, companyId }));
          return;
        }

        // Fallback: fetch first company from API
        if (!token) return;
        const res = await companyAPI.getAll(token);
        if (res.success && res.data.length > 0) {
          setValues((p) => ({ ...p, companyId: res.data[0].id }));
        }
      } catch {
        // silent — validation will surface "no company found" if still empty
      }
    };
    resolveCompany();
  }, []);

  const handleSubmit = async () => {
    setError("");
    const validationError = validateBranchForm(values);
    if (validationError) { setError(validationError); return; }

    const token = sessionStorage.getItem("authToken");
    if (!token) { setError("Authentication required"); return; }

    setIsSubmitting(true);
    try {
      const payload = buildBranchPayload(values);
      const result = await branchAPI.register(payload, token);

      if (result.success) {
        router.push("/branch/list");
      } else {
        setError(result.message || "Failed to register branch");
      }
    } catch (err: any) {
      setError(err.message || "Failed to register branch. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────
  const Icon = values.type === "showroom" ? Store : Warehouse;

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-3xl">
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
                    {/* Title updates live as the user toggles type */}
                    <CardTitle className="text-2xl capitalize">
                      {values.type} Registration
                    </CardTitle>
                    <CardDescription>
                      Register a new {values.type} for your company
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <BranchFormFields
                  mode="add"
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
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
