"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Wrench, ArrowLeft } from "lucide-react";
import { technicianAPI } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import {
  TechnicianFormFields,
  TechnicianPhotoUpload,
  EMPTY_TECHNICIAN_FORM,
  BLANK_BANK,
  validateTechnicianForm,
} from "../TechnicianForm";
import type {
  TechnicianFormValues, BankAccount, NewDoc, ExistingDoc,
} from "../TechnicianForm";

// ─────────────────────────────────────────────────────────────
// Inner content (uses useSearchParams — must be inside Suspense)
// ─────────────────────────────────────────────────────────────

function TechnicianEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const techId = searchParams.get("id") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // ── Form state ────────────────────────────────────────────
  const [values, setValues] = useState<TechnicianFormValues>(EMPTY_TECHNICIAN_FORM);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");   // base64 of new photo
  const [existingPhoto, setExistingPhoto] = useState(""); // URL of current photo
  const [certifications, setCertifications] = useState<string[]>([]);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [existingDocs, setExistingDocs] = useState<ExistingDoc[]>([]);
  const [newDocs, setNewDocs] = useState<NewDoc[]>([]);

  const { canEdit, canView } = usePermissions();

  useEffect(() => { if (techId) fetchTechnician(); }, [techId]);

  const fetchTechnician = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const res = await technicianAPI.getById(token, techId);
      if (res.success) {
        const t = res.data;
        setValues({
          name: t.name || "", mobile: t.mobile || "", email: t.email || "",
          address1: t.address1 || "", address2: t.address2 || "", address3: t.address3 || "",
          city: t.city || "", state: t.state || "", pinCode: t.pinCode || "",
          gstNumber: t.gstNumber || "", panNo: t.panNo || "", uidNo: t.uidNo || "",
          specialization: t.specialization || "",
          experience: String(t.experience ?? ""),
          joiningDate: t.joiningDate ? new Date(t.joiningDate).toISOString().split("T")[0] : "",
        });
        setExistingPhoto(t.photoUrl || "");
        setCertifications(
          typeof t.certifications === "string" ? JSON.parse(t.certifications) : (t.certifications ?? [])
        );
        setServiceAreas(
          typeof t.serviceAreas === "string" ? JSON.parse(t.serviceAreas) : (t.serviceAreas ?? [])
        );
        const bankList: BankAccount[] = (t.bankAccounts ?? []).map((b: any) => ({
          id: b.id || `${Date.now()}`, bankName: b.bankName || "", bankBranch: b.bankBranch || "",
          accountNo: b.accountNo || "", ifscCode: b.ifscCode || "",
          accountHolderName: b.accountHolderName || "", accountType: b.accountType || "current",
          isPrimary: !!b.isPrimary,
        }));
        setBanks(bankList.length > 0 ? bankList : [{ ...BLANK_BANK(), isPrimary: true }]);
        setExistingDocs(
          typeof t.documents === "string" ? JSON.parse(t.documents) : (t.documents ?? []),
        );
      }
    } catch {
      setError("Failed to load technician details");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteExistingDoc = async (docId: string) => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
      await fetch(`${base}/technicians/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setExistingDocs((p) => p.filter((d) => d.id !== docId));
    } catch {
      setError("Failed to delete document");
    }
  };

  const handleSubmit = async () => {
    setError("");
    const validationError = validateTechnicianForm(values, banks);
    if (validationError) { setError(validationError); return; }

    if (photoFile && photoFile.size > 2 * 1024 * 1024) {
      setError("Photo must be < 2 MB"); return;
    }
    for (const doc of newDocs) {
      if (doc.file.size > 5 * 1024 * 1024) {
        setError(`Document "${doc.documentName}" must be < 5 MB`); return;
      }
    }

    const token = sessionStorage.getItem("authToken");
    if (!token) { setError("Authentication required"); return; }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      if (photoFile) data.append("photo", photoFile);
      Object.entries(values).forEach(([k, v]) => { if (v !== "") data.append(k, v as string); });
      data.append("certifications", JSON.stringify(certifications));
      data.append("serviceAreas", JSON.stringify(serviceAreas));
      data.append("bankAccounts", JSON.stringify(banks));

      const res = await technicianAPI.update(techId, data, token);
      if (res.success) {
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
        for (const doc of newDocs) {
          const docForm = new FormData();
          docForm.append("document", doc.file);
          docForm.append("documentType", doc.documentType);
          docForm.append("documentName", doc.documentName);
          const uploadRes = await fetch(`${base}/technicians/${techId}/documents`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: docForm,
          });
          if (!uploadRes.ok) {
            const uploadBody = await uploadRes.json().catch(() => ({}));
            setError(uploadBody?.message || `Failed to upload document: ${doc.documentName}`);
            return;
          }
        }
        setSuccess(true);
        setTimeout(() => router.push("/technician/list"), 1500);
      } else {
        setError(res.message || "Failed to update technician");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update technician");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Access denied ─────────────────────────────────────────
  if (!canEdit("technicians")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center mb-6">
              You don't have permission to edit technicians.
            </p>
            {canView("technicians") && (
              <Link href="/technician/list"><Button>View Technicians</Button></Link>
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
          <p className="text-muted-foreground">Loading technician details...</p>
        </div>
      </div>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") ?? "";
  const photoSrc = photoPreview || (existingPhoto ? `${baseUrl}${existingPhoto}` : "");

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-4xl">
        <Button onClick={() => router.push("/technician/list")}
          className="mb-4 bg-red-700 hover:bg-red-800 text-white">
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-red-700 flex items-center justify-center shrink-0">
                  <Wrench className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Edit Technician</CardTitle>
                  <CardDescription>Update technician information</CardDescription>
                </div>
              </div>
              <TechnicianPhotoUpload
                photoPreview={photoSrc}
                onPhotoChange={(file, preview) => { setPhotoFile(file); setPhotoPreview(preview); }}
                inputId="photo-upload-edit"
              />
            </div>
          </CardHeader>

          <CardContent>
            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Technician updated successfully! Redirecting...
                </AlertDescription>
              </Alert>
            )}

            <TechnicianFormFields
              mode="edit"
              values={values}
              onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
              photoPreview={photoSrc}
              onPhotoChange={(file, preview) => { setPhotoFile(file); setPhotoPreview(preview); }}
              certifications={certifications}
              onCertificationsChange={setCertifications}
              serviceAreas={serviceAreas}
              onServiceAreasChange={setServiceAreas}
              banks={banks}
              onBanksChange={setBanks}
              newDocs={newDocs}
              onNewDocsChange={setNewDocs}
              existingDocs={existingDocs}
              onDeleteExistingDoc={handleDeleteExistingDoc}
              onSubmit={handleSubmit}
              onCancel={() => router.push("/technician/list")}
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

export default function TechnicianEditPage() {
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
          <TechnicianEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
