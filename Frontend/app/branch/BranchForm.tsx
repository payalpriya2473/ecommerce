"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { INDIAN_STATES } from "@/lib/indian-states";
import { validateGST, validatePAN, validateIFSC } from "@/lib/qr-code";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface BranchFormValues {
  companyId: string; // auto-resolved by register page, preserved in edit
  type: "showroom" | "godown";
  operationModel: "company-operated" | "franchise";
  name: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  contactPhone: string;
  contactEmail: string;
  // Franchise-only (optional)
  gstNumber: string;
  panNumber: string;
  bankName: string;
  bankBranch: string;
  accountNumber: string;
  ifscCode: string;
}

export const EMPTY_BRANCH_FORM: BranchFormValues = {
  companyId: "",
  type: "showroom",
  operationModel: "company-operated",
  name: "",
  address: "",
  city: "",
  state: "",
  pinCode: "",
  contactPhone: "",
  contactEmail: "",
  gstNumber: "",
  panNumber: "",
  bankName: "",
  bankBranch: "",
  accountNumber: "",
  ifscCode: "",
};

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

export function validateBranchForm(values: BranchFormValues): string {
  if (!values.companyId) return "No company found. Please register a company first.";
  if (!values.name.trim()) return "Branch name is required";
  if (!values.pinCode.match(/^\d{6}$/)) return "PIN code must be 6 digits";
  if (!values.contactPhone.trim()) return "Contact phone is required";
  if (!values.contactEmail.trim()) return "Contact email is required";

  if (values.gstNumber && !validateGST(values.gstNumber))
    return "Invalid GST number format. Expected: 22AAAAA0000A1Z5";
  if (values.panNumber && !validatePAN(values.panNumber))
    return "Invalid PAN number format. Expected: AAAAA0000A";
  if (values.ifscCode && !validateIFSC(values.ifscCode))
    return "Invalid IFSC code format. Expected: AAAA0AAAAAA";

  return "";
}

// ─────────────────────────────────────────────────────────────
// Build API payload (nulls out franchise fields if not franchise)
// ─────────────────────────────────────────────────────────────

export function buildBranchPayload(values: BranchFormValues) {
  const isFranchise = values.operationModel === "franchise";
  return {
    companyId:      values.companyId,
    name:           values.name,
    type:           values.type,
    operationModel: values.operationModel,
    address:        values.address,
    city:           values.city,
    state:          values.state,
    pinCode:        values.pinCode,
    contactPhone:   values.contactPhone,
    contactEmail:   values.contactEmail,
    gstNumber:      isFranchise ? (values.gstNumber     || null) : null,
    panNumber:      isFranchise ? (values.panNumber     || null) : null,
    bankName:       isFranchise ? (values.bankName      || null) : null,
    bankBranch:     isFranchise ? (values.bankBranch    || null) : null,
    accountNumber:  isFranchise ? (values.accountNumber || null) : null,
    ifscCode:       isFranchise ? (values.ifscCode      || null) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface BranchFormProps {
  mode: "add" | "edit";
  values: BranchFormValues;
  onChange: (updated: Partial<BranchFormValues>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string;
}

// ─────────────────────────────────────────────────────────────
// Helper label wrapper
// ─────────────────────────────────────────────────────────────

function F({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main shared form
// companyId is never shown to the user — it is handled silently
// by the register page (auto-fetched) and edit page (from API).
// ─────────────────────────────────────────────────────────────

export function BranchFormFields({
  mode,
  values,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: BranchFormProps) {
  const set = <K extends keyof BranchFormValues>(field: K, val: BranchFormValues[K]) =>
    onChange({ [field]: val });

  const isFranchise = values.operationModel === "franchise";

  return (
    <div className="space-y-6">

      {/* ── Branch Information ───────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Branch Information</h3>

        <F label="Branch Name" required>
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </F>

        <F label="Address" required>
          <Input
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </F>

        <div className="grid md:grid-cols-3 gap-4">
          <F label="City" required>
            <Input
              value={values.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </F>
          <F label="State" required>
            <Select value={values.state} onValueChange={(v) => set("state", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="PIN Code" required>
            <Input
              value={values.pinCode}
              onChange={(e) => set("pinCode", e.target.value)}
              maxLength={6}
            />
          </F>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <F label="Contact Phone" required>
            <Input
              value={values.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </F>
          <F label="Contact Email" required>
            <Input
              type="email"
              value={values.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          </F>
        </div>
      </div>

      {/* ── Branch Type & Model ──────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Branch Type & Model</h3>

        <F label="Branch Type" required>
          <RadioGroup
            value={values.type}
            onValueChange={(v) => set("type", v as BranchFormValues["type"])}
            className="flex gap-4"
          >
            {(["showroom", "godown"] as const).map((v) => (
              <div key={v} className="flex items-center space-x-2">
                <RadioGroupItem value={v} id={`type-${v}`} />
                <Label htmlFor={`type-${v}`} className="font-normal cursor-pointer capitalize">{v}</Label>
              </div>
            ))}
          </RadioGroup>
        </F>

        <F label="Operation Model" required>
          <RadioGroup
            value={values.operationModel}
            onValueChange={(v) => set("operationModel", v as BranchFormValues["operationModel"])}
            className="flex gap-4"
          >
            {([
              ["company-operated", "Company Operated"],
              ["franchise", "Franchise"],
            ] as const).map(([v, l]) => (
              <div key={v} className="flex items-center space-x-2">
                <RadioGroupItem value={v} id={`model-${v}`} />
                <Label htmlFor={`model-${v}`} className="font-normal cursor-pointer">{l}</Label>
              </div>
            ))}
          </RadioGroup>
        </F>
      </div>

      {/* ── Tax & Bank — Franchise only ──────────────────── */}
      {isFranchise && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg border-b pb-2">
            Tax & Bank Information{" "}
            <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            Fill these details if the franchise branch has a separate GST/PAN or bank account.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <F label="GST Number">
              <Input
                value={values.gstNumber}
                onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
                className="font-mono"
                maxLength={15}
              />
            </F>
            <F label="PAN Number">
              <Input
                value={values.panNumber}
                onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
                className="font-mono"
                maxLength={10}
              />
            </F>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <F label="Bank Name">
              <Input
                value={values.bankName}
                onChange={(e) => set("bankName", e.target.value)}
              />
            </F>
            <F label="Branch">
              <Input
                value={values.bankBranch}
                onChange={(e) => set("bankBranch", e.target.value)}
              />
            </F>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <F label="Account Number">
              <Input
                value={values.accountNumber}
                onChange={(e) => set("accountNumber", e.target.value)}
                className="font-mono"
              />
            </F>
            <F label="IFSC Code">
              <Input
                value={values.ifscCode}
                onChange={(e) => set("ifscCode", e.target.value.toUpperCase())}
                className="font-mono"
                maxLength={11}
              />
            </F>
          </div>
        </div>
      )}

      {/* 👇 Add new branch-wide fields here — appear on both Add and Edit automatically */}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Submit / Cancel ──────────────────────────────── */}
      <div className="flex gap-4 pt-2">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-red-700 hover:bg-red-800 text-white"
        >
          {isSubmitting
            ? mode === "add" ? "Registering..." : "Updating..."
            : mode === "add"
              ? `Register ${values.type === "showroom" ? "Showroom" : "Godown"}`
              : "Update Branch"}
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
