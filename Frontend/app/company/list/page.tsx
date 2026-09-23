"use client"
import { resolveAssetUrl } from "@/lib/asset-url"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Building2, Search, Eye, QrCode, MapPin, CreditCard, Edit, Trash2, AlertCircle, CheckCircle2 } from "lucide-react"
import { companyAPI } from "@/lib/api"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

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
}

export default function CompanyListPage() {
  type CompanySortKey = "name" | "location" | "gstNumber" | "panNumber" | "bankName" | "status"
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [companies, setCompanies] = useState<Company[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [selectedQrCompany, setSelectedQrCompany] = useState<Company | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [refreshToken, setRefreshToken] = useState(0)
  const [sortState, setSortState] = useState<SortState<CompanySortKey>>({
    key: "name",
    direction: "asc",
  })

  const { hasPermission, canView, canCreate, canEdit, canDelete } = usePermissions()

  const getLogoSrc = (logoUrl?: string) => resolveAssetUrl(logoUrl)

  // Debounce the search box before hitting the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  // Reset to the first page whenever the search term or sort changes.
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, sortState])

  // Server-side page fetch — re-runs on page/size/search/sort/refresh changes.
  useEffect(() => {
    let cancelled = false
    const loadPage = async () => {
      try {
        if (!hasLoadedOnce) setIsLoading(true)
        const token = sessionStorage.getItem('authToken')
        if (!token) { console.error('No auth token found'); return }
        const result = await companyAPI.getAll(token, {
          page: currentPage,
          limit: pageSize,
          search: debouncedSearchTerm || undefined,
          sortKey: sortState.key,
          sortDirection: sortState.direction,
        })
        if (cancelled) return
        if (result.success) {
          const rows = Array.isArray(result.data) ? result.data : []
          const pagination = result.pagination || {}
          const nextTotal = Number(pagination.totalItems ?? rows.length ?? 0)
          setCompanies(rows)
          setTotalItems(nextTotal)
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          console.error('Failed to fetch companies:', result.message)
          setCompanies([])
          setTotalItems(0)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching companies:', error)
          setCompanies([])
          setTotalItems(0)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setHasLoadedOnce(true)
        }
      }
    }
    void loadPage()
    return () => { cancelled = true }
  }, [currentPage, pageSize, debouncedSearchTerm, sortState, refreshToken])

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize)
    setCurrentPage(1)
  }

  const handleSort = (key: CompanySortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const handleToggleStatus = async (companyId: string) => {
    if (!canEdit('companies')) {
      setError("You don't have permission to update companies")
      setTimeout(() => setError(""), 3000)
      return
    }
    try {
      const token = sessionStorage.getItem('authToken')
      if (!token) return
      const result = await companyAPI.toggleStatus(companyId, token)
      if (result.success) {
        setRefreshToken((v) => v + 1)
        setSuccess("Company status updated successfully")
        setTimeout(() => setSuccess(""), 3000)
      }
    } catch (error) {
      console.error('Error toggling company status:', error)
      setError("Failed to update company status")
      setTimeout(() => setError(""), 3000)
    }
  }

  const handleShowQrCode = (company: Company) => {
    setSelectedQrCompany(company)
    setQrDialogOpen(true)
  }

  const handleDeleteClick = (company: Company) => {
    if (!canDelete('companies')) {
      setError("You don't have permission to delete companies")
      setTimeout(() => setError(""), 3000)
      return
    }
    setCompanyToDelete(company)
    setDeleteDialogOpen(true)
  }

  const handleDeleteCompany = async () => {
    if (!companyToDelete) return
    setIsDeleting(true)
    setError("")
    try {
      const token = sessionStorage.getItem('authToken')
      if (!token) return
      const result = await companyAPI.delete(companyToDelete.id, token)
      if (result.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false)
        setCompanyToDelete(null)
        setSuccess("Company deleted successfully")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.message || "Failed to delete company")
      }
    } catch (error) {
      console.error('Error deleting company:', error)
      setError("Failed to delete company")
    } finally {
      setIsDeleting(false)
    }
  }

  if (!canView('companies')) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
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
        </AuthenticatedLayout>
      </AuthGuard>
    )
  }

  if (isLoading && !hasLoadedOnce) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading companies...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">

            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
                <p className="text-muted-foreground mt-1">View and manage all registered companies</p>
              </div>
              <PermissionGate module="companies" action="create">
                <Link href="/company/register">
                  <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity">
                    <Building2 className="h-4 w-4 mr-2" />
                    Register Company
                  </Button>
                </Link>
              </PermissionGate>
            </div>

            <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
              <CardContent className="p-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by company name, GST number, or city..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-10 text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            {totalItems === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No companies found</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    {searchTerm ? "Try adjusting your search criteria" : "Get started by registering your first company"}
                  </p>
                  {!searchTerm && (
                    <PermissionGate module="companies" action="create">
                      <Link href="/company/register">
                        <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                          <Building2 className="h-4 w-4 mr-2" />Register Company
                        </Button>
                      </Link>
                    </PermissionGate>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/50 shadow-sm">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <SortableTableHead label="Company Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} />
                        <SortableTableHead label="Location" active={sortState.key === "location"} direction={sortState.direction} onClick={() => handleSort("location")} className="text-center" buttonClassName="justify-center" />
                        <SortableTableHead label="GST" active={sortState.key === "gstNumber"} direction={sortState.direction} onClick={() => handleSort("gstNumber")} className="text-center" buttonClassName="justify-center" />
                        <SortableTableHead label="PAN" active={sortState.key === "panNumber"} direction={sortState.direction} onClick={() => handleSort("panNumber")} className="text-center" buttonClassName="justify-center" />
                        <SortableTableHead label="Bank" active={sortState.key === "bankName"} direction={sortState.direction} onClick={() => handleSort("bankName")} className="text-center" buttonClassName="justify-center" />
                        <SortableTableHead label="Status" active={sortState.key === "status"} direction={sortState.direction} onClick={() => handleSort("status")} className="text-center" buttonClassName="justify-center" />
                        <TableHead className="font-semibold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies.map((company) => (
                        <TableRow key={company.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {/* Logo or fallback icon */}
                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${company.logoUrl ? "bg-white border" : "bg-gradient-to-br from-accent to-accent-secondary"}`}>
                                {company.logoUrl ? (
                                  <img
                                    src={getLogoSrc(company.logoUrl)}
                                    alt={company.name}
                                    className="h-full w-full object-contain p-0.5"
                                  />
                                ) : (
                                  <Building2 className="h-5 w-5 text-white" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{company.name}</p>
                                <p className="text-xs text-muted-foreground">{company.upiId || "No UPI"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-start justify-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="text-left">
                                <p className="text-sm">{company.city}</p>
                                <p className="text-xs text-muted-foreground">{company.state}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono text-xs">{company.gstNumber}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono text-xs">{company.panNumber}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-start justify-center gap-2">
                              <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="text-left">
                                <p className="text-sm font-medium">{company.bankName}</p>
                                <p className="text-xs text-muted-foreground">{company.ifscCode}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {canEdit('companies') ? (
                                <Switch
                                  checked={company.isActive}
                                  onCheckedChange={() => handleToggleStatus(company.id)}
                                  className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-accent data-[state=checked]:to-accent-secondary"
                                />
                              ) : (
                                <Badge variant={company.isActive ? "default" : "secondary"} className="min-w-[70px]">
                                  {company.isActive ? "Active" : "Inactive"}
                                </Badge>
                              )}
                              {canEdit('companies') && (
                                <Badge variant={company.isActive ? "default" : "secondary"} className="min-w-[70px]">
                                  {company.isActive ? "Active" : "Inactive"}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="icon"
                                onClick={() => router.push(`/company/view?id=${company.id}`)}
                                className="h-8 w-8 hover:bg-accent/10 hover:text-accent transition-colors" title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <PermissionGate module="companies" action="update">
                                <Button variant="ghost" size="icon"
                                  onClick={() => router.push(`/company/edit?id=${company.id}`)}
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Edit">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate module="companies" action="delete">
                                <Button variant="ghost" size="icon"
                                  onClick={() => handleDeleteClick(company)}
                                  className="h-8 w-8 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              <Button variant="ghost" size="icon"
                                onClick={() => handleShowQrCode(company)}
                                className="h-8 w-8 hover:bg-purple-50 hover:text-purple-600 transition-colors" title="QR Code">
                                <QrCode className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={currentPage}
                  pageSize={pageSize}
                  totalItems={totalItems}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                  itemLabel="companies"
                />
              </Card>
            )}

            {/* QR Code Dialog */}
            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Payment QR Code</DialogTitle>
                  <DialogDescription>
                    {selectedQrCompany && `Scan this QR code to make payments to ${selectedQrCompany.name}`}
                  </DialogDescription>
                </DialogHeader>
                {selectedQrCompany && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="p-4 bg-white rounded-lg border-2">
                      {selectedQrCompany.qrCodeData ? (
                        <img src={selectedQrCompany.qrCodeData} alt="Payment QR Code" className="h-64 w-64" />
                      ) : (
                        <div className="h-64 w-64 flex items-center justify-center bg-muted">
                          <p className="text-sm text-muted-foreground">No QR Code</p>
                        </div>
                      )}
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-semibold">{selectedQrCompany.name}</p>
                      <p className="text-sm text-muted-foreground">UPI: {selectedQrCompany.upiId}</p>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will <strong className="text-red-600">permanently delete</strong>{" "}
                    <strong>{companyToDelete?.name}</strong> from the database.
                    This action cannot be undone. All associated data including branches and employees will also be deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteCompany} disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700">
                    {isDeleting ? "Deleting..." : "Yes, Delete Permanently"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
