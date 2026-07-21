"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, ArrowLeft } from "lucide-react";
import { technicianAPI } from "@/lib/api";
import {
  TechnicianFormFields,
  TechnicianPhotoUpload,
  EMPTY_TECHNICIAN_FORM,
  BLANK_BANK,
  validateTechnicianForm,
} from "@/app/technician/TechnicianForm";
import type {
  TechnicianFormValues, BankAccount, NewDoc,
} from "@/app/technician/TechnicianForm";

export default function TechnicianRegisterPage() {
  const router = useRouter();

  const [companyId, setCompanyId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // ── Form state ────────────────────────────────────────────
  const [values, setValues] = useState<TechnicianFormValues>(EMPTY_TECHNICIAN_FORM);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([{ ...BLANK_BANK(), isPrimary: true }]);
  const [newDocs, setNewDocs] = useState<NewDoc[]>([]);

  useEffect(() => {
    setCompanyId(sessionStorage.getItem("companyId") || "");
  }, []);

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
      if (companyId) data.append("companyId", companyId);
      Object.entries(values).forEach(([k, v]) => { if (v !== "") data.append(k, v as string); });
      data.append("certifications", JSON.stringify(certifications));
      data.append("serviceAreas", JSON.stringify(serviceAreas));
      data.append("bankAccounts", JSON.stringify(banks));

      const res = await technicianAPI.register(data, token);
      if (res.success) {
        const newTechId = res.data?.technicianId || res.data?.id;
        if (!newTechId) {
          setError("Technician created, but failed to resolve technician ID for document upload");
          return;
        }
        const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
        for (const doc of newDocs) {
          const docForm = new FormData();
          docForm.append("document", doc.file);
          docForm.append("documentType", doc.documentType);
          docForm.append("documentName", doc.documentName);
          const uploadRes = await fetch(`${base}/technicians/${newTechId}/documents`, {
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
        router.push("/technician/list");
      } else {
        setError(res.message || "Failed to register technician");
      }
    } catch (err: any) {
      setError(err.message || "Failed to register technician");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-4xl">
            <Button variant="ghost" onClick={() => router.push("/technician/list")}
              className="mb-4 bg-red-700 text-white hover:bg-red-800">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <Wrench className="h-8 w-8 text-primary" />
                    <div>
                      <CardTitle className="text-2xl">Technician Registration</CardTitle>
                      <CardDescription>Complete technician details with skills and documents</CardDescription>
                    </div>
                  </div>
                  <TechnicianPhotoUpload
                    photoPreview={photoPreview}
                    onPhotoChange={(file, preview) => { setPhotoFile(file); setPhotoPreview(preview); }}
                    inputId="photo-upload-register"
                  />
                </div>
              </CardHeader>

              <CardContent>
                <TechnicianFormFields
                  mode="add"
                  values={values}
                  onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
                  photoPreview={photoPreview}
                  onPhotoChange={(file, preview) => { setPhotoFile(file); setPhotoPreview(preview); }}
                  certifications={certifications}
                  onCertificationsChange={setCertifications}
                  serviceAreas={serviceAreas}
                  onServiceAreasChange={setServiceAreas}
                  banks={banks}
                  onBanksChange={setBanks}
                  newDocs={newDocs}
                  onNewDocsChange={setNewDocs}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push("/technician/list")}
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
