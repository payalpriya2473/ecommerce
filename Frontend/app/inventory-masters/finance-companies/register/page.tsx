"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, ArrowLeft, Building2 } from "lucide-react"
import { financeCompanyAPI } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import {
  EMPTY_FINANCE_COMPANY_FORM,
  BLANK_FINANCE_CONTACT,
  FinanceCompanyFormFields,
  type FinanceCompanyFormValues,
  type FinanceCompanyContact,
  validateFinanceCompanyForm,
  financeCompanyFormToPayload,
} from "../FinanceCompanyForm"
import { ModuleTemporarilyDisabled } from "@/components/module-temporarily-disabled"

// Temporarily disabled Finance Companies implementation; preserved for re-enabling.
function FinanceCompanyRegisterPageContent() {
  const router = useRouter()
  const { canCreate } = usePermissions()

  const [values, setValues] = useState<FinanceCompanyFormValues>(EMPTY_FINANCE_COMPANY_FORM)
  const [contactPersons, setContactPersons] = useState<FinanceCompanyContact[]>([BLANK_FINANCE_CONTACT()])
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setError("")
    const validationError = validateFinanceCompanyForm(values, contactPersons)
    if (validationError) { setError(validationError); return }

    const token = sessionStorage.getItem("authToken")
    if (!token) { setError("Authentication required"); return }

    setIsSubmitting(true)
    try {
      const payload = financeCompanyFormToPayload(values, contactPersons)
      const result = await financeCompanyAPI.register(payload, token)
      if (result.success) {
        router.push("/inventory-masters/finance-companies")
      } else {
        setError(result.message || "Failed to register finance company")
      }
    } catch (err: any) {
      setError(err.message || "Failed to register finance company")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canCreate("finance_companies")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh] px-4">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">
                  You don&apos;t have permission to create finance companies.
                </p>
              </CardContent>
            </Card>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
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
                    <CardTitle className="text-2xl">Add Finance Company</CardTitle>
                    <CardDescription>Create a finance company with at least one contact person</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <FinanceCompanyFormFields
                  mode="add"
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
      </AuthenticatedLayout>
    </AuthGuard>
  )
}

export default function FinanceCompanyRegisterPage() {
  return <ModuleTemporarilyDisabled moduleName="Finance Companies" />
}
