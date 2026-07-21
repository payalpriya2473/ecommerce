"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, ArrowLeft, Building2, CheckCircle2 } from "lucide-react"
import { financeCompanyAPI } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import {
  EMPTY_FINANCE_COMPANY_FORM,
  BLANK_FINANCE_CONTACT,
  FinanceCompanyFormFields,
  financeCompanyToFormValues,
  validateFinanceCompanyForm,
  financeCompanyFormToPayload,
  type FinanceCompanyFormValues,
  type FinanceCompanyContact,
  type FinanceCompanyRecord,
} from "../FinanceCompanyForm"

function FinanceCompanyEditContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const financeCompanyId = searchParams.get("id") || ""
  const { canEdit, canView } = usePermissions()

  const [values, setValues] = useState<FinanceCompanyFormValues>(EMPTY_FINANCE_COMPANY_FORM)
  const [contactPersons, setContactPersons] = useState<FinanceCompanyContact[]>([BLANK_FINANCE_CONTACT()])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (financeCompanyId) fetchFinanceCompany()
  }, [financeCompanyId])

  const fetchFinanceCompany = async () => {
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const result = await financeCompanyAPI.getById(token, financeCompanyId)
      if (result.success) {
        const mapped = financeCompanyToFormValues(result.data as FinanceCompanyRecord)
        setValues(mapped.values)
        setContactPersons(mapped.contactPersons)
      } else {
        setError(result.message || "Failed to load finance company")
      }
    } catch {
      setError("Failed to load finance company")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    setError("")
    const validationError = validateFinanceCompanyForm(values, contactPersons)
    if (validationError) { setError(validationError); return }

    const token = sessionStorage.getItem("authToken")
    if (!token) { setError("Authentication required"); return }

    setIsSubmitting(true)
    try {
      const payload = financeCompanyFormToPayload(values, contactPersons)
      const result = await financeCompanyAPI.update(financeCompanyId, payload, token)
      if (result.success) {
        setSuccess(true)
        setTimeout(() => router.push("/inventory-masters/finance-companies"), 1200)
      } else {
        setError(result.message || "Failed to update finance company")
      }
    } catch (err: any) {
      setError(err.message || "Failed to update finance company")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canEdit("finance_companies")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center mb-6">
              You don&apos;t have permission to edit finance companies.
            </p>
            {canView("finance_companies") && (
              <Link href="/inventory-masters/finance-companies"><Button>View Finance Companies</Button></Link>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading finance company details...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => router.push("/inventory-masters/finance-companies")}
          className="mb-4 bg-red-700 text-white hover:bg-red-800"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Edit Finance Company</CardTitle>
                <CardDescription>Update finance company details and contact persons</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Finance company updated successfully. Redirecting...
                </AlertDescription>
              </Alert>
            )}

            <FinanceCompanyFormFields
              mode="edit"
              values={values}
              onChange={(updated) => setValues((prev) => ({ ...prev, ...updated }))}
              contactPersons={contactPersons}
              onContactPersonsChange={setContactPersons}
              onSubmit={handleSubmit}
              onCancel={() => router.push("/inventory-masters/finance-companies")}
              isSubmitting={isSubmitting}
              error={error}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function FinanceCompanyEditPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-muted-foreground">Loading...</p>
              </div>
            </div>
          }
        >
          <FinanceCompanyEditContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
