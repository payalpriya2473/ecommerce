"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Plus, Trash2, Upload } from "lucide-react";
import { INDIAN_STATES } from "@/lib/indian-states";
import { validateGST, validatePAN, validateIFSC } from "@/lib/qr-code";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string;
  bankName: string;
  bankBranch: string;
  accountNumber: string;
  ifscCode: string;
  accountType: string;
  isPrimary: boolean;
  upiId: string;
}

export interface CompanyFormValues {
  name: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  gstNumber: string;
  panNumber: string;
  udid: string;
  msmeRegistered: boolean;
  msmeNumber: string;
  msmeCategory: string;
  msmeType: string;
  tdsApplicable: boolean;
  tanNumber: string;
  tdsRate: string;
  // Dispatch Instruction
  dispatchName: string;
  dispatchContactPerson: string;
  dispatchContactPhone: string;
}

export const EMPTY_COMPANY_FORM: CompanyFormValues = {
  name: "",
  address: "",
  city: "",
  state: "",
  pinCode: "",
  gstNumber: "",
  panNumber: "",
  udid: "",
  msmeRegistered: false,
  msmeNumber: "",
  msmeCategory: "",
  msmeType: "",
  tdsApplicable: false,
  tanNumber: "",
  tdsRate: "",
  // Dispatch Instruction
  dispatchName: "",
  dispatchContactPerson: "",
  dispatchContactPhone: "",
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const BLANK_BANK = (): BankAccount => ({
  id: generateId(),
  bankName: "",
  bankBranch: "",
  accountNumber: "",
  ifscCode: "",
  accountType: "current",
  isPrimary: false,
  upiId: "",
});

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

export function validateCompanyForm(
  values: CompanyFormValues,
  banks: BankAccount[],
): string {
  if (!values.name) return "Company name is required";
  if (!values.address) return "Address is required";
  if (!values.city) return "City is required";
  if (!values.state) return "State is required";
  if (!values.pinCode.match(/^\d{6}$/)) return "PIN code must be 6 digits";
  if (!validateGST(values.gstNumber)) return "Invalid GST number format. Expected: 22AAAAA0000A1Z5";
  if (!validatePAN(values.panNumber)) return "Invalid PAN number format. Expected: AAAAA0000A";

  if (banks.length === 0 || banks.some((b) => !b.bankName || !b.accountNumber || !b.ifscCode)) {
    return "Please add at least one complete bank account";
  }
  for (const bank of banks) {
    if (!validateIFSC(bank.ifscCode)) {
      return `Invalid IFSC code for ${bank.bankName || "bank"}. Expected: AAAA0AAAAAA`;
    }
  }

  if (values.msmeRegistered && (!values.msmeNumber || !values.msmeCategory || !values.msmeType)) {
    return "Please fill all MSME details if registered";
  }
  if (values.tdsApplicable && (!values.tanNumber || !values.tdsRate)) {
    return "Please fill TAN number and TDS rate if TDS is applicable";
  }

  return "";
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface CompanyFormProps {
  mode: "add" | "edit";
  values: CompanyFormValues;
  onChange: (updated: Partial<CompanyFormValues>) => void;
  banks: BankAccount[];
  onBanksChange: (banks: BankAccount[]) => void;
  // Logo
  logoPreview?: string;
  onLogoChange?: (file: File, preview: string) => void;
  showLogoSection?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string;
}

// ─────────────────────────────────────────────────────────────
// Helper sub-component
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
// Logo Upload Widget
// ─────────────────────────────────────────────────────────────

export function CompanyLogoUpload({
  logoPreview,
  onLogoChange,
  inputId = "company-logo-upload",
}: {
  logoPreview: string;
  onLogoChange: (file: File, preview: string) => void;
  inputId?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return; // 2MB limit
    const reader = new FileReader();
    reader.onloadend = () => onLogoChange(file, reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-4 shrink-0">
      <div className="h-24 w-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted overflow-hidden">
        {logoPreview ? (
          <img src={logoPreview} alt="Company Logo" className="h-full w-full object-contain p-1" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => document.getElementById(inputId)?.click()}
        >
          <Upload className="h-4 w-4 mr-2" />
          {logoPreview ? "Change Logo" : "Upload Logo"}
        </Button>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleChange}
          className="hidden"
        />
        <p className="text-xs text-muted-foreground mt-1">Max 2 MB · JPG/PNG</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main shared form
// ─────────────────────────────────────────────────────────────

export function CompanyFormFields({
  mode,
  values,
  onChange,
  banks,
  onBanksChange,
  logoPreview = "",
  onLogoChange,
  showLogoSection = true,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: CompanyFormProps) {
  const set = <K extends keyof CompanyFormValues>(field: K, value: CompanyFormValues[K]) =>
    onChange({ [field]: value });

  // ── Banks ─────────────────────────────────────────────────
  const addBank = () =>
    onBanksChange([...banks, { ...BLANK_BANK(), isPrimary: banks.length === 0 }]);

  const removeBank = (id: string) => {
    if (banks.length <= 1) return;
    const wasPrimary = banks.find((b) => b.id === id)?.isPrimary;
    const next = banks.filter((b) => b.id !== id);
    if (wasPrimary && next.length > 0) next[0].isPrimary = true;
    onBanksChange(next);
  };

  const updateBank = (id: string, field: keyof BankAccount, value: string | boolean) =>
    onBanksChange(
      banks.map((bank) => {
        if (bank.id === id) return { ...bank, [field]: value };
        if (field === "isPrimary" && value === true) return { ...bank, isPrimary: false };
        return bank;
      }),
    );

  return (
    <div className="space-y-6">

      {/* ── Logo Upload ──────────────────────────────────── */}
      {onLogoChange && showLogoSection && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg border-b pb-2">Company Logo</h3>
          <CompanyLogoUpload
            logoPreview={logoPreview}
            onLogoChange={onLogoChange}
          />
        </div>
      )}

      {/* ── Company Information ──────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Company Information</h3>

        <F label="Company Name" required>
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

        <F label="UDID" className="max-w-xs">
          <Input
            value={values.udid}
            onChange={(e) => set("udid", e.target.value)}
          />
        </F>
      </div>

      {/* ── Tax Information ──────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Tax Information</h3>

        <div className="grid md:grid-cols-2 gap-4">
          <F label="GST Number" required>
            <Input
              value={values.gstNumber}
              onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
              className="font-mono"
              maxLength={15}
            />
          </F>
          <F label="PAN Number" required>
            <Input
              value={values.panNumber}
              onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
              className="font-mono"
              maxLength={10}
            />
          </F>
        </div>
      </div>

      {/* ── Bank Information ─────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Bank Information</h3>
          <Button
            type="button"
            size="sm"
            onClick={addBank}
            className="bg-red-700 hover:bg-red-800 text-white"
          >
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
                    <Checkbox
                      id={`primary-${bank.id}`}
                      checked={bank.isPrimary}
                      onCheckedChange={(v) => updateBank(bank.id, "isPrimary", v as boolean)}
                    />
                    <Label htmlFor={`primary-${bank.id}`} className="text-sm cursor-pointer">
                      Primary
                    </Label>
                  </div>
                  {banks.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBank(bank.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <F label="Bank Name" required>
                  <Input
                    value={bank.bankName}
                    onChange={(e) => updateBank(bank.id, "bankName", e.target.value)}
                  />
                </F>
                <F label="Branch" required>
                  <Input
                    value={bank.bankBranch}
                    onChange={(e) => updateBank(bank.id, "bankBranch", e.target.value)}
                  />
                </F>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <F label="Account Number" required>
                  <Input
                    value={bank.accountNumber}
                    onChange={(e) => updateBank(bank.id, "accountNumber", e.target.value)}
                    className="font-mono"
                  />
                </F>
                <F label="IFSC Code" required>
                  <Input
                    value={bank.ifscCode}
                    onChange={(e) => updateBank(bank.id, "ifscCode", e.target.value.toUpperCase())}
                    className="font-mono"
                    maxLength={11}
                  />
                </F>
                <F label="Account Type">
                  <Select
                    value={bank.accountType}
                    onValueChange={(v) => updateBank(bank.id, "accountType", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                </F>
              </div>

              <F label="UPI ID">
                <Input
                  value={bank.upiId}
                  onChange={(e) => updateBank(bank.id, "upiId", e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {bank.isPrimary
                    ? "Optional — used to generate QR code for payments if provided"
                    : "Optional — UPI ID for this bank account"}
                </p>
              </F>
            </div>
          </Card>
        ))}
      </div>

      {/* ── MSME Information ─────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">MSME Information</h3>

        <div className="flex items-center gap-2">
          <Checkbox
            id="msmeRegistered"
            checked={values.msmeRegistered}
            onCheckedChange={(v) => set("msmeRegistered", v as boolean)}
          />
          <Label htmlFor="msmeRegistered" className="cursor-pointer">
            MSME Registered
          </Label>
        </div>

        {values.msmeRegistered && (
          <div className="grid md:grid-cols-3 gap-4">
            <F label="MSME Number" required>
              <Input
                value={values.msmeNumber}
                onChange={(e) => set("msmeNumber", e.target.value)}
              />
            </F>
            <F label="MSME Category" required>
              <Select value={values.msmeCategory} onValueChange={(v) => set("msmeCategory", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Micro">Micro</SelectItem>
                  <SelectItem value="Small">Small</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="MSME Type" required>
              <Select value={values.msmeType} onValueChange={(v) => set("msmeType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="Service">Service</SelectItem>
                  <SelectItem value="Trading">Trading</SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>
        )}
      </div>

      {/* ── TDS Information ──────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">TDS Information</h3>

        <div className="flex items-center gap-2">
          <Checkbox
            id="tdsApplicable"
            checked={values.tdsApplicable}
            onCheckedChange={(v) => set("tdsApplicable", v as boolean)}
          />
          <Label htmlFor="tdsApplicable" className="cursor-pointer">
            TDS Applicable
          </Label>
        </div>

        {values.tdsApplicable && (
          <div className="grid md:grid-cols-2 gap-4">
            <F label="TAN Number" required>
              <Input
                value={values.tanNumber}
                onChange={(e) => set("tanNumber", e.target.value.toUpperCase())}
                className="font-mono"
              />
            </F>
            <F label="TDS Rate (%)" required>
              <Input
                type="number"
                value={values.tdsRate}
                onChange={(e) => set("tdsRate", e.target.value)}
                min={0}
                max={100}
              />
            </F>
          </div>
        )}
      </div>

      {/* ── Dispatch Instruction ─────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Dispatch Instruction</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <F label="Name">
            <Input
              value={values.dispatchName}
              onChange={(e) => set("dispatchName", e.target.value)}
            />
          </F>
          <F label="Contact Person">
            <Input
              value={values.dispatchContactPerson}
              onChange={(e) => set("dispatchContactPerson", e.target.value)}
            />
          </F>
          <F label="Contact Phone">
  <Input
    value={values.dispatchContactPhone}
    onChange={(e) => set("dispatchContactPhone", e.target.value)}
    maxLength={15}
  />
</F>
        </div>
      </div>

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
            : mode === "add" ? "Register Company" : "Update Company"}
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
