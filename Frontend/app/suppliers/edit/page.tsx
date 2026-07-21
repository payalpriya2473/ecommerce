"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, Users, ArrowLeft } from "lucide-react"
import { supplierAPI } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { validatePAN, validateIFSC } from "@/lib/qr-code"
import {
  SupplierFormFields,
  EMPTY_SUPPLIER_FORM,
  supplierToFormValues,
  validateSupplierForm,
  formValuesToSupplierPayload,
  generateId,
} from "../SupplierForm"
import type { SupplierFormValues, ContactPerson, BankAccount } from "../SupplierForm"

// ─────────────────────────────────────────────────────────────
// Inner content (uses useSearchParams — must be inside Suspense)
// ─────────────────────────────────────────────────────────────

function SupplierEditContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supplierId   = searchParams.get("id") || ""

  const [isLoading, setIsLoading]     = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]             = useState("")
  const [success, setSuccess]         = useState(false)

  // ── Form state ────────────────────────────────────────────
  const [values, setValues]                 = useState<SupplierFormValues>(EMPTY_SUPPLIER_FORM)
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([])
  const [bankAccounts, setBankAccounts]     = useState<BankAccount[]>([])

  const { canEdit, canView } = usePermissions()

  useEffect(() => { if (supplierId) fetchSupplier() }, [supplierId])

  const fetchSupplier = async () => {
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const result = await supplierAPI.getById(token, supplierId)
      if (result.success) {
        const s = result.data

        // Map API response → form values (all in one place)
        setValues(supplierToFormValues(s))

        // Normalize contact persons — ensure every entry has an id
        const contacts: ContactPerson[] = (s.contactPersons || []).map((c: any) => ({
          id:              c.id              || generateId(),
          name:            c.name            || "",
          mobile:          c.mobile          || "",
          alternateMobile: c.alternateMobile || "",
          email:           c.email           || "",
        }))
        setContactPersons(contacts)

        // Normalize bank accounts — ensure every entry has an id + valid isPrimary
        const banks: BankAccount[] = (s.bankAccounts || []).map((b: any) => ({
          id:               b.id               || generateId(),
          bankName:         b.bankName         || "",
          bankBranch:       b.bankBranch       || "",
          accountNumber:    b.accountNumber    || "",
          ifscCode:         b.ifscCode         || "",
          accountHolderName: b.accountHolderName || "",
          isPrimary:        !!b.isPrimary,
        }))
        if (banks.length > 0 && !banks.some((b) => b.isPrimary))
          banks[0] = { ...banks[0], isPrimary: true }
        setBankAccounts(banks)
      }
    } catch {
      setError("Failed to load supplier details")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    setError("")
    const validationError = validateSupplierForm(values, contactPersons)
    if (validationError) { setError(validationError); return }

    if (values.panNumber && !validatePAN(values.panNumber)) {
      setError("Invalid PAN number format"); return
    }
    for (const bank of bankAccounts) {
      if (bank.ifscCode && !validateIFSC(bank.ifscCode)) {
        setError(`Invalid IFSC code for ${bank.bankName}`); return
      }
    }

    const token = sessionStorage.getItem("authToken")
    if (!token) { setError("Authentication required"); return }

    setIsSubmitting(true)
    try {
      const payload = formValuesToSupplierPayload(values, contactPersons, bankAccounts)
      const result  = await supplierAPI.update(supplierId, payload, token)
      if (result.success) {
        setSuccess(true)
        setTimeout(() => router.push("/suppliers/list"), 1500)
      } else {
        setError(result.message || "Failed to update supplier")
      }
    } catch (err: any) {
      setError(err.message || "Failed to update supplier")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Access denied ─────────────────────────────────────────
  if (!canEdit("suppliers")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center mb-6">
              You don't have permission to edit suppliers.
            </p>
            {canView("suppliers") && (
              <Link href="/suppliers/list"><Button>View Suppliers</Button></Link>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Loading ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading supplier details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-4xl">
        <Button variant="ghost" onClick={() => router.push("/suppliers/list")}
          className="mb-4 bg-red-700 text-white hover:bg-red-800">
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center shrink-0">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Edit Supplier</CardTitle>
                <CardDescription>Update supplier information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Supplier updated successfully! Redirecting...
                </AlertDescription>
              </Alert>
            )}

            <SupplierFormFields
              mode="edit"
              values={values}
              onChange={(updated) => setValues((p) => ({ ...p, ...updated }))}
              contactPersons={contactPersons}
              onContactPersonsChange={setContactPersons}
              bankAccounts={bankAccounts}
              onBankAccountsChange={setBankAccounts}
              onSubmit={handleSubmit}
              onCancel={() => router.push("/suppliers/list")}
              isSubmitting={isSubmitting}
              error={error}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Page wrapper with Suspense
// ─────────────────────────────────────────────────────────────

export default function SupplierEditPage() {
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
          <SupplierEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
