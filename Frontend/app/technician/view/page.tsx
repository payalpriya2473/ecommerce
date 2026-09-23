"use client";
import { resolveAssetUrl } from "@/lib/asset-url"

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Wrench, ArrowLeft, Edit, AlertCircle, CreditCard,
  FileText, Phone, Award, MapPinned,
} from "lucide-react";
import { technicianAPI, Technician } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-start text-sm">
      <span className="text-muted-foreground shrink-0 mr-4">{label}:</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function TechnicianViewContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const techId       = searchParams.get("id") || "";

  const [tech, setTech]           = useState<Technician | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { canView, canEdit } = usePermissions();

  useEffect(() => {
    if (techId) fetchTechnician();
  }, [techId]);

  const fetchTechnician = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const res = await technicianAPI.getById(token, techId);
      if (res.success) setTech(res.data);
    } catch (err) {
      console.error("Error fetching technician:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!canView("technicians")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view technicians.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  if (!tech) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-muted-foreground">Technician not found</p>
          <Link href="/technician/list">
            <Button className="mt-4">Back to Technicians</Button>
          </Link>
        </div>
      </div>
    );
  }

  const certs        = typeof tech.certifications === "string"
    ? JSON.parse(tech.certifications) : (tech.certifications ?? []);
  const areas        = typeof tech.serviceAreas === "string"
    ? JSON.parse(tech.serviceAreas) : (tech.serviceAreas ?? []);
  const bankAccounts = tech.bankAccounts ?? [];
  const rawDocuments = (tech as any).documents;
  const documents    = typeof rawDocuments === "string"
    ? JSON.parse(rawDocuments)
    : (rawDocuments ?? []);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  // ✅ Build photo URL correctly (strip /api from base URL)

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-6xl">

        {/* Back + Edit */}
        <div className="mb-6">
          <Button onClick={() => router.push("/technician/list")}
            className="mb-4 bg-red-700 hover:bg-red-800 text-white">
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Technician Details</h1>
              <p className="text-muted-foreground mt-1">Complete information for {tech.name}</p>
            </div>
            <PermissionGate module="technicians" action="update">
              <Link href={`/technician/edit?id=${tech.id}`}>
                <Button className="bg-red-700 hover:bg-red-800 text-white">
                  <Edit className="h-4 w-4 mr-2" />Edit Technician
                </Button>
              </Link>
            </PermissionGate>
          </div>
        </div>

        {/* Header Card */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-20 w-20 shrink-0">
                {/* ✅ FIXED: photo URL uses baseUrl (no /api suffix) */}
                <AvatarImage
                  src={tech.photoUrl ? resolveAssetUrl(tech.photoUrl) : undefined}
                  alt={tech.name}
                />
                <AvatarFallback className="text-xl">{getInitials(tech.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold">{tech.name}</h2>
                  {/* ✅ REMOVED: technicianNo badge */}
                </div>
                {/* ✅ REMOVED: gender display */}
                <p className="text-muted-foreground text-sm mb-3">{tech.specialization}</p>
                <Badge variant={tech.isActive ? "default" : "secondary"}>
                  {tech.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">

          {/* Contact */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Contact Information</h3>
              </div>
              <div className="space-y-3">
                <InfoRow label="Mobile"   value={tech.mobile} />
                <InfoRow label="Email"    value={tech.email} />
                <InfoRow label="Address"  value={[tech.address1, tech.address2, tech.address3].filter(Boolean).join(", ")} />
                <InfoRow label="City"     value={tech.city} />
                <InfoRow label="State"    value={tech.state} />
                <InfoRow label="PIN Code" value={tech.pinCode} />
              </div>
            </CardContent>
          </Card>

          {/* Tax */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Tax Information</h3>
              </div>
              <div className="space-y-3">
                {/* ✅ ADDED: GST Number */}
                <InfoRow label="GST Number" value={tech.gstNumber} />
                <InfoRow label="PAN Number" value={tech.panNo} />
                <InfoRow label="Aadhaar"    value={tech.uidNo} />
              </div>
            </CardContent>
          </Card>

          {/* Technical */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Technical Details</h3>
              </div>
              <div className="space-y-3">
                <InfoRow label="Specialization" value={tech.specialization} />
                <InfoRow label="Experience"     value={tech.experience != null ? `${tech.experience} years` : null} />
                <InfoRow label="Joining Date"   value={tech.joiningDate ? new Date(tech.joiningDate).toLocaleDateString("en-IN") : null} />
                {/* ✅ REMOVED: Vehicle No. and Driving License */}

                {certs.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Certifications:</p>
                    <div className="flex flex-wrap gap-2">
                      {certs.map((c: string, i: number) => (
                        <Badge key={i} variant="secondary"><Award className="h-3 w-3 mr-1" />{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {areas.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Service Areas:</p>
                    <div className="flex flex-wrap gap-2">
                      {areas.map((a: string, i: number) => (
                        <Badge key={i} variant="outline"><MapPinned className="h-3 w-3 mr-1" />{a}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bank Accounts — multiple, primary highlighted */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Bank Accounts</h3>
              </div>
              {bankAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bank accounts added</p>
              ) : (
                <div className="space-y-4">
                  {bankAccounts.map((bank: any, i: number) => (
                    <div key={bank.id || i} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{bank.bankName}</p>
                        {bank.isPrimary && <Badge className="text-xs">Primary</Badge>}
                      </div>
                      <InfoRow label="Branch"         value={bank.bankBranch} />
                      <InfoRow label="Account No."    value={bank.accountNo} />
                      <InfoRow label="IFSC"           value={bank.ifscCode} />
                      <InfoRow label="Account Holder" value={bank.accountHolderName} />
                      <InfoRow label="Account Type"   value={bank.accountType} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          {documents.length > 0 && (
            <Card className="border-border/50 shadow-sm md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">Documents</h3>
                </div>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {documents.map((doc: any) => (
                    <a
                      key={doc.id}
                      href={resolveAssetUrl(doc.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border rounded-lg p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.documentName}</p>
                        <Badge variant="secondary" className="text-xs mt-1">{doc.documentType}</Badge>
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}

export default function TechnicianViewPage() {
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
          <TechnicianViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
