"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Users, ArrowLeft, Edit, MapPin, CreditCard, FileText, AlertCircle } from "lucide-react"
import Link from "next/link"
import { supplierAPI } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"

interface ContactPerson {
  id: string
  name: string
  mobile: string
  alternateMobile?: string
  email?: string
}

interface BankAccount {
  id: string
  bankName: string
  bankBranch: string
  accountNumber: string
  ifscCode: string
  accountHolderName: string
}

interface Supplier {
  id: string
  name: string
  group?: string
  addressLine1: string
  addressLine2?: string
  addressLine3?: string
  country: string
  state: string
  city: string
  pinCode: string
  creditLimit: number
  creditDays: number
  graceDays: number
  balanceAmount: number
  balanceType: "credit" | "debit"
  panNumber?: string
  gstNumber?: string
  tdsApplicable: boolean
  tcsApplicable: boolean
  msmeRegistered: boolean
  msmeNumber?: string
  msmeCategory?: string
  msmeType?: string
  isActive: boolean
  contactPersons: ContactPerson[]
  bankAccounts: BankAccount[]
}

function SupplierViewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supplierId = searchParams.get("id") || ""

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const { canView } = usePermissions()

  useEffect(() => {
    if (supplierId) fetchSupplier()
  }, [supplierId])

  const fetchSupplier = async () => {
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return

      const result = await supplierAPI.getById(token, supplierId)
      if (result.success) setSupplier(result.data)
    } catch (error) {
      console.error("Error fetching supplier:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!canView("suppliers")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full border-red-100 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view suppliers.
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
          <p className="text-muted-foreground">Loading supplier details...</p>
        </div>
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-muted-foreground">Supplier not found</p>
          <Link href="/suppliers/list">
            <Button className="mt-4 bg-red-700 text-white hover:bg-red-800">Back to Suppliers</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50/40 via-background to-background">
      <div className="w-full px-4 py-8">
        <Button
          onClick={() => router.push("/suppliers/list")}
          className="mb-6 bg-red-700 text-white hover:bg-red-800 shadow-sm"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex items-center justify-between mb-6 p-5 rounded-xl border border-red-100 bg-white/90 shadow-sm">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Supplier Details</h1>
            <p className="text-muted-foreground mt-1 text-base">Complete information for {supplier.name}</p>
          </div>

          <PermissionGate module="suppliers" action="update">
            <Link href={`/suppliers/edit?id=${supplier.id}`}>
              <Button className="bg-red-700 text-white hover:bg-red-800 shadow-sm">
                <Edit className="h-4 w-4 mr-2" />
                Edit Supplier
              </Button>
            </Link>
          </PermissionGate>
        </div>

        <Card className="mb-7 border-red-100 bg-gradient-to-r from-white to-red-50/40 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              <div className="h-16 w-16 rounded-xl bg-red-700 ring-4 ring-red-100 flex items-center justify-center flex-shrink-0">
                <Users className="h-8 w-8 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-1">{supplier.name}</h2>
                {supplier.group && (
                  <p className="text-muted-foreground mb-2">
                    Group: <span className="font-medium text-foreground">{supplier.group}</span>
                  </p>
                )}
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <MapPin className="h-4 w-4" />
                  <span>{supplier.city}, {supplier.state}</span>
                </div>
                <Badge className={supplier.isActive ? "bg-red-700 text-white" : ""} variant={supplier.isActive ? "default" : "secondary"}>
                  {supplier.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Address</h3>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{supplier.addressLine1}</p>
                {supplier.addressLine2 && <p>{supplier.addressLine2}</p>}
                {supplier.addressLine3 && <p>{supplier.addressLine3}</p>}
                <p>{supplier.city}, {supplier.state} - {supplier.pinCode}</p>
              </div>
            </CardContent>
          </Card>

          {(supplier.panNumber || supplier.gstNumber) && (
            <Card className="border-red-100 shadow-sm bg-white">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Tax Information</h3>
                </div>
                <div className="space-y-3">
                  {supplier.gstNumber && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-sm text-muted-foreground">GST Number:</span>
                      <span className="text-sm font-semibold text-right">{supplier.gstNumber}</span>
                    </div>
                  )}
                  {supplier.panNumber && (
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-sm text-muted-foreground">PAN Number:</span>
                      <span className="text-sm font-semibold text-right">{supplier.panNumber}</span>
                    </div>
                  )}
                  {(supplier.tdsApplicable || supplier.tcsApplicable) && (
                    <div className="flex gap-2 flex-wrap mt-3">
                      {supplier.tdsApplicable && <Badge className="bg-red-700 text-white">TDS Applicable</Badge>}
                      {supplier.tcsApplicable && <Badge className="bg-red-700 text-white">TCS Applicable</Badge>}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Financial Details</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Credit Limit:</span><span className="text-sm font-semibold">Rs. {supplier.creditLimit.toLocaleString()}</span></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Credit Days:</span><span className="text-sm font-semibold">{supplier.creditDays} days</span></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Grace Days:</span><span className="text-sm font-semibold">{supplier.graceDays} days</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Balance:</span>
                  <span className="text-sm font-semibold">
                    Rs. {supplier.balanceAmount.toLocaleString()}
                    <span className={supplier.balanceType === "credit" ? "text-green-600 ml-1" : "text-red-600 ml-1"}>
                      ({supplier.balanceType})
                    </span>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <Users className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Contact Persons</h3>
              </div>
              <div className="space-y-3">
                {supplier.contactPersons.map((contact, index) => (
                  <div key={contact.id} className="rounded-lg border border-red-100 p-3 bg-red-50/30">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">Mobile: {contact.mobile}</p>
                      {contact.alternateMobile && <p className="text-sm text-muted-foreground">Alt: {contact.alternateMobile}</p>}
                      {contact.email && <p className="text-sm text-muted-foreground">Email: {contact.email}</p>}
                    </div>
                    {index < supplier.contactPersons.length - 1 && <div className="border-t border-red-100 my-3" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {supplier.bankAccounts && supplier.bankAccounts.length > 0 && (
          <Card className="mt-6 border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">Bank Accounts</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {supplier.bankAccounts.map((bank) => (
                  <div key={bank.id} className="p-4 border border-red-100 rounded-lg space-y-3 bg-red-50/30">
                    <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Bank Name:</span><span className="text-sm font-semibold">{bank.bankName}</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Branch:</span><span className="text-sm font-semibold">{bank.bankBranch}</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Account No:</span><span className="text-sm font-mono font-semibold">{bank.accountNumber}</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">IFSC Code:</span><span className="text-sm font-mono font-semibold">{bank.ifscCode}</span></div>
                    <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Holder:</span><span className="text-sm font-semibold">{bank.accountHolderName}</span></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {supplier.msmeRegistered && (
          <Card className="mt-6 border-red-100 shadow-sm bg-white">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold">MSME Details</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {supplier.msmeNumber && (
                  <div className="rounded-lg border border-red-100 p-3 bg-red-50/30">
                    <span className="text-sm text-muted-foreground block mb-1">MSME Number:</span>
                    <span className="text-sm font-semibold">{supplier.msmeNumber}</span>
                  </div>
                )}
                {supplier.msmeCategory && (
                  <div className="rounded-lg border border-red-100 p-3 bg-red-50/30">
                    <span className="text-sm text-muted-foreground block mb-1">Category:</span>
                    <span className="text-sm font-semibold">{supplier.msmeCategory}</span>
                  </div>
                )}
                {supplier.msmeType && (
                  <div className="rounded-lg border border-red-100 p-3 bg-red-50/30">
                    <span className="text-sm text-muted-foreground block mb-1">Type:</span>
                    <span className="text-sm font-semibold">{supplier.msmeType}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default function SupplierViewPage() {
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
          <SupplierViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
