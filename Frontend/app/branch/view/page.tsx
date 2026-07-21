"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Store, Warehouse, ArrowLeft, Edit, MapPin, Phone, Mail, FileText, CreditCard, Loader2 } from "lucide-react"
import Link from "next/link"
import { branchAPI, type Branch } from "@/lib/api"

function BranchViewContent() {
  const router = useRouter()
  const params = useSearchParams()
  const branchId = params.get('id') as string

  const [branch, setBranch] = useState<Branch | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (branchId) {
      fetchBranch()
    }
  }, [branchId])

  const fetchBranch = async () => {
    try {
      const token = sessionStorage.getItem('authToken')
      if (!token) return

      const result = await branchAPI.getById(token, branchId)

      if (result.success) {
        setBranch(result.data)
      }
    } catch (error) {
      console.error('Error fetching branch:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading branch details...</p>
        </div>
      </div>
    )
  }

  if (!branch) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-muted-foreground">Branch not found</p>
          <Link href="/branch/list">
            <Button className="mt-4">Back to Branches</Button>
          </Link>
        </div>
      </div>
    )
  }

  const BranchIcon = branch.type === "showroom" ? Store : Warehouse

  return (
    <div className="py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push('/branch/list')}
            className="mb-4 "
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Branch Details</h1>
              <p className="text-muted-foreground mt-1">
                Complete information for {branch.name}
              </p>
            </div>
            <Link href={`/branch/edit?id=${branch.id}`}>
              <Button className="bg-gradient-to-r from-red-700 to-red-700 hover:opacity-90">
                <Edit className="h-4 w-4 mr-2" />
                Edit Branch
              </Button>
            </Link>
          </div>
        </div>

        {/* Branch Header Card */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                <BranchIcon className="h-10 w-10 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">{branch.name}</h2>
                <p className="text-muted-foreground mb-3">{branch.companyName}</p>
                <div className="flex gap-2">
                  <Badge variant="outline" className="capitalize">
                    {branch.type}
                  </Badge>
                  <Badge 
                    variant={branch.operationModel === "company-operated" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {branch.operationModel?.replace("-", " ")}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Address Information */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Address</h3>
              </div>
              <div className="space-y-2 text-sm">
                {branch.address && <p>{branch.address}</p>}
                {(branch.city || branch.state || branch.pinCode) && (
                  <p>
                    {branch.city}
                    {branch.state && `, ${branch.state}`}
                    {branch.pinCode && ` - ${branch.pinCode}`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Phone className="h-5 w-5 text-accent" />
                <h3 className="text-lg font-semibold">Contact Information</h3>
              </div>
              <div className="space-y-3">
                {branch.contactPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{branch.contactPhone}</span>
                  </div>
                )}
                {branch.contactEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{branch.contactEmail}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tax Information */}
          {(branch.gstNumber || branch.panNumber) && (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">Tax Information</h3>
                </div>
                <div className="space-y-3">
                  {branch.gstNumber && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">GST Number:</span>
                      <Badge variant="outline" className="font-mono">
                        {branch.gstNumber}
                      </Badge>
                    </div>
                  )}
                  {branch.panNumber && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">PAN Number:</span>
                      <Badge variant="outline" className="font-mono">
                        {branch.panNumber}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bank Details */}
          {branch.bankName && (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="h-5 w-5 text-accent" />
                  <h3 className="text-lg font-semibold">Bank Details</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank Name:</span>
                    <span className="font-medium">{branch.bankName}</span>
                  </div>
                  {branch.bankBranch && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Branch:</span>
                      <span className="font-medium">{branch.bankBranch}</span>
                    </div>
                  )}
                  {branch.accountNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account No:</span>
                      <span className="font-mono font-medium">{branch.accountNumber}</span>
                    </div>
                  )}
                  {branch.ifscCode && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IFSC Code:</span>
                      <span className="font-mono font-medium">{branch.ifscCode}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BranchViewPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <BranchViewContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}