"use client"

import { useState } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Plus, Trash2 } from "lucide-react"
import type { FinanceCompany } from "@/lib/api"
import { validateGST } from "@/lib/qr-code"

export interface FinanceCompanyContact {
  id: string
  name: string
  mobile: string
  email: string
  panNumber: string
}

export interface FinanceCompanyFormValues {
  name: string
  address: string
  city: string
  pinCode: string
  gstNumber: string
}

export interface FinanceCompanyRecord extends FinanceCompany {
  contactPersons?: Array<Partial<FinanceCompanyContact>>
  gstNo?: string
  gst_no?: string
  gst_number?: string
  panNo?: string
  pan_no?: string
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const pickFirstString = (...values: Array<unknown>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export function normalizeFinanceCompanyRecord(fc: FinanceCompanyRecord): FinanceCompanyRecord {
  return {
    ...fc,
    gstNumber: pickFirstString(fc.gstNumber, fc.gstNo, fc.gst_no, fc.gst_number),
    panNumber: pickFirstString(fc.panNumber, fc.panNo, fc.pan_no),
  }
}

export const BLANK_FINANCE_CONTACT = (): FinanceCompanyContact => ({
  id: generateId(),
  name: "",
  mobile: "",
  email: "",
  panNumber: "",
})

export const EMPTY_FINANCE_COMPANY_FORM: FinanceCompanyFormValues = {
  name: "",
  address: "",
  city: "",
  pinCode: "",
  gstNumber: "",
}

export function financeCompanyToFormValues(fc: FinanceCompanyRecord) {
  const normalizedCompany = normalizeFinanceCompanyRecord(fc)
  const contactsFromApi = Array.isArray(normalizedCompany.contactPersons) && normalizedCompany.contactPersons.length > 0
    ? normalizedCompany.contactPersons.map((contact) => ({
        id: contact.id || generateId(),
        name: contact.name || "",
        mobile: contact.mobile || "",
        email: contact.email || "",
        panNumber: pickFirstString(contact.panNumber, (contact as FinanceCompanyRecord["contactPersons"][number] & { panNo?: string; pan_no?: string }).panNo, (contact as FinanceCompanyRecord["contactPersons"][number] & { panNo?: string; pan_no?: string }).pan_no),
      }))
    : [{
        id: generateId(),
        name: normalizedCompany.contactPersonName || "",
        mobile: normalizedCompany.mobile || "",
        email: normalizedCompany.email || "",
        panNumber: normalizedCompany.panNumber || "",
      }]

  return {
    values: {
      name: normalizedCompany.name || "",
      address: normalizedCompany.address || "",
      city: normalizedCompany.city || "",
      pinCode: normalizedCompany.pinCode || "",
      gstNumber: normalizedCompany.gstNumber || "",
    },
    contactPersons: contactsFromApi.length > 0 ? contactsFromApi : [BLANK_FINANCE_CONTACT()],
  }
}

export function validateFinanceCompanyForm(
  values: FinanceCompanyFormValues,
  contactPersons: FinanceCompanyContact[]
) {
  if (!values.name.trim()) return "Finance company name is required"
  if (!values.gstNumber.trim()) return "GST number is required"
  if (!validateGST(values.gstNumber)) return "Invalid GST number format. Expected: 22AAAAA0000A1Z5"
  if (contactPersons.length === 0) return "At least one contact person is required"

  const firstContact = contactPersons[0]
  if (!firstContact.name.trim()) return "Contact person name is required"

  for (let index = 0; index < contactPersons.length; index += 1) {
    const contact = contactPersons[index]
    const hasAnyValue = [contact.name, contact.mobile, contact.email, contact.panNumber]
      .some((value) => value.trim())
    if (!hasAnyValue) continue
    if (!contact.name.trim()) return `Contact person ${index + 1} name is required`
  }

  return ""
}

export function financeCompanyFormToPayload(
  values: FinanceCompanyFormValues,
  contactPersons: FinanceCompanyContact[]
) {
  const normalizedContacts = contactPersons
    .map((contact) => ({
      name: contact.name.trim(),
      mobile: contact.mobile.trim(),
      email: contact.email.trim(),
      panNumber: contact.panNumber.trim().toUpperCase(),
    }))
    .filter((contact) => Object.values(contact).some(Boolean))

  const primaryContact = normalizedContacts[0]

  return {
    name: values.name.trim(),
    address: values.address.trim() || undefined,
    city: values.city.trim() || undefined,
    pinCode: values.pinCode.trim() || undefined,
    gstNumber: values.gstNumber.trim().toUpperCase() || undefined,
    contactPersonName: primaryContact?.name || undefined,
    mobile: primaryContact?.mobile || undefined,
    email: primaryContact?.email || undefined,
    panNumber: primaryContact?.panNumber || undefined,
    contactPersons: normalizedContacts,
  }
}

interface FinanceCompanyFormFieldsProps {
  mode: "add" | "edit"
  values: FinanceCompanyFormValues
  onChange: (updated: Partial<FinanceCompanyFormValues>) => void
  contactPersons: FinanceCompanyContact[]
  onContactPersonsChange: (contacts: FinanceCompanyContact[]) => void
  onSubmit: () => void
  onCancel?: () => void
  isSubmitting: boolean
  error: string
}

export function FinanceCompanyFormFields({
  mode,
  values,
  onChange,
  contactPersons,
  onContactPersonsChange,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
}: FinanceCompanyFormFieldsProps) {
  const set = (field: keyof FinanceCompanyFormValues, value: string) => onChange({ [field]: value })

  const addContact = () => onContactPersonsChange([...contactPersons, BLANK_FINANCE_CONTACT()])

  const removeContact = (id: string) => {
    if (contactPersons.length <= 1) return
    onContactPersonsChange(contactPersons.filter((contact) => contact.id !== id))
  }

  const updateContact = (id: string, field: keyof FinanceCompanyContact, value: string) => {
    onContactPersonsChange(
      contactPersons.map((contact) =>
        contact.id === id ? { ...contact, [field]: value } : contact
      )
    )
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSubmit()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">Finance Company Details</h3>
        <div className="space-y-2">
          <Label>Finance Company Name <span className="text-destructive">*</span></Label>
          <Input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label>Address</Label>
          <Input
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>City</Label>
            <Input
              value={values.city}
              onChange={(e) => set("city", e.target.value)}
              onKeyDown={handleKey}
            />
          </div>
          <div className="space-y-2">
            <Label>PIN Code</Label>
            <Input
              value={values.pinCode}
              onChange={(e) => set("pinCode", e.target.value)}
              onKeyDown={handleKey}
              maxLength={10}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>GST No. <span className="text-destructive">*</span></Label>
          <Input
            value={values.gstNumber}
            onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
            onKeyDown={handleKey}
            maxLength={15}
            className="font-mono tracking-wider"
            required
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h3 className="font-semibold text-lg">Contact Persons</h3>
            <p className="text-sm text-muted-foreground">At least one contact person is required.</p>
          </div>
          <Button type="button" size="sm" onClick={addContact} className="bg-red-700 hover:bg-red-800 text-white">
            <Plus className="h-4 w-4 mr-1" />Add Contact
          </Button>
        </div>

        {contactPersons.map((contact, index) => (
          <Card key={contact.id} className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Contact Person {index + 1}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeContact(contact.id)}
                  disabled={contactPersons.length === 1}
                  className="text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Contact Person Name <span className="text-destructive">*</span></Label>
                <Input
                  value={contact.name}
                  onChange={(e) => updateContact(contact.id, "name", e.target.value)}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <Input
                    value={contact.mobile}
                    onChange={(e) => updateContact(contact.id, "mobile", e.target.value)}
                    maxLength={20}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={contact.email}
                    onChange={(e) => updateContact(contact.id, "email", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PAN</Label>
                  <Input
                    value={contact.panNumber}
                    onChange={(e) => updateContact(contact.id, "panNumber", e.target.value.toUpperCase())}
                    maxLength={10}
                    className="font-mono tracking-wider"
                  />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-4 pt-2">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
        >
          {isSubmitting ? "Saving..." : mode === "add" ? "Save Finance Company" : "Update Finance Company"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => onCancel?.()}
          className="flex-1"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
