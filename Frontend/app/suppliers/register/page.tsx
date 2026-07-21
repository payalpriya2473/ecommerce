"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, ArrowLeft } from "lucide-react"
import { supplierAPI } from "@/lib/api"
import { validatePAN, validateIFSC } from "@/lib/qr-code"
import {
  SupplierFormFields,
  EMPTY_SUPPLIER_FORM,
  validateSupplierForm,
  formValuesToSupplierPayload,
} from "../SupplierForm"
import type { SupplierFormValues, ContactPerson, BankAccount } from "../SupplierForm"

export default function SupplierRegisterPage() {
  const router = useRouter()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]               = useState("")

  // ── Form state ────────────────────────────────────────────
  const [values, setValues]                       = useState<SupplierFormValues>(EMPTY_SUPPLIER_FORM)
  const [contactPersons, setContactPersons]       = useState<ContactPerson[]>([])
  const [bankAccounts, setBankAccounts]           = useState<BankAccount[]>([])

  const handleReset = () => {
    setValues(EMPTY_SUPPLIER_FORM)
    setContactPersons([])
    setBankAccounts([])
    setError("")
  }

  const handleSubmit = async () => {
    setError("")
    const validationError = validateSupplierForm(values, contactPersons)
    if (validationError) { setError(validationError); return }

    if (values.panNumber && !validatePAN(values.panNumber)) {
      setError("Invalid PAN number format. Expected: AAAAA0000A"); return
    }
    for (const bank of bankAccounts) {
      if (bank.ifscCode && !validateIFSC(bank.ifscCode)) {
        setError(`Invalid IFSC code format for ${bank.bankName}`); return
      }
    }

    const token = sessionStorage.getItem("authToken")
    if (!token) { setError("Authentication token not found. Please login again."); return }

    setIsSubmitting(true)
    try {
      const payload = formValuesToSupplierPayload(values, contactPersons, bankAccounts)
      const result  = await supplierAPI.register(payload, token)
      if (result.success) {
        router.push("/suppliers/list")
      } else {
        setError(result.message || "Failed to register supplier")
      }
    } catch (err: any) {
      setError(err.message || "Failed to register supplier. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Success screen ────────────────────────────────────────
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="container mx-auto max-w-4xl">
            <Button variant="ghost" onClick={() => router.push("/suppliers/list")}
              className="mb-4 bg-red-700 text-white hover:bg-red-800">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Users className="h-8 w-8 text-primary" />
                  <div>
                    <CardTitle className="text-2xl">Register New Supplier</CardTitle>
                    <CardDescription>
                      Fill in all supplier details to create a new account
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SupplierFormFields
                  mode="add"
                  values={values}
                  onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
                  contactPersons={contactPersons}
                  onContactPersonsChange={setContactPersons}
                  bankAccounts={bankAccounts}
                  onBankAccountsChange={setBankAccounts}
                  onSubmit={handleSubmit}
                  onCancel={handleReset}
                  isSubmitting={isSubmitting}
                  error={error}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
