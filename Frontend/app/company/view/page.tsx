"use client"
import { resolveAssetUrl } from "@/lib/asset-url"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Building2, ArrowLeft, Edit, MapPin, CreditCard, FileText, QrCode, AlertCircle, Truck } from "lucide-react"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { companyAPI } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"

interface Company {
  id: string
  name: string
  address: string
  city: string
  state: string
  pinCode: string
  gstNumber: string
  panNumber: string
  bankName: string
  accountNumber: string
  ifscCode: string
  bankBranch: string
  upiId: string
  qrCodeData: string
  logoUrl?: string
  isActive: boolean
  udid?: string
  msmeRegistered?: boolean
  msmeNumber?: string
  msmeCategory?: string
  msmeType?: string
  tdsApplicable?: boolean
  tanNumber?: string
  tdsRate?: number
  // Dispatch Instruction
  dispatchName?: string
  dispatchContactPerson?: string
}

function CompanyViewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const companyId = searchParams.get('id') || ''

  const [company, setCompany] = useState<Company | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)

  const { canView, canEdit } = usePermissions()

  const getLogoSrc = (logoUrl?: string) => resolveAssetUrl(logoUrl)

  useEffect(() => {
    if (companyId) fetchCompany()
  }, [companyId])

  const fetchCompany = async () => {
    try {
      const token = sessionStorage.getItem('authToken')
      if (!token) return
      const result = await companyAPI.getById(token, companyId)
      if (result.success) setCompany(result.data)
    } catch (error) {
      console.error('Error fetching company:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!canView('companies')) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view companies.<br />Please contact your administrator.
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading company details...</p>
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-muted-foreground">Company not found</p>
          <Link href="/company/list">
            <Button className="mt-4">Back to Companies</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6">
          <Button onClick={() => router.push('/company/list')}
            className="mb-4 bg-red-700 hover:bg-red-800 text-white">
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Company Details</h1>
              <p className="text-muted-foreground mt-1">Complete information for {company.name}</p>
            </div>
            <PermissionGate module="companies" action="update">
              <Link href={`/company/edit?id=${company.id}`}>
                <Button className="bg-gradient-to-r from-red-700 to-red-700 hover:opacity-90">
                  <Edit className="h-4 w-4 mr-2" />Edit Company
                </Button>
              </Link>
            </PermissionGate>
          </div>
        </div>

        {/* Company Header Card — logo or icon */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <div className={`h-20 w-20 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${company.logoUrl ? "bg-white border" : "bg-gradient-to-br from-accent to-accent-secondary"}`}>
                {company.logoUrl ? (
                  <img
                    src={getLogoSrc(company.logoUrl)}
                    alt={`${company.name} logo`}
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <Building2 className="h-10 w-10 text-white" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{company.name}</h2>
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <MapPin className="h-4 w-4" />
                  <span>{company.city}, {company.state}</span>
                </div>
                <Badge variant={company.isActive ? "default" : "secondary"} className="text-sm">
                  {company.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">

          {/* Address */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Address</h3>
              </div>
              <div className="space-y-2 text-sm">
                <p>{company.address}</p>
                <p>{company.city}, {company.state} - {company.pinCode}</p>
              </div>
            </CardContent>
          </Card>

          {/* Tax Information */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Tax Information</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">GST Number:</span>
                  <Badge variant="outline" className="font-mono">{company.gstNumber}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">PAN Number:</span>
                  <Badge variant="outline" className="font-mono">{company.panNumber}</Badge>
                </div>
                {company.udid && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">UDID:</span>
                    <Badge variant="outline" className="font-mono">{company.udid}</Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Bank Details</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bank Name:</span>
                  <span className="font-medium">{company.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Branch:</span>
                  <span className="font-medium">{company.bankBranch}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account No:</span>
                  <span className="font-mono font-medium">{company.accountNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IFSC Code:</span>
                  <span className="font-mono font-medium">{company.ifscCode}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Information */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <QrCode className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Payment Information</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">UPI ID:</span>
                  <span className="font-mono font-medium text-sm">{company.upiId || "Not set"}</span>
                </div>
                {company.qrCodeData && (
                  <Button variant="outline" className="w-full" onClick={() => setQrDialogOpen(true)}>
                    <QrCode className="h-4 w-4 mr-2" />View QR Code
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Dispatch Instruction */}
          {(company.dispatchName || company.dispatchContactPerson) && (
            <Card className="border-border/50 shadow-sm md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">Dispatch Instruction</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  {company.dispatchName && (
                    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="font-medium">{company.dispatchName}</span>
                    </div>
                  )}
                  {company.dispatchContactPerson && (
                    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                      <span className="text-muted-foreground">Contact Person:</span>
                      <span className="font-medium">{company.dispatchContactPerson}</span>
                    </div>
                  )}
                  {company.dispatchContactPhone && (
                    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                      <span className="text-muted-foreground">Contact Phone:</span>
                      <span className="font-medium">{company.dispatchContactPhone}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* MSME Details */}
          {company.msmeRegistered && (
            <Card className="border-border/50 shadow-sm md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">MSME Details</h3>
                </div>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block mb-1">MSME Number:</span>
                    <span className="font-mono font-medium">{company.msmeNumber}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Category:</span>
                    <span className="font-medium">{company.msmeCategory}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-1">Type:</span>
                    <span className="font-medium">{company.msmeType}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TDS Details */}
          {company.tdsApplicable && (
            <Card className="border-border/50 shadow-sm md:col-span-2">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">TDS Details</h3>
                </div>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TAN Number:</span>
                    <span className="font-mono font-medium">{company.tanNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">TDS Rate:</span>
                    <span className="font-medium">{company.tdsRate}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>

        {/* QR Code Dialog */}
        <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Payment QR Code</DialogTitle>
              <DialogDescription>Scan this QR code to make payments to {company.name}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="p-4 bg-white rounded-lg border-2">
                {company.qrCodeData ? (
                  <img src={company.qrCodeData} alt="Payment QR Code" className="h-64 w-64" />
                ) : (
                  <div className="h-64 w-64 flex items-center justify-center bg-muted">
                    <p className="text-sm text-muted-foreground">No QR Code</p>
                  </div>
                )}
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold">{company.name}</p>
                <p className="text-sm text-muted-foreground">UPI: {company.upiId}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  )
}

export default function CompanyViewPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <CompanyViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
