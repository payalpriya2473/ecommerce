"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { companyAPI } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import {
  CompanyFormFields,
  CompanyLogoUpload,
  EMPTY_COMPANY_FORM,
  BLANK_BANK,
  validateCompanyForm,
} from "../CompanyForm";
import type { CompanyFormValues, BankAccount } from "../CompanyForm";

function CompanyEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("id") || "";
  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [values, setValues] = useState<CompanyFormValues>(EMPTY_COMPANY_FORM);
  const [banks, setBanks] = useState<BankAccount[]>([]);

  // Logo state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");

  const { canEdit, canView } = usePermissions();

  useEffect(() => {
    if (companyId) fetchCompany();
  }, [companyId]);

  const fetchCompany = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await companyAPI.getById(token, companyId);
      if (result.success) {
        const d = result.data;
        setValues({
          name: d.name || "",
          address: d.address || "",
          city: d.city || "",
          state: d.state || "",
          pinCode: d.pinCode || "",
          gstNumber: d.gstNumber || "",
          panNumber: d.panNumber || "",
          udid: d.udid || "",
          msmeRegistered: !!d.msmeRegistered,
          msmeNumber: d.msmeNumber || "",
          msmeCategory: d.msmeCategory || "",
          msmeType: d.msmeType || "",
          tdsApplicable: !!d.tdsApplicable,
          tanNumber: d.tanNumber || "",
          tdsRate: d.tdsRate != null ? String(d.tdsRate) : "",
          // Dispatch Instruction
          dispatchName: d.dispatchName || "",
          dispatchContactPerson: d.dispatchContactPerson || "",
          dispatchContactPhone: d.dispatchContactPhone || "",
        });

        // Load existing logo as preview
        if (d.logoUrl) {
          const resolvedLogoUrl =
            d.logoUrl.startsWith("http") || d.logoUrl.startsWith("data:")
              ? d.logoUrl
              : `${baseUrl}${d.logoUrl}`;
          setLogoPreview(resolvedLogoUrl);
        }

        if (d.banks && d.banks.length > 0) {
          setBanks(d.banks.map((b: BankAccount) => ({ ...b, id: b.id || `${Date.now()}` })));
        } else {
          setBanks([{
            id: `${Date.now()}`,
            bankName: d.bankName || "",
            bankBranch: d.bankBranch || "",
            accountNumber: d.accountNumber || "",
            ifscCode: d.ifscCode || "",
            accountType: "current",
            isPrimary: true,
            upiId: d.upiId || "",
          }]);
        }
      }
    } catch {
      setError("Failed to load company details");
    } finally {
      setIsLoading(false);
    }
  };

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

      // Append scalar values — skip ones we'll set explicitly below
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
      formData.append("dispatchName", values.dispatchName || "");
      formData.append("dispatchContactPerson", values.dispatchContactPerson || "");
      formData.append("dispatchContactPhone", values.dispatchContactPhone || "");

      // Only append logo if a new file was selected
      if (logoFile) {
        formData.append("logo", logoFile);
      }

      const result = await companyAPI.update(companyId, formData, token);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/company/list"), 1500);
      } else {
        setError(result.message || "Failed to update company");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update company");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Access denied ─────────────────────────────────────────
  if (!canEdit("companies")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center mb-6">
              You don't have permission to edit companies.
            </p>
            {canView("companies") && (
              <Link href="/company/list"><Button>View Companies</Button></Link>
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading company details...</p>
        </div>
      </div>
    );
  }

  return (
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
                  <CardTitle className="text-2xl">Edit Company</CardTitle>
                  <CardDescription>Update company information</CardDescription>
                </div>
              </div>
              <CompanyLogoUpload
                logoPreview={logoPreview}
                onLogoChange={handleLogoChange}
                inputId="company-logo-upload-edit"
              />
            </div>
          </CardHeader>

          <CardContent>
            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Company updated successfully! Redirecting...
                </AlertDescription>
              </Alert>
            )}

            <CompanyFormFields
              mode="edit"
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
  );
}

export default function CompanyEditPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <CompanyEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}