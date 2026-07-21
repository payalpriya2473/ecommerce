"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ArrowLeft } from "lucide-react";
import { employeeAPI } from "@/lib/api";
import {
  EmployeeFormFields,
  EMPTY_EMPLOYEE_FORM,
  validateEmployeeForm,
} from "../EmployeeForm";
import type { EmployeeFormValues } from "../EmployeeForm";

export default function EmployeeRegisterPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]               = useState("");

  const [values, setValues]         = useState<EmployeeFormValues>(EMPTY_EMPLOYEE_FORM);
  const [photoFile, setPhotoFile]   = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [documents, setDocuments]   = useState<Array<{ id: string; name: string; fileName: string }>>([
    { id: `doc-${Date.now()}`, name: "", fileName: "" },
  ]);

  const handleSubmit = async () => {
    setError("");

    // Photo size check (surface error via form error state)
    if (photoFile && photoFile.size > 2 * 1024 * 1024) {
      setError("Photo size should be less than 2MB");
      return;
    }

    const validationError = validateEmployeeForm(values);
    if (validationError) { setError(validationError); return; }

    const token = sessionStorage.getItem("authToken");
    if (!token) { setError("Authentication required"); return; }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      if (photoFile) data.append("photo", photoFile);

      // All non-empty form fields
      Object.entries(values).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) data.append(k, String(v));
      });

      const response = await employeeAPI.register(data, token);

      if (response.success) {
        router.push("/employee/list");
      } else {
        setError(response.message || "Failed to register employee");
      }
    } catch (err: any) {
      setError(err.message || "Failed to register employee. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-6xl">
            <Button
              onClick={() => router.push("/employee/list")}
              className="mb-4 bg-red-700 hover:bg-red-800 text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-red-700 flex items-center justify-center shrink-0">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Employee Registration</CardTitle>
                    <CardDescription>
                      Complete employee details with hierarchy and documents
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <EmployeeFormFields
                  mode="add"
                  values={values}
                  onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
                  photoPreview={photoPreview}
                  onPhotoChange={(file, preview) => {
                    setPhotoFile(file);
                    setPhotoPreview(preview);
                  }}
                  documents={documents}
                  onDocumentsChange={setDocuments}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/employee/list")}
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
