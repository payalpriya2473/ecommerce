"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, ArrowLeft } from "lucide-react";
import { companyAPI } from "@/lib/api";
import {
  CompanyFormFields,
  CompanyLogoUpload,
  EMPTY_COMPANY_FORM,
  BLANK_BANK,
  validateCompanyForm,
} from "../CompanyForm";
import type { CompanyFormValues, BankAccount } from "../CompanyForm";

export default function CompanyRegisterPage() {
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [values, setValues] = useState<CompanyFormValues>(EMPTY_COMPANY_FORM);
  const [banks, setBanks] = useState<BankAccount[]>([{ ...BLANK_BANK(), isPrimary: true }]);

  // Logo state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

  const handleLogoChange = (file: File, preview: string) => {
    setLogoFile(file);
    setLogoPreview(preview);
  };

  const handleSubmit = async () => {
    setError("");
    const validationError = validateCompanyForm(values, banks);
    if (validationError) { setError(validationError); return; }

    const token = sessionStorage.getItem("authToken");
    if (!token) { setError("Authentication required"); return; }

    setIsSubmitting(true);
    try {
      const primaryBank = banks.find((b) => b.isPrimary) || banks[0];
      const qrCodeData =
        primaryBank.upiId?.trim()
          ? `upi://pay?pa=${primaryBank.upiId}&pn=${encodeURIComponent(values.name)}&cu=INR`
          : null;

      // Build FormData for multipart upload
      const formData = new FormData();

      // Append scalar values fields — skip ones we'll set explicitly below
      const skipKeys = new Set(["gstNumber", "panNumber", "tdsRate", "dispatchName", "dispatchContactPerson", "dispatchContactPhone"]);
      Object.entries(values).forEach(([key, val]) => {
        if (!skipKeys.has(key) && val !== null && val !== undefined) {
          formData.append(key, String(val));
        }
      });

      // Append transformed / bank-derived fields exactly once
      formData.append("gstNumber", values.gstNumber.toUpperCase());
      formData.append("panNumber", values.panNumber.toUpperCase());
      formData.append("tdsRate", values.tdsRate ? String(parseFloat(values.tdsRate)) : "0");
      formData.append("bankName", primaryBank.bankName);
      formData.append("accountNumber", primaryBank.accountNumber);
      formData.append("ifscCode", primaryBank.ifscCode.toUpperCase());
      formData.append("bankBranch", primaryBank.bankBranch);
      if (primaryBank.upiId) formData.append("upiId", primaryBank.upiId);
      if (qrCodeData) formData.append("qrCodeData", qrCodeData);
      formData.append("banks", JSON.stringify(banks.map((b) => ({
        ...b,
        ifscCode: b.ifscCode.toUpperCase(),
        upiId: b.upiId || null,
      }))));

      // Dispatch Instruction fields
      if (values.dispatchName) formData.append("dispatchName", values.dispatchName);
      if (values.dispatchContactPerson) formData.append("dispatchContactPerson", values.dispatchContactPerson);
      if (values.dispatchContactPhone) formData.append("dispatchContactPhone", values.dispatchContactPhone);

      // Append logo if selected
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const result = await companyAPI.register(formData, token);
      if (result.success) {
        router.push("/company/list");
      } else {
        setError(result.message || "Failed to register company");
      }
    } catch (err: any) {
      setError(err.message || "Failed to register company");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-4xl">
            <Button
              onClick={() => router.push("/company/list")}
              className="mb-4 bg-red-700 hover:bg-red-800 text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-12 w-12 rounded-xl bg-red-700 flex items-center justify-center shrink-0">
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl">Company Registration</CardTitle>
                      <CardDescription>Register your company with complete details</CardDescription>
                    </div>
                  </div>
                  <CompanyLogoUpload
                    logoPreview={logoPreview}
                    onLogoChange={handleLogoChange}
                    inputId="company-logo-upload-register"
                  />
                </div>
              </CardHeader>

              <CardContent>
                <CompanyFormFields
                  mode="add"
                  values={values}
                  onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
                  banks={banks}
                  onBanksChange={setBanks}
                  logoPreview={logoPreview}
                  onLogoChange={handleLogoChange}
                  showLogoSection={false}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/company/list")}
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
