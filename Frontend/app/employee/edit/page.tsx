"use client";
import { resolveAssetUrl } from "@/lib/asset-url"

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { employeeAPI } from "@/lib/api";
import {
  EmployeeFormFields,
  EMPTY_EMPLOYEE_FORM,
  validateEmployeeForm,
} from "../EmployeeForm";
import type { EmployeeFormValues } from "../EmployeeForm";

// ─────────────────────────────────────────────────────────────
// Inner content — uses useSearchParams so must live inside Suspense
// ─────────────────────────────────────────────────────────────

function EmployeeEditContent() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const employeeId  = searchParams.get("id") ?? "";

  const [isLoading, setIsLoading]   = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState(false);

  const [values, setValues]         = useState<EmployeeFormValues>(EMPTY_EMPLOYEE_FORM);
  const [photoFile, setPhotoFile]   = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // ── Redirect if no id ─────────────────────────────────────
  useEffect(() => {
    if (!employeeId) router.push("/employee/list");
  }, [employeeId, router]);

  // ── Fetch employee and populate form ──────────────────────
  useEffect(() => {
    if (!employeeId) return;

    const fetch = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) { router.push("/login"); return; }

      try {
        const res = await employeeAPI.getById(employeeId, token);
        if (!res.success) { setError("Employee not found"); return; }

        const e = res.data;

        // Map every API field into form values — keep in sync with EmployeeFormValues
        setValues({
          companyId:              e.companyId              ?? "",
          departmentId:           e.departmentId           ?? "",
          designationId:          e.designationId          ?? "",
          employeeNo:             e.employeeNo             ?? "",
          name:                   e.name                   ?? "",
          gender:                (e.gender as "male" | "female") ?? "male",
          permanentAddress1:      e.permanentAddress1      ?? "",
          permanentAddress2:      e.permanentAddress2      ?? "",
          permanentAddress3:      e.permanentAddress3      ?? "",
          permanentCity:          e.permanentCity          ?? "",
          permanentPhone:         e.permanentPhone         ?? "",
          localAddress1:          e.localAddress1          ?? "",
          localAddress2:          e.localAddress2          ?? "",
          localAddress3:          e.localAddress3          ?? "",
          localCity:              e.localCity              ?? "",
          localPhone:             e.localPhone             ?? "",
          mobile:                 e.mobile                 ?? "",
          email:                  e.email                  ?? "",
          emergencyContactNo:     e.emergencyContactNo     ?? "",
          emergencyContactPerson: e.emergencyContactPerson ?? "",
          reference1:             e.reference1             ?? "",
          reference2:             e.reference2             ?? "",
          panNo:                  e.panNo                  ?? "",
          uidNo:                  e.uidNo                  ?? "",
          weeklyOff:              e.weeklyOff              ?? "",
          inTime:                 e.inTime                 ?? "09:00",
          outTime:                e.outTime                ?? "18:00",
          graceMinutes:           String(e.graceMinutes    ?? "15"),
          pfNo:                   e.pfNo                   ?? "",
          esiNo:                  e.esiNo                  ?? "",
          birthDate:              e.birthDate              ?? "",
          joiningDate:            e.joiningDate            ?? "",
          resignDate:             e.resignDate             ?? "",
          basicSalary:            String(e.basicSalary     ?? ""),
          spa:                    String(e.spa             ?? ""),
          hra:                    String(e.hra             ?? ""),
          conveyance:             String(e.conveyance      ?? ""),
          medical:                String(e.medical         ?? ""),
          machineNo:              e.machineNo              ?? "",
          bankName:               e.bankName               ?? "",
          bankBranch:             e.bankBranch             ?? "",
          accountNo:              e.accountNo              ?? "",
          ifscCode:               e.ifscCode               ?? "",
          userId:                 e.userId                 ?? "",
          marketCategory:         e.marketCategory         ?? "",
          callSlab:               e.callSlab               ?? "",
        });

        // Resolve existing photo URL
        if (e.photoUrl) {
          setPhotoPreview(
            resolveAssetUrl(e.photoUrl)
          );
        }
      } catch (err: any) {
        setError(err.message || "Failed to load employee data");
      } finally {
        setIsLoading(false);
      }
    };

    fetch();
  }, [employeeId, router]);

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");

    if (photoFile && photoFile.size > 2 * 1024 * 1024) {
      setError("Photo size should be less than 2MB");
      return;
    }

    const validationError = validateEmployeeForm(values);
    if (validationError) { setError(validationError); return; }

    const token = sessionStorage.getItem("authToken");
    if (!token || !employeeId) { setError("Authentication required"); return; }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      if (photoFile) data.append("photo", photoFile);

      Object.entries(values).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) data.append(k, String(v));
      });

      const response = await employeeAPI.update(employeeId, data, token);

      if (response.success) {
        setSuccess(true);
        setTimeout(() => router.push("/employee/list"), 1500);
      } else {
        setError(response.message || "Failed to update employee");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update employee. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading employee data...</p>
        </div>
      </div>
    );
  }

  return (
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
                <CardTitle className="text-2xl">Edit Employee</CardTitle>
                <CardDescription>Update employee information</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Employee updated successfully! Redirecting...
                </AlertDescription>
              </Alert>
            )}

            <EmployeeFormFields
              mode="edit"
              values={values}
              onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
              photoPreview={photoPreview}
              onPhotoChange={(file, preview) => {
                setPhotoFile(file);
                setPhotoPreview(preview);
              }}
              // No documents prop in edit mode — document management is separate
              onSubmit={handleSubmit}
              onCancel={() => router.push("/employee/list")}
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
// Page wrapper with Suspense boundary
// ─────────────────────────────────────────────────────────────

export default function EmployeeEditPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <EmployeeEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
