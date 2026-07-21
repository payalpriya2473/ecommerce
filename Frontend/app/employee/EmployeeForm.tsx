"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Upload, Plus, X } from "lucide-react";
import { INDIAN_STATES, WEEKLY_OFFS } from "@/lib/indian-states";
import { validatePAN, validateAadhaar, validateIFSC } from "@/lib/qr-code";
import {
  companyAPI, departmentAPI, designationAPI,
  Company, Department, Designation,
} from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface EmployeeFormValues {
  // Org
  companyId: string;
  departmentId: string;
  designationId: string;
  // Basic
  employeeNo: string;
  name: string;
  gender: "male" | "female";
  // Permanent Address
  permanentAddress1: string;
  permanentAddress2: string;
  permanentAddress3: string;
  permanentCity: string;
  permanentPhone: string;
  // Local Address
  localAddress1: string;
  localAddress2: string;
  localAddress3: string;
  localCity: string;
  localPhone: string;
  // Contact
  mobile: string;
  email: string;
  // Emergency
  emergencyContactNo: string;
  emergencyContactPerson: string;
  reference1: string;
  reference2: string;
  // Identity
  panNo: string;
  uidNo: string;
  // Work schedule
  weeklyOff: string;
  inTime: string;
  outTime: string;
  graceMinutes: string;
  // Employee IDs
  pfNo: string;
  esiNo: string;
  // Dates
  birthDate: string;
  joiningDate: string;
  resignDate: string;
  // Salary
  basicSalary: string;
  spa: string;
  hra: string;
  conveyance: string;
  medical: string;
  machineNo: string;
  // Bank
  bankName: string;
  bankBranch: string;
  accountNo: string;
  ifscCode: string;
  // User access
  userId: string;
  marketCategory: string;
  callSlab: string;
}

export const EMPTY_EMPLOYEE_FORM: EmployeeFormValues = {
  companyId: "", departmentId: "", designationId: "",
  employeeNo: "", name: "", gender: "male",
  permanentAddress1: "", permanentAddress2: "", permanentAddress3: "",
  permanentCity: "", permanentPhone: "",
  localAddress1: "", localAddress2: "", localAddress3: "",
  localCity: "", localPhone: "",
  mobile: "", email: "",
  emergencyContactNo: "", emergencyContactPerson: "",
  reference1: "", reference2: "",
  panNo: "", uidNo: "",
  weeklyOff: "", inTime: "09:00", outTime: "18:00", graceMinutes: "15",
  pfNo: "", esiNo: "",
  birthDate: "", joiningDate: "", resignDate: "",
  basicSalary: "", spa: "", hra: "", conveyance: "", medical: "",
  machineNo: "",
  bankName: "", bankBranch: "", accountNo: "", ifscCode: "",
  userId: "", marketCategory: "", callSlab: "",
};

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

export function validateEmployeeForm(values: EmployeeFormValues): string {
  if (!values.companyId || !values.departmentId || !values.designationId)
    return "Please select company, department, and designation";
  if (!values.employeeNo.trim() || !values.name.trim() || !values.mobile.trim())
    return "Employee No., Name, and Mobile are required";
  if (values.panNo && !validatePAN(values.panNo))
    return "Invalid PAN number format";
  if (values.uidNo && !validateAadhaar(values.uidNo))
    return "Invalid Aadhaar number format (12 digits)";
  if (values.ifscCode && !validateIFSC(values.ifscCode))
    return "Invalid IFSC code format";
  return "";
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface EmployeeFormProps {
  mode: "add" | "edit";
  values: EmployeeFormValues;
  onChange: (updated: Partial<EmployeeFormValues>) => void;
  // Photo
  photoPreview: string;
  onPhotoChange: (file: File, preview: string) => void;
  // Documents — only rendered in add mode
  documents?: Array<{ id: string; name: string; fileName: string }>;
  onDocumentsChange?: (docs: Array<{ id: string; name: string; fileName: string }>) => void;
  // Actions
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string;
}

// ─────────────────────────────────────────────────────────────
// Helper label wrapper
// ─────────────────────────────────────────────────────────────

function F({
  label, required, className, children,
}: {
  label: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label className="font-semibold text-sm text-foreground">
        {label}{required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main shared form component
// Add any new field here → automatically appears on both Add and Edit
// ─────────────────────────────────────────────────────────────

export function EmployeeFormFields({
  mode, values, onChange,
  photoPreview, onPhotoChange,
  documents = [], onDocumentsChange,
  onSubmit, onCancel, isSubmitting, error,
}: EmployeeFormProps) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);

  const set = <K extends keyof EmployeeFormValues>(field: K, val: EmployeeFormValues[K]) =>
    onChange({ [field]: val });

  // ── Load master data ───────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const token = sessionStorage.getItem("authToken");
      const role = sessionStorage.getItem("userRole");
      const storedCompanyId = sessionStorage.getItem("companyId");
      setUserRole(role);
      if (!token) return;

      // Super admin gets company dropdown
      if (role === "super_admin") {
        const res = await companyAPI.getAll(token);
        if (res.success) setCompanies(res.data);
      }

      // Non-super-admin add mode: auto-set companyId + load departments
      if (mode === "add" && role !== "super_admin" && storedCompanyId) {
        if (!values.companyId) onChange({ companyId: storedCompanyId });
        const dRes = await departmentAPI.getAll(token, storedCompanyId);
        if (dRes.success) setDepartments(dRes.data);
      }

      // Edit mode: load departments + designations for already-populated IDs
      if (mode === "edit" && values.companyId) {
        const dRes = await departmentAPI.getAll(token, values.companyId);
        if (dRes.success) setDepartments(dRes.data);
        if (values.departmentId) {
          const dgRes = await designationAPI.getAll(token, values.companyId, values.departmentId);
          if (dgRes.success) setDesignations(dgRes.data);
        }
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Cascade: company → departments
  const handleCompanyChange = async (companyId: string) => {
    onChange({ companyId, departmentId: "", designationId: "" });
    setDepartments([]); setDesignations([]);
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    const res = await departmentAPI.getAll(token, companyId);
    if (res.success) setDepartments(res.data);
  };

  // Cascade: department → designations
  const handleDepartmentChange = async (departmentId: string) => {
    onChange({ departmentId, designationId: "" });
    setDesignations([]);
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    const res = await designationAPI.getAll(token, values.companyId, departmentId);
    if (res.success) setDesignations(res.data);
  };

  // Photo handler
  const handlePhotoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => onPhotoChange(file, reader.result as string);
    reader.readAsDataURL(file);
  };

  const createDocumentRow = () => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    fileName: "",
  });

  // Document helpers (add mode only)
  const addDoc = () => onDocumentsChange?.([...documents, createDocumentRow()]);
  const removeDoc = (i: number) => onDocumentsChange?.(documents.filter((_, idx) => idx !== i));
  const updateDoc = (
    i: number,
    field: "name" | "fileName",
    val: string,
  ) => {
    const next = [...documents];
    next[i][field] = val;
    onDocumentsChange?.(next);
  };

  return (
    <div className="space-y-6">

      {/* ── Photo ────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted shrink-0 overflow-hidden">
          {photoPreview
            ? <img src={photoPreview} alt="Employee" className="h-full w-full object-cover rounded-lg" />
            : <Upload className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => document.getElementById("emp-photo-input")?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            {photoPreview ? "Change Photo" : "Upload Photo"}
          </Button>
          <input
            id="emp-photo-input"
            type="file"
            accept="image/jpeg,image/png,image/jpg"
            onChange={handlePhotoInput}
            className="hidden"
          />
          <p className="text-xs text-muted-foreground mt-1">Max 2 MB · JPG/PNG</p>
        </div>
      </div>

      {/* ── Organization Details ──────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Organization Details</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {userRole === "super_admin" && (
            <F label="Company" required>
              <Select value={values.companyId} onValueChange={handleCompanyChange}>
                <SelectTrigger className="w-full h-10 bg-background">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>
          )}
          <F label="Department" required>
            <Select
              value={values.departmentId}
              onValueChange={handleDepartmentChange}
              disabled={!values.companyId}
            >
              <SelectTrigger className="w-full h-10 bg-background">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Designation" required>
            <Select
              value={values.designationId}
              onValueChange={(v) => set("designationId", v)}
              disabled={!values.departmentId}
            >
              <SelectTrigger className="w-full h-10 bg-background">
                {/* <SelectValue placeholder="Select designation" /> */}
              </SelectTrigger>
              <SelectContent>
                {designations.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name} (Level {d.level})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
        </div>
      </div>

      {/* ── Basic Information ─────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <F label="Employee No." required>
            <Input
              value={values.employeeNo}
              onChange={(e) => set("employeeNo", e.target.value)}
            />
          </F>
          <F label="Name" required className="md:col-span-2">
            <Input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </F>
        </div>
        <div className="space-y-2">
          <Label className="font-semibold text-sm">
            Gender <span className="text-destructive">*</span>
          </Label>
          <RadioGroup
            value={values.gender}
            onValueChange={(v) => set("gender", v as "male" | "female")}
            className="flex gap-4"
          >
            {(["male", "female"] as const).map((v) => (
              <div key={v} className="flex items-center space-x-2">
                <RadioGroupItem value={v} id={`gender-${v}`} />
                <Label htmlFor={`gender-${v}`} className="font-normal cursor-pointer capitalize">{v}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>

      {/* ── Address Details ───────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Address Details</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Permanent */}
          <div className="space-y-3 rounded-xl border border-border/60 p-4">
            <p className="text-lg font-semibold">Permanent Address</p>
            <F label="Address Line 1">
              <Input
                value={values.permanentAddress1}
                onChange={(e) => set("permanentAddress1", e.target.value)}
                
              />
            </F>
            <F label="Address Line 2">
              <Input
                value={values.permanentAddress2}
                onChange={(e) => set("permanentAddress2", e.target.value)}
                
              />
            </F>
            <F label="Address Line 3">
              <Input
                value={values.permanentAddress3}
                onChange={(e) => set("permanentAddress3", e.target.value)}
                
              />
            </F>
            <F label="State / City">
            <Select value={values.permanentCity} onValueChange={(v) => set("permanentCity", v)}>
              <SelectTrigger className="w-full h-10">
                <SelectValue />
                
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            </F>
            <F label="Phone">
              <Input
                value={values.permanentPhone}
                onChange={(e) => set("permanentPhone", e.target.value)}
                
              />
            </F>
          </div>
          {/* Local */}
          <div className="space-y-3 rounded-xl border border-border/60 p-4">
            <p className="text-lg font-semibold">Local Address</p>
            <F label="Address Line 1">
              <Input
                value={values.localAddress1}
                onChange={(e) => set("localAddress1", e.target.value)}
                
              />
            </F>
            <F label="Address Line 2">
              <Input
                value={values.localAddress2}
                onChange={(e) => set("localAddress2", e.target.value)}
                
              />
            </F>
            <F label="Address Line 3">
              <Input
                value={values.localAddress3}
                onChange={(e) => set("localAddress3", e.target.value)}
                
              />
            </F>
            <F label="State / City">
            <Select value={values.localCity} onValueChange={(v) => set("localCity", v)}>
              <SelectTrigger className="w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            </F>
            <F label="Phone">
              <Input
                value={values.localPhone}
                onChange={(e) => set("localPhone", e.target.value)}
                
              />
            </F>
          </div>
        </div>
      </div>

      {/* ── Contact Information ───────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Contact Information</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <F label="Mobile" required>
            <Input
              value={values.mobile}
              onChange={(e) => set("mobile", e.target.value)}
            />
          </F>
          <F label="Email" className="md:col-span-2">
            <Input
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </F>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <F label="Emergency No.">
            <Input value={values.emergencyContactNo}
              onChange={(e) => set("emergencyContactNo", e.target.value)}
            />
          </F>
          <F label="Person">
            <Input value={values.emergencyContactPerson}
              onChange={(e) => set("emergencyContactPerson", e.target.value)}
            />
          </F>
          <F label="Ref [1]">
            <Input value={values.reference1}
              onChange={(e) => set("reference1", e.target.value)} />
          </F>
          <F label="Ref [2]">
            <Input value={values.reference2}
              onChange={(e) => set("reference2", e.target.value)} />
          </F>
        </div>
      </div>

      {/* ── Identity & Work Schedule ──────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Identity & Work Schedule</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <F label="PAN No.">
            <Input
              value={values.panNo}
              onChange={(e) => set("panNo", e.target.value.toUpperCase())}
              maxLength={10}
            />
          </F>
          <F label="UID No. (Aadhaar)">
            <Input
              value={values.uidNo}
              onChange={(e) => set("uidNo", e.target.value)}
              maxLength={12}
            />
          </F>
          <F label="PF No.">
            <Input value={values.pfNo}
              onChange={(e) => set("pfNo", e.target.value)} />
          </F>
          <F label="ESI No.">
            <Input value={values.esiNo}
              onChange={(e) => set("esiNo", e.target.value)} />
          </F>
        </div>
        <div className="grid md:grid-cols-5 gap-4">
          <F label="Weekly Off">
            <Select value={values.weeklyOff} onValueChange={(v) => set("weeklyOff", v)}>
              <SelectTrigger className="w-full h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKLY_OFFS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="In Time">
            <Input type="time" value={values.inTime}
              onChange={(e) => set("inTime", e.target.value)} />
          </F>
          <F label="Out Time">
            <Input type="time" value={values.outTime}
              onChange={(e) => set("outTime", e.target.value)} />
          </F>
          <F label="Grace Min.">
            <Input type="number" value={values.graceMinutes}
              onChange={(e) => set("graceMinutes", e.target.value)} />
          </F>
          <F label="Machine #">
            <Input value={values.machineNo}
              onChange={(e) => set("machineNo", e.target.value)} />
          </F>
        </div>
      </div>

      {/* ── Important Dates ───────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Important Dates</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <F label="Birth Date">
            <Input type="date" value={values.birthDate}
              onChange={(e) => set("birthDate", e.target.value)} />
          </F>
          <F label="Joining Date">
            <Input type="date" value={values.joiningDate}
              onChange={(e) => set("joiningDate", e.target.value)} />
          </F>
          <F label="Resign Date">
            <Input type="date" value={values.resignDate}
              onChange={(e) => set("resignDate", e.target.value)} />
          </F>
        </div>
      </div>

      {/* ── Salary Components ─────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Salary Components</h3>
        <div className="grid md:grid-cols-5 gap-4">
          {([
            ["basicSalary", "Basic"],
            ["spa",         "SPA"],
            ["hra",         "HRA"],
            ["conveyance",  "Conv."],
            ["medical",     "Medical"],
          ] as const).map(([field, label]) => (
            <F key={field} label={label}>
              <Input
                type="number"
                value={values[field]}
                onChange={(e) => set(field, e.target.value)}
              />
            </F>
          ))}
        </div>
      </div>

      {/* ── Bank Details ──────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Bank Details</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <F label="Bank">
            <Input value={values.bankName}
              onChange={(e) => set("bankName", e.target.value)} />
          </F>
          <F label="Branch">
            <Input value={values.bankBranch}
              onChange={(e) => set("bankBranch", e.target.value)} />
          </F>
          <F label="A/C No.">
            <Input value={values.accountNo}
              onChange={(e) => set("accountNo", e.target.value)} />
          </F>
          <F label="IFS Code">
            <Input
              value={values.ifscCode}
              onChange={(e) => set("ifscCode", e.target.value.toUpperCase())}
              maxLength={11}
            />
          </F>
        </div>
      </div>

      {/* ── User Access & Categories ──────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">User Access & Categories</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <F label="User ID">
            <Input value={values.userId}
              onChange={(e) => set("userId", e.target.value)} />
          </F>
          <F label="Mkt Category">
            <Input value={values.marketCategory}
              onChange={(e) => set("marketCategory", e.target.value)} />
          </F>
          <F label="Call Slab">
            <Input value={values.callSlab}
              onChange={(e) => set("callSlab", e.target.value)} />
          </F>
        </div>
      </div>

      {/* ── Documents (add mode only) ─────────────────────── */}
      {mode === "add" && onDocumentsChange && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2 gap-3">
            <div className="space-y-1">
              <h3 className="font-semibold text-lg">Documents</h3>
              <p className="text-xs text-muted-foreground">
                Add a label for each file. Click upload to save the draft rows.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={addDoc}
              className="bg-red-700 hover:bg-red-800 text-white rounded-lg shadow-sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Documents
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            Accepted: PDF, JPG, PNG, DOC, XLS — Max 2 MB each — Up to 10 files
          </div>

          {documents.length > 0 && (
            <div className="space-y-4">
              {documents.map((doc, i) => {
                const inputId = `employee-doc-${doc.id}`;
                return (
                  <div
                    key={doc.id}
                    className="flex flex-col md:flex-row md:items-end gap-3"
                  >
                    <div className="space-y-2 min-w-0 md:flex-[1.15]">
                      <Label className="font-semibold text-sm text-foreground">Document Name</Label>
                      <Input
                        value={doc.name}
                        onChange={(e) => updateDoc(i, "name", e.target.value)}
                        placeholder="e.g. Policy Copy"
                      />
                    </div>

                    <div className="space-y-2 min-w-0 md:flex-[1]">
                      <Label className="font-semibold text-sm text-foreground">Choose File</Label>
                      <label
                        htmlFor={inputId}
                        className="flex items-center overflow-hidden rounded-lg border border-border bg-white cursor-pointer"
                      >
                        <span className="shrink-0 border-r border-border bg-slate-100 px-4 py-2 text-sm font-semibold text-red-700">
                          Browse...
                        </span>
                        <span className={`min-w-0 flex-1 px-4 py-2 text-sm truncate ${doc.fileName ? "text-slate-900" : "text-slate-400"}`}>
                          {doc.fileName || "No file selected."}
                        </span>
                        <input
                          id={inputId}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            updateDoc(i, "fileName", file.name);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <p className="text-xs text-muted-foreground">Max 2 MB</p>
                    </div>

                    <div className="shrink-0 md:pb-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeDoc(i)}
                        className="h-10 w-10 border-red-200 text-destructive hover:bg-red-50 hover:text-red-600"
                        aria-label="Remove document"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={addDoc}
            className="h-10 w-fit px-4 border-border bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-lg"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Another Document
          </Button>
        </div>
      )}

      {/* 👇 Add new employee-wide fields here — appear on both Add and Edit automatically */}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Submit / Cancel ───────────────────────────────── */}
      <div className="flex gap-4 pt-2">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-red-700 hover:bg-red-800 text-white"
        >
          {isSubmitting
            ? mode === "add" ? "Registering..." : "Updating..."
            : mode === "add" ? "Register Employee" : "Update Employee"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
