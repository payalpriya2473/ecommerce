"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Edit,
  FileText,
  Mail,
  MapPin,
  Phone,
  Users,
} from "lucide-react"
import { financeCompanyAPI, type FinanceCompany } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { normalizeFinanceCompanyRecord } from "../FinanceCompanyForm"

type FinanceCompanyContact = {
  id?: string
  name?: string
  mobile?: string
  email?: string
  panNumber?: string
}

type FinanceCompanyRecord = FinanceCompany & {
  contactPersons?: FinanceCompanyContact[]
}

function getContacts(financeCompany: FinanceCompanyRecord): FinanceCompanyContact[] {
  if (Array.isArray(financeCompany.contactPersons) && financeCompany.contactPersons.length > 0) {
    return financeCompany.contactPersons
  }
  return [{
    name: financeCompany.contactPersonName,
    mobile: financeCompany.mobile,
    email: financeCompany.email,
    panNumber: financeCompany.panNumber,
  }].filter((contact) => Object.values(contact).some(Boolean))
}

function FinanceCompanyViewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const financeCompanyId = searchParams.get("id") || ""

  const [financeCompany, setFinanceCompany] = useState<FinanceCompanyRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { canView } = usePermissions()

  useEffect(() => {
    if (financeCompanyId) fetchFinanceCompany()
  }, [financeCompanyId])

  const fetchFinanceCompany = async () => {
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const result = await financeCompanyAPI.getById(token, financeCompanyId)
      if (result.success) setFinanceCompany(normalizeFinanceCompanyRecord(result.data as FinanceCompanyRecord))
    } catch (error) {
      console.error("Error fetching finance company:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!canView("finance_companies")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full border-red-100 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don&apos;t have permission to view finance companies.
              <br />
              Please contact your administrator.
            </p>
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

  if (!financeCompany) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-muted-foreground">Finance company not found</p>
          <Link href="/inventory-masters/finance-companies">
            <Button className="mt-4 bg-red-700 text-white hover:bg-red-800">Back to Finance Companies</Button>
          </Link>
        </div>
      </div>
    )
  }

  const contacts = getContacts(financeCompany)
  const primaryContact = contacts[0]

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50/40 via-background to-background">
      <div className="w-full px-4 py-8">
        <Button
          onClick={() => router.push("/inventory-masters/finance-companies")}
          className="mb-6 bg-red-700 text-white hover:bg-red-800 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center justify-between mb-6 p-5 rounded-xl border border-red-100 bg-white/90 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Finance Company Details</h1>
            <p className="text-muted-foreground mt-1 text-base">Complete information for {financeCompany.name}</p>
          </div>

          <PermissionGate module="finance_companies" action="update">
            <Link href={`/inventory-masters/finance-companies/edit?id=${financeCompany.id}`}>
              <Button className="bg-red-700 text-white hover:bg-red-800 shadow-sm">
                <Edit className="h-4 w-4 mr-2" />
                Edit Finance Company
              </Button>
            </Link>
          </PermissionGate>
        </div>

        <Card className="mb-7 border-red-100 bg-gradient-to-r from-white to-red-50/40 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              <div className="h-16 w-16 rounded-xl bg-red-700 ring-4 ring-red-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-8 w-8 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-1">{financeCompany.name}</h2>
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <MapPin className="h-4 w-4" />
                  <span>{financeCompany.city || "City not added"}{financeCompany.pinCode ? ` - ${financeCompany.pinCode}` : ""}</span>
                </div>
                <Badge className={financeCompany.isActive ? "bg-red-700 text-white" : ""} variant={financeCompany.isActive ? "default" : "secondary"}>
                  {financeCompany.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Address</h3>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{financeCompany.address || "Address not added"}</p>
                <p>
                  {financeCompany.city || "—"}
                  {financeCompany.pinCode ? ` - ${financeCompany.pinCode}` : ""}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <Users className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Primary Contact</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-muted-foreground">Name:</span>
                  <span className="text-sm font-semibold text-right">{primaryContact?.name || "—"}</span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-muted-foreground">Mobile:</span>
                  <span className="text-sm font-semibold text-right">{primaryContact?.mobile || "—"}</span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <span className="text-sm font-semibold text-right break-all">{primaryContact?.email || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Tax Information</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-muted-foreground">PAN Number:</span>
                  <span className="text-sm font-semibold text-right">{primaryContact?.panNumber || "—"}</span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <span className="text-sm text-muted-foreground">GST Number:</span>
                  <span className="text-sm font-semibold text-right">{financeCompany.gstNumber || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <Phone className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Quick Contact</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span>{primaryContact?.mobile || "Mobile not added"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span className="break-all">{primaryContact?.email || "Email not added"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-red-100 shadow-sm bg-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Contact Persons</h3>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contact persons added.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contacts.map((contact, index) => (
                  <div key={contact.id || `${contact.name || "contact"}-${index}`} className="rounded-xl border border-red-100 bg-red-50/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">Contact Person {index + 1}</h4>
                      {index === 0 && <Badge className="bg-red-700 text-white">Primary</Badge>}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-medium text-right">{contact.name || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Mobile:</span>
                        <span className="font-medium text-right">{contact.mobile || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Email:</span>
                        <span className="font-medium text-right break-all">{contact.email || "—"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">PAN:</span>
                        <span className="font-medium text-right">{contact.panNumber || "—"}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function FinanceCompanyViewPage() {
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
          <FinanceCompanyViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
