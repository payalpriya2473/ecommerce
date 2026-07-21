"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card } from "@/components/ui/card"
import { AlertCircle, Plus, Trash2, Users } from "lucide-react"
import { INDIAN_STATES } from "@/lib/indian-states"
import { validateGST } from "@/lib/qr-code"
import {
  doesGSTMatchState,
  getStateCodeForState,
  getStateNameFromGST,
  extractStateCodeFromGST,
} from "@/lib/gst-utils"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface ContactPerson {
  id: string
  name: string
  mobile: string
  alternateMobile: string
  email: string
}

export interface BankAccount {
  id: string
  bankName: string
  bankBranch: string
  accountNumber: string
  ifscCode: string
  accountHolderName: string
  isPrimary: boolean
}

export interface SupplierFormValues {
  // Basic
  name: string
  group: string
  // Address
  addressLine1: string
  addressLine2: string
  addressLine3: string
  country: string
  state: string
  city: string
  pinCode: string
  // Financial
  creditLimit: string
  creditDays: string
  graceDays: string
  balanceAmount: string
  balanceType: "credit" | "debit"
  // Tax
  panNumber: string
  gstNumber: string
  tdsApplicable: boolean
  tcsApplicable: boolean
  // MSME
  msmeRegistered: boolean
  msmeNumber: string
  msmeCategory: string
  msmeType: string
 
}

export const EMPTY_SUPPLIER_FORM: SupplierFormValues = {
  name: "", group: "",
  addressLine1: "", addressLine2: "", addressLine3: "",
  country: "India", state: "", city: "", pinCode: "",
  creditLimit: "0", creditDays: "0", graceDays: "0",
  balanceAmount: "0", balanceType: "credit",
  panNumber: "", gstNumber: "",
  tdsApplicable: false, tcsApplicable: false,
  msmeRegistered: false, msmeNumber: "", msmeCategory: "", msmeType: "",
}

export const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const BLANK_CONTACT = (): ContactPerson => ({
  id: generateId(), name: "", mobile: "", alternateMobile: "", email: "",
})

export const BLANK_BANK = (): BankAccount => ({
  id: generateId(), bankName: "", bankBranch: "", accountNumber: "",
  ifscCode: "", accountHolderName: "", isPrimary: false,
})

// ─────────────────────────────────────────────────────────────
// Map API response → SupplierFormValues
// ─────────────────────────────────────────────────────────────

export function supplierToFormValues(s: any): SupplierFormValues {
  return {
    name:           s.name           ?? "",
    group:          s.group          ?? "",
    addressLine1:   s.addressLine1   ?? "",
    addressLine2:   s.addressLine2   ?? "",
    addressLine3:   s.addressLine3   ?? "",
    country:        s.country        ?? "India",
    state:          s.state          ?? "",
    city:           s.city           ?? "",
    pinCode:        s.pinCode        ?? "",
    creditLimit:    String(s.creditLimit   ?? 0),
    creditDays:     String(s.creditDays    ?? 0),
    graceDays:      String(s.graceDays     ?? 0),
    balanceAmount:  String(s.balanceAmount ?? 0),
    balanceType:    s.balanceType    ?? "credit",
    panNumber:      s.panNumber      ?? "",
    gstNumber:      s.gstNumber      ?? "",
    tdsApplicable:  s.tdsApplicable  ?? false,
    tcsApplicable:  s.tcsApplicable  ?? false,
    msmeRegistered: s.msmeRegistered ?? false,
    msmeNumber:     s.msmeNumber     ?? "",
    msmeCategory:   s.msmeCategory   ?? "",
    msmeType:       s.msmeType       ?? "",
  }
}

// ─────────────────────────────────────────────────────────────
// Map SupplierFormValues → API payload
// ─────────────────────────────────────────────────────────────

export function formValuesToSupplierPayload(
  values: SupplierFormValues,
  contactPersons: ContactPerson[],
  bankAccounts: BankAccount[],
) {
  const banks = bankAccounts.map((b) => ({
    ...b, ifscCode: b.ifscCode.toUpperCase(),
  }))
  if (banks.length > 0 && !banks.some((b) => b.isPrimary))
    banks[0] = { ...banks[0], isPrimary: true }

  return {
    ...values,
    creditLimit:   parseFloat(values.creditLimit)   || 0,
    creditDays:    parseInt(values.creditDays)      || 0,
    graceDays:     parseInt(values.graceDays)       || 0,
    balanceAmount: parseFloat(values.balanceAmount) || 0,
    panNumber:     values.panNumber.toUpperCase()   || null,
    gstNumber:     values.gstNumber.toUpperCase()   || null,
    msmeNumber:    values.msmeNumber    || null,
    msmeCategory:  values.msmeCategory  || null,
    msmeType:      values.msmeType      || null,
    contactPersons,
    bankAccounts: banks,
  }
}

// ─────────────────────────────────────────────────────────────
// Validation — call before submit
// ─────────────────────────────────────────────────────────────

export function validateSupplierForm(
  values: SupplierFormValues,
  contactPersons: ContactPerson[],
): string {
  if (!values.name.trim())         return "Supplier name is required"
  if (!values.addressLine1.trim()) return "Address Line 1 is required"
  if (!values.state)               return "Please select a state"
  if (!values.city.trim())         return "City is required"
  if (!values.pinCode.match(/^\d{6}$/)) return "PIN code must be 6 digits"
  if (contactPersons.length === 0) return "Please add at least one contact person"
  for (const c of contactPersons) {
    if (!c.name.trim() || !c.mobile.trim())
      return "Contact person name and mobile are required"
    if (!c.mobile.match(/^\d{10}$/))
      return "Mobile number must be 10 digits"
    if (c.alternateMobile && !c.alternateMobile.match(/^\d{10}$/))
      return "Alternate mobile must be 10 digits"
  }
  if (values.gstNumber && !validateGST(values.gstNumber))
    return "Invalid GST number format. Expected: 24AAAAA0000A1Z5"
  if (values.gstNumber && values.state && !doesGSTMatchState(values.gstNumber, values.state)) {
    const gstStateName = getStateNameFromGST(values.gstNumber)
    const gstStateCode = extractStateCodeFromGST(values.gstNumber)
    return `GST state code ${gstStateCode} belongs to ${gstStateName}, but selected state is ${values.state}`
  }
  if (values.msmeRegistered && !values.msmeNumber.trim())
    return "MSME number is required when MSME is registered"
  return ""
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export interface SupplierFormProps {
  mode: "add" | "edit"
  values: SupplierFormValues
  onChange: (updated: Partial<SupplierFormValues>) => void
  contactPersons: ContactPerson[]
  onContactPersonsChange: (list: ContactPerson[]) => void
  bankAccounts: BankAccount[]
  onBankAccountsChange: (list: BankAccount[]) => void
  onSubmit: () => void
  onCancel: () => void
  isSubmitting: boolean
  error: string
}

// ─────────────────────────────────────────────────────────────
// THE SHARED SUPPLIER FORM
// ─────────────────────────────────────────────────────────────

export function SupplierFormFields({
  mode, values, onChange,
  contactPersons, onContactPersonsChange,
  bankAccounts, onBankAccountsChange,
  onSubmit, onCancel, isSubmitting, error,
}: SupplierFormProps) {

  const set = (field: keyof SupplierFormValues, value: string | boolean) =>
    onChange({ [field]: value })

  const selectedStateCode = getStateCodeForState(values.state)
  const gstStateCode = extractStateCodeFromGST(values.gstNumber)
  const gstStateName = getStateNameFromGST(values.gstNumber)
  const gstMatchesState = doesGSTMatchState(values.gstNumber, values.state)

  // ── Contact Persons ───────────────────────────────────────
  const addContact = () =>
    onContactPersonsChange([...contactPersons, BLANK_CONTACT()])

  const removeContact = (id: string) =>
    onContactPersonsChange(contactPersons.filter((c) => c.id !== id))

  const updateContact = (id: string, field: keyof ContactPerson, val: string) =>
    onContactPersonsChange(
      contactPersons.map((c) => c.id === id ? { ...c, [field]: val } : c)
    )

  // ── Bank Accounts ─────────────────────────────────────────
  const addBank = () =>
    onBankAccountsChange([
      ...bankAccounts,
      { ...BLANK_BANK(), isPrimary: bankAccounts.length === 0 },
    ])

  const removeBank = (id: string) => {
    const wasPrimary = bankAccounts.find((b) => b.id === id)?.isPrimary
    const next = bankAccounts.filter((b) => b.id !== id)
    if (wasPrimary && next.length > 0) next[0] = { ...next[0], isPrimary: true }
    onBankAccountsChange(next)
  }

  const updateBank = (id: string, field: keyof BankAccount, val: string | boolean) => {
    if (field === "isPrimary" && val === true) {
      onBankAccountsChange(bankAccounts.map((b) => ({ ...b, isPrimary: b.id === id })))
      return
    }
    onBankAccountsChange(bankAccounts.map((b) => b.id === id ? { ...b, [field]: val } : b))
  }

  return (
    <div className="space-y-6">

      {/* ── Basic Information ────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Supplier Name <span className="text-destructive">*</span></Label>
            <Input value={values.name} onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Group</Label>
            <Input value={values.group} onChange={(e) => set("group", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Address Information ──────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Address Information</h3>
        <div className="space-y-2">
          <Label>Address Line 1 <span className="text-destructive">*</span></Label>
          <Input value={values.addressLine1}
            onChange={(e) => set("addressLine1", e.target.value)}
          />
        </div>

        
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Address Line 2</Label>
            <Input value={values.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Address Line 3</Label>
            <Input value={values.addressLine3}
              onChange={(e) => set("addressLine3", e.target.value)}
            />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Country <span className="text-destructive">*</span></Label>
            <Select value={values.country} onValueChange={(v) => set("country", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="India">India</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>State <span className="text-destructive">*</span></Label>
            <Select value={values.state} onValueChange={(v) => set("state", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedStateCode && (
              <p className="text-xs text-muted-foreground">
                GST state code for {values.state}: <span className="font-semibold">{selectedStateCode}</span>
              </p>
            )}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>City <span className="text-destructive">*</span></Label>
            <Input value={values.city} onChange={(e) => set("city", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>PIN Code <span className="text-destructive">*</span></Label>
            <Input value={values.pinCode} onChange={(e) => set("pinCode", e.target.value)}
              maxLength={6} />
          </div>
        </div>
      </div>

      {/* ── Contact Persons ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Contact Persons</h3>
          <Button type="button" size="sm" onClick={addContact}
            className="bg-red-700 hover:bg-red-800 text-white">
            <Plus className="h-4 w-4 mr-1" />Add Contact
          </Button>
        </div>

        {contactPersons.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No contact persons added yet</p>
            <p className="text-xs">Click "Add Contact" to add a contact person</p>
          </div>
        ) : contactPersons.map((contact, index) => (
          <Card key={contact.id} className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Contact Person {index + 1}</h4>
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => removeContact(contact.id)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input value={contact.name}
                  onChange={(e) => updateContact(contact.id, "name", e.target.value)}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mobile <span className="text-destructive">*</span></Label>
                  <Input value={contact.mobile}
                    onChange={(e) => updateContact(contact.id, "mobile", e.target.value)}
                    maxLength={10} />
                </div>
                <div className="space-y-2">
                  <Label>Alternate Mobile</Label>
                  <Input value={contact.alternateMobile}
                    onChange={(e) => updateContact(contact.id, "alternateMobile", e.target.value)}
                    maxLength={10} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={contact.email}
                  onChange={(e) => updateContact(contact.id, "email", e.target.value)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Financial Information ────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Financial Information</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Credit Limit</Label>
            <Input type="number" value={values.creditLimit}
              onChange={(e) => set("creditLimit", e.target.value)}
              min="0" />
          </div>
          <div className="space-y-2">
            <Label>Credit Days</Label>
            <Input type="number" value={values.creditDays}
              onChange={(e) => set("creditDays", e.target.value)}
              min="0" />
          </div>
          <div className="space-y-2">
            <Label>Grace Days</Label>
            <Input type="number" value={values.graceDays}
              onChange={(e) => set("graceDays", e.target.value)}
              min="0" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Balance Amount</Label>
            <Input type="number" value={values.balanceAmount}
              onChange={(e) => set("balanceAmount", e.target.value)}
              min="0" />
          </div>
          <div className="space-y-2">
            <Label>Balance Type</Label>
            <RadioGroup value={values.balanceType}
              onValueChange={(v) => set("balanceType", v)}
              className="flex gap-4 pt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="credit" id="s-credit" />
                <Label htmlFor="s-credit" className="cursor-pointer">Credit</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="debit" id="s-debit" />
                <Label htmlFor="s-debit" className="cursor-pointer">Debit</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
      </div>

      {/* ── Tax & Additional Information ─────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Tax & Additional Information</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>PAN No.</Label>
            <Input value={values.panNumber}
              onChange={(e) => set("panNumber", e.target.value.toUpperCase())}
              maxLength={10} />
          </div>
          <div className="space-y-2">
            <Label>GST No.</Label>
            <Input value={values.gstNumber}
              onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
              maxLength={15} />
            {gstStateCode && gstStateName && (
              <p className={`text-xs ${gstMatchesState ? "text-muted-foreground" : "text-destructive"}`}>
                GST state: <span className="font-semibold">{gstStateName}</span> ({gstStateCode})
                {values.state && !gstMatchesState ? `, selected state is ${values.state}` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-6">
          <div className="flex items-center space-x-2">
            <Checkbox id="s-tds" checked={values.tdsApplicable}
              onCheckedChange={(v) => set("tdsApplicable", v as boolean)} />
            <Label htmlFor="s-tds" className="cursor-pointer">TDS Applicable</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="s-tcs" checked={values.tcsApplicable}
              onCheckedChange={(v) => set("tcsApplicable", v as boolean)} />
            <Label htmlFor="s-tcs" className="cursor-pointer">TCS Applicable</Label>
          </div>
        </div>
      </div>

      {/* ── Bank Accounts ────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="font-semibold text-lg">Bank Accounts</h3>
          <Button type="button" size="sm" onClick={addBank}
            className="bg-red-700 hover:bg-red-800 text-white">
            <Plus className="h-4 w-4 mr-1" />Add Bank
          </Button>
        </div>

        {bankAccounts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">No bank accounts added yet</p>
          </div>
        ) : bankAccounts.map((bank, index) => (
          <Card key={bank.id} className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Bank Account {index + 1}</h4>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Checkbox id={`s-primary-${bank.id}`} checked={bank.isPrimary}
                      onCheckedChange={(v) => updateBank(bank.id, "isPrimary", v as boolean)} />
                    <Label htmlFor={`s-primary-${bank.id}`} className="text-sm cursor-pointer">
                      Primary
                    </Label>
                  </div>
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => removeBank(bank.id)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input value={bank.bankName}
                    onChange={(e) => updateBank(bank.id, "bankName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input value={bank.bankBranch}
                    onChange={(e) => updateBank(bank.id, "bankBranch", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input value={bank.accountNumber}
                    onChange={(e) => updateBank(bank.id, "accountNumber", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IFSC Code</Label>
                  <Input value={bank.ifscCode}
                    onChange={(e) => updateBank(bank.id, "ifscCode", e.target.value.toUpperCase())}
                    maxLength={11} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Account Holder Name</Label>
                <Input value={bank.accountHolderName}
                  onChange={(e) => updateBank(bank.id, "accountHolderName", e.target.value)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── MSME Details ─────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">MSME Details</h3>
        <div className="flex items-center space-x-2">
          <Checkbox id="s-msme" checked={values.msmeRegistered}
            onCheckedChange={(v) => set("msmeRegistered", v as boolean)} />
          <Label htmlFor="s-msme" className="cursor-pointer">MSME Registered</Label>
        </div>
        {values.msmeRegistered && (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>MSME Number</Label>
              <Input value={values.msmeNumber}
                onChange={(e) => set("msmeNumber", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={values.msmeCategory}
                onChange={(e) => set("msmeCategory", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Input value={values.msmeType}
                onChange={(e) => set("msmeType", e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* 👇 Add new sections here */}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Submit / Cancel ──────────────────────────────── */}
      <div className="flex gap-4 pt-2">
        <Button type="button" onClick={onSubmit} disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
          {isSubmitting
            ? (mode === "add" ? "Saving..." : "Updating...")
            : (mode === "add" ? "Save Supplier" : "Update Supplier")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}
          disabled={isSubmitting} className="flex-1">
          {mode === "add" ? "Reset" : "Cancel"}
        </Button>
      </div>
    </div>
  )
}
