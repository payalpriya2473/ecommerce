"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { AlertCircle, Upload, Plus, X, Trash2, FileText } from "lucide-react";
import { INDIAN_STATES } from "@/lib/indian-states";
import { validatePAN, validateAadhaar, validateIFSC } from "@/lib/qr-code";



export interface BankAccount {
  id: string;
  bankName: string;
  bankBranch: string;
  accountNo: string;
  ifscCode: string;
  accountHolderName: string;
  accountType: string;
  isPrimary: boolean;
}

export interface NewDoc {
  id: string;
  documentType: string;
  documentName: string;
  file: File;
  preview: string;
}

export interface ExistingDoc {
  id: string;
  documentType: string;
  documentName: string;
  fileUrl: string;
}

export interface TechnicianFormValues {
  name: string;
  mobile: string;
  email: string;
  address1: string;
  address2: string;
  address3: string;
  city: string;
  state: string;
  pinCode: string;
  gstNumber: string;
  panNo: string;
  uidNo: string;
  specialization: string;
  experience: string;
  joiningDate: string;
 
}

export const EMPTY_TECHNICIAN_FORM: TechnicianFormValues = {
  name: "", mobile: "", email: "",
  address1: "", address2: "", address3: "",
  city: "", state: "", pinCode: "",
  gstNumber: "", panNo: "", uidNo: "",
  specialization: "", experience: "", joiningDate: "",
};

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const BLANK_BANK = (): BankAccount => ({
  id: genId(), bankName: "", bankBranch: "", accountNo: "",
  ifscCode: "", accountHolderName: "", accountType: "current", isPrimary: false,
});

const DOC_TYPES = [
  "Aadhaar Card", "PAN Card", "Driving License", "Passport",
  "Vehicle RC", "GST Certificate", "Training Certificate", "Other",
];

export interface TechnicianFormProps {
  mode: "add" | "edit";
  values: TechnicianFormValues;
  onChange: (updated: Partial<TechnicianFormValues>) => void;

  // Photo
  photoPreview: string;          // base64 or URL
  onPhotoChange: (file: File, preview: string) => void;

  // Dynamic lists
  certifications: string[];
  onCertificationsChange: (list: string[]) => void;
  serviceAreas: string[];
  onServiceAreasChange: (list: string[]) => void;

  // Banks
  banks: BankAccount[];
  onBanksChange: (banks: BankAccount[]) => void;

  // Documents
  newDocs: NewDoc[];
  onNewDocsChange: (docs: NewDoc[]) => void;
  existingDocs?: ExistingDoc[];                       
  onDeleteExistingDoc?: (docId: string) => void;        

  // Submit / Cancel
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string;
}



function FL({ htmlFor, children, required, className }: {
  htmlFor?: string; children: React.ReactNode; required?: boolean; className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>
        {children}{required && <span className="text-destructive"> *</span>}
      </Label>
    </div>
  );
}

function F({ label, required, className, children }: {
  label: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}



export function validateTechnicianForm(
  values: TechnicianFormValues,
  banks: BankAccount[],
): string {
  if (!values.name || !values.mobile || !values.specialization)
    return "Name, Mobile, and Specialization are required";
  if (values.panNo && !validatePAN(values.panNo))
    return "Invalid PAN format";
  if (values.uidNo && !validateAadhaar(values.uidNo))
    return "Invalid Aadhaar (12 digits)";
  for (const b of banks)
    if (b.ifscCode && !validateIFSC(b.ifscCode))
      return `Invalid IFSC: ${b.ifscCode}`;
  return "";
}


// THE SHARED TECHNICIAN FORM


export function TechnicianFormFields({
  mode, values, onChange,
  photoPreview, onPhotoChange,
  certifications, onCertificationsChange,
  serviceAreas, onServiceAreasChange,
  banks, onBanksChange,
  newDocs, onNewDocsChange,
  existingDocs = [], onDeleteExistingDoc,
  onSubmit, onCancel, isSubmitting, error,
}: TechnicianFormProps) {
  const docInputRef = useRef<HTMLInputElement>(null);
  const [newCertification, setNewCertification] = useState("");
  const [newServiceArea, setNewServiceArea] = useState("");
  const [newDocType, setNewDocType] = useState("Aadhaar Card");
  const [newDocName, setNewDocName] = useState("");

  const set = (field: keyof TechnicianFormValues, value: string) =>
    onChange({ [field]: value });

  // ── Photo ─────────────────────────────────────────────────
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onPhotoChange(file, reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Certifications ────────────────────────────────────────
  const addCert = () => {
    if (!newCertification.trim()) return;
    onCertificationsChange([...certifications, newCertification.trim()]);
    setNewCertification("");
  };
  const removeCert = (i: number) =>
    onCertificationsChange(certifications.filter((_, idx) => idx !== i));

  // ── Service Areas ─────────────────────────────────────────
  const addArea = () => {
    if (!newServiceArea.trim()) return;
    onServiceAreasChange([...serviceAreas, newServiceArea.trim()]);
    setNewServiceArea("");
  };
  const removeArea = (i: number) =>
    onServiceAreasChange(serviceAreas.filter((_, idx) => idx !== i));

  // ── Banks ─────────────────────────────────────────────────
  const addBank = () => onBanksChange([...banks, BLANK_BANK()]);
  const updateBank = (id: string, field: keyof BankAccount, value: string | boolean) =>
    onBanksChange(banks.map((b) => {
      if (b.id === id) return { ...b, [field]: value };
      if (field === "isPrimary" && value === true) return { ...b, isPrimary: false };
      return b;
    }));
  const removeBank = (id: string) => {
    const wasPrimary = banks.find((b) => b.id === id)?.isPrimary;
    const next = banks.filter((b) => b.id !== id);
    if (wasPrimary && next.length > 0) next[0].isPrimary = true;
    onBanksChange(next);
  };

  // ── Documents ─────────────────────────────────────────────
  const handleDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const id = `doc-${Date.now()}`;
    const newEntry: NewDoc = {
      id, documentType: newDocType, documentName: newDocName || file.name, file, preview: "",
    };
    const nextDocs = [...newDocs, newEntry];
    onNewDocsChange(nextDocs);

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () =>
        onNewDocsChange(
          nextDocs.map((d) => (d.id === id ? { ...d, preview: reader.result as string } : d)),
        );
      reader.readAsDataURL(file);
    }

    setNewDocName("");
    if (docInputRef.current) docInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">

      {/* ── Basic Information ────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
        <F label="Name" required>
          <Input value={values.name} onChange={(e) => set("name", e.target.value)}
          />
        </F>
      </div>

      {/* ── Contact Information ──────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Contact Information</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <F label="Mobile" required>
            <Input value={values.mobile} onChange={(e) => set("mobile", e.target.value)}
            />
          </F>
          <F label="Email">
            <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)}
            />
          </F>
        </div>
        <F label="Address">
          <Input value={values.address1} onChange={(e) => set("address1", e.target.value)}
          />
        </F>
        <div className="grid md:grid-cols-2 gap-4">
          <F label="Address Line 2">
            <Input value={values.address2} onChange={(e) => set("address2", e.target.value)}
            />
          </F>
          <F label="Address Line 3">
            <Input value={values.address3} onChange={(e) => set("address3", e.target.value)}
            />
          </F>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <F label="City">
            <Input value={values.city} onChange={(e) => set("city", e.target.value)}
            />
          </F>
          <F label="State">
            <Select value={values.state} onValueChange={(v) => set("state", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="PIN Code">
            <Input value={values.pinCode} onChange={(e) => set("pinCode", e.target.value)}
              maxLength={6} />
          </F>
        </div>
      </div>

      {/* ── Tax Information ──────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Tax Information</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <F label="GST Number">
            <Input value={values.gstNumber}
              onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
              maxLength={15} />
          </F>
          <F label="PAN Number">
            <Input value={values.panNo}
              onChange={(e) => set("panNo", e.target.value.toUpperCase())}
              maxLength={10} />
          </F>
        </div>
        <F label="Aadhaar Number (UID)">
          <Input value={values.uidNo} onChange={(e) => set("uidNo", e.target.value)}
            maxLength={12} />
        </F>
      </div>

      {/* ── Bank Information ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Bank Information</h3>
          <Button type="button" size="sm" onClick={addBank}
            className="bg-red-700 hover:bg-red-800 text-white">
            <Plus className="h-4 w-4 mr-1" />Add Bank
          </Button>
        </div>
        {banks.map((bank, idx) => (
          <Card key={bank.id} className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Bank Account {idx + 1}</h4>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox id={`primary-${bank.id}`} checked={bank.isPrimary}
                      onCheckedChange={(v) => updateBank(bank.id, "isPrimary", v as boolean)} />
                    <Label htmlFor={`primary-${bank.id}`} className="text-sm cursor-pointer">Primary</Label>
                  </div>
                  {banks.length > 1 && (
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => removeBank(bank.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <F label="Bank Name">
                  <Input value={bank.bankName}
                    onChange={(e) => updateBank(bank.id, "bankName", e.target.value)}
                  />
                </F>
                <F label="Branch">
                  <Input value={bank.bankBranch}
                    onChange={(e) => updateBank(bank.id, "bankBranch", e.target.value)}
                  />
                </F>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <F label="Account Number">
                  <Input value={bank.accountNo}
                    onChange={(e) => updateBank(bank.id, "accountNo", e.target.value)}
                  />
                </F>
                <F label="IFSC Code">
                  <Input value={bank.ifscCode}
                    onChange={(e) => updateBank(bank.id, "ifscCode", e.target.value.toUpperCase())}
                    maxLength={11} />
                </F>
                <F label="Account Type">
                  <Select value={bank.accountType}
                    onValueChange={(v) => updateBank(bank.id, "accountType", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>
              <F label="Account Holder Name">
                <Input value={bank.accountHolderName}
                  onChange={(e) => updateBank(bank.id, "accountHolderName", e.target.value)}
                />
              </F>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Technical Details ────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Technical Details</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <F label="Specialization" required>
            <Input value={values.specialization}
              onChange={(e) => set("specialization", e.target.value)}
            />
          </F>
          <F label="Experience (Years)">
            <Input type="number" value={values.experience}
              onChange={(e) => set("experience", e.target.value)}
              min={0} />
          </F>
        </div>
        <F label="Joining Date" className="max-w-xs">
          <Input type="date" value={values.joiningDate}
            onChange={(e) => set("joiningDate", e.target.value)} />
        </F>

        {/* Certifications */}
        <div className="space-y-2">
          <Label>Certifications</Label>
          <div className="flex gap-2">
            <Input value={newCertification}
              onChange={(e) => setNewCertification(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCert(); } }} />
            <Button type="button" size="sm"
              className="bg-red-700 hover:bg-red-800 text-white shrink-0" onClick={addCert}>
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>
          {certifications.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {certifications.map((c, i) => (
                <Badge key={i} variant="secondary" className="gap-1 px-3 py-1 text-sm">
                  {c}
                  <button type="button" onClick={() => removeCert(i)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Service Areas */}
        <div className="space-y-2">
          <Label>Service Areas</Label>
          <div className="flex gap-2">
            <Input value={newServiceArea}
              onChange={(e) => setNewServiceArea(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArea(); } }} />
            <Button type="button" size="sm"
              className="bg-red-700 hover:bg-red-800 text-white shrink-0" onClick={addArea}>
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </div>
          {serviceAreas.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {serviceAreas.map((a, i) => (
                <Badge key={i} variant="secondary" className="gap-1 px-3 py-1 text-sm">
                  {a}
                  <button type="button" onClick={() => removeArea(i)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        {/* 👇 Add new technical fields here */}
      </div>

      {/* ── Documents ────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Documents</h3>

        {/* Existing docs (edit mode only) */}
        {existingDocs.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-2">Existing Documents</p>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {existingDocs.map((doc) => (
                <div key={doc.id}
                  className="border rounded-lg p-3 flex items-start gap-3 relative group">
                  <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.documentName}</p>
                    <Badge variant="secondary" className="text-xs mt-1">{doc.documentType}</Badge>
                  </div>
                  {onDeleteExistingDoc && (
                    <button type="button" onClick={() => onDeleteExistingDoc(doc.id)}
                      className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload new docs */}
        <div className="border-2 border-dashed rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {existingDocs.length > 0 ? "Add New Documents" : "Upload Documents"} — JPG, PNG, PDF · max 5 MB each
          </p>
          <div className="grid md:grid-cols-3 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Document Type</Label>
              <Select value={newDocType} onValueChange={setNewDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label (optional)</Label>
              <Input value={newDocName} onChange={(e) => setNewDocName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">File</Label>
              <Button type="button" variant="outline" className="w-full"
                onClick={() => docInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />Browse &amp; Upload
              </Button>
              <input ref={docInputRef} type="file"
                accept="image/jpeg,image/png,image/jpg,application/pdf"
                onChange={handleDocFile} className="hidden" />
            </div>
          </div>
        </div>

        {/* New doc previews */}
        {newDocs.length > 0 && (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {newDocs.map((doc) => (
              <div key={doc.id}
                className={`border rounded-lg p-3 flex items-start gap-3 relative group ${
                  mode === "edit" ? "border-dashed border-green-400" : ""
                }`}>
                <div className="h-14 w-14 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                  {doc.preview
                    ? <img src={doc.preview} alt={doc.documentName} className="h-full w-full object-cover" />
                    : <FileText className="h-7 w-7 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.documentName}</p>
                  <Badge variant="secondary" className="text-xs mt-1">{doc.documentType}</Badge>
                  {mode === "edit"
                    ? <p className="text-xs text-green-600 mt-1">New</p>
                    : <p className="text-xs text-muted-foreground mt-1">{(doc.file.size / 1024).toFixed(1)} KB</p>}
                </div>
                <button type="button"
                  onClick={() => onNewDocsChange(newDocs.filter((d) => d.id !== doc.id))}
                  className="absolute top-2 right-2 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>


      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Submit / Cancel ──────────────────────────────── */}
      <div className="flex gap-4 pt-2">
        <Button type="button" onClick={onSubmit} disabled={isSubmitting}
          className="flex-1 bg-red-700 hover:bg-red-800 text-white">
          {isSubmitting
            ? (mode === "add" ? "Registering..." : "Updating...")
            : (mode === "add" ? "Register Technician" : "Update Technician")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}
          disabled={isSubmitting} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Photo Upload Header Widget — used by both register & edit
// ─────────────────────────────────────────────────────────────

export function TechnicianPhotoUpload({
  photoPreview,
  onPhotoChange,
  inputId = "photo-upload",
}: {
  photoPreview: string;
  onPhotoChange: (file: File, preview: string) => void;
  inputId?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return; // parent should show error
    const reader = new FileReader();
    reader.onloadend = () => onPhotoChange(file, reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="h-24 w-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted overflow-hidden">
        {photoPreview
          ? <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
          : <Upload className="h-6 w-6 text-muted-foreground" />}
      </div>
      <div>
        <Button type="button" variant="outline" size="sm"
          onClick={() => document.getElementById(inputId)?.click()}>
          <Upload className="h-4 w-4 mr-2" />
          {photoPreview ? "Change Photo" : "Upload Photo"}
        </Button>
        <input id={inputId} type="file" accept="image/jpeg,image/png"
          onChange={handleChange} className="hidden" />
        <p className="text-xs text-muted-foreground mt-1">Max 2 MB · JPG/PNG</p>
      </div>
    </div>
  );
}
