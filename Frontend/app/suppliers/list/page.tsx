"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Users, Search, Eye, MapPin, Phone, Edit, Trash2,
  AlertCircle, CheckCircle2, Mail, Loader2,
} from "lucide-react"
import { supplierAPI, purchaseOrderAPI, purchaseInvoiceAPI } from "@/lib/api"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

interface ContactPerson {
  id: string; name: string; mobile: string
  alternateMobile?: string; email?: string
}
interface BankAccount {
  id: string; bankName: string; bankBranch: string
  accountNumber: string; ifscCode: string; accountHolderName: string
}
interface Supplier {
  id: string; name: string; group?: string
  addressLine1: string; addressLine2?: string; addressLine3?: string
  country: string; state: string; city: string; pinCode: string
  contactPersons: ContactPerson[]
  creditLimit: number; creditDays: number; graceDays: number
  balanceAmount: number; balanceType: "credit" | "debit"
  bankAccounts: BankAccount[]
  panNumber?: string; gstNumber?: string
  tdsApplicable: boolean; tcsApplicable: boolean
  msmeRegistered: boolean; msmeNumber?: string
  msmeCategory?: string; msmeType?: string
  isActive: boolean
}

export default function SuppliersListPage() {
  type SupplierSortKey = "name" | "contact" | "city" | "mobile" | "status"
  const router = useRouter()
  const { canView, canEdit, canDelete } = usePermissions()

  const [suppliers, setSuppliers]                 = useState<Supplier[]>([])
  const [totalItems, setTotalItems]               = useState(0)
  const [searchTerm, setSearchTerm]               = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [refreshToken, setRefreshToken]           = useState(0)
  const [isLoading, setIsLoading]                 = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce]         = useState(false)
  const [error, setError]                         = useState("")
  const [success, setSuccess]                     = useState("")
  const [currentPage, setCurrentPage]             = useState(1)
  const [pageSize, setPageSize]                   = useState<number>(DEFAULT_PAGE_SIZE)

  // ── Delete dialog state (mirrors BrandManager pattern) ──
  const [deleteDialogOpen, setDeleteDialogOpen]   = useState(false)
  const [supplierToDelete, setSupplierToDelete]   = useState<Supplier | null>(null)
  const [isCheckingUsage, setIsCheckingUsage]     = useState(false)
  const [isDeleting, setIsDeleting]               = useState(false)
  const [deleteBlockedReason, setDeleteBlockedReason] = useState("") // non-empty = blocked
  const [sortState, setSortState] = useState<SortState<SupplierSortKey>>({
    key: "name",
    direction: "asc",
  })

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
        const token = sessionStorage.getItem("authToken")
        if (!token) { setError("Authentication required. Please login again."); setIsLoading(false); return }
        const result = await supplierAPI.getAll(token, {
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
          setSuppliers(rows)
          setTotalItems(nextTotal)
          setError("")
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          setSuppliers([])
          setTotalItems(0)
          setError(result.message || "Failed to load suppliers")
        }
      } catch {
        if (!cancelled) {
          setSuppliers([])
          setTotalItems(0)
          setError("Failed to load suppliers. Please try again.")
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

  const handleSort = (key: SupplierSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const showError = (message: string) => {
    setError(message); setTimeout(() => setError(""), 3000)
  }

  const getSupplierUsageMessage = async (supplierId: string, token: string): Promise<string> => {
    const [poRes, piRes] = await Promise.all([
      purchaseOrderAPI.getAll(token),
      purchaseInvoiceAPI.getAll(token),
    ])
    const isUsedInPO = Array.isArray(poRes?.data) && poRes.data.some((order: any) =>
      String(order?.supplierId ?? order?.supplier_id ?? "") === supplierId
    )
    const isUsedInPI = Array.isArray(piRes?.data) && piRes.data.some((invoice: any) =>
      String(invoice?.supplierId ?? invoice?.supplier_id ?? "") === supplierId
    )
    if (isUsedInPO && isUsedInPI) return "This supplier is used in Purchase Orders and Purchase Invoices and cannot be deleted."
    if (isUsedInPO) return "This supplier is used in Purchase Orders and cannot be deleted."
    if (isUsedInPI) return "This supplier is used in Purchase Invoices and cannot be deleted."
    return ""
  }

  const handleToggleStatus = async (supplierId: string) => {
    if (!canEdit("suppliers")) {
      setError("You don't have permission to update suppliers")
      setTimeout(() => setError(""), 3000); return
    }
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const result = await supplierAPI.toggleStatus(supplierId, token)
      if (result.success) {
        setRefreshToken((v) => v + 1)
        setSuccess("Supplier status updated successfully")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.message || "Failed to update status")
        setTimeout(() => setError(""), 3000)
      }
    } catch { setError("Failed to update supplier status"); setTimeout(() => setError(""), 3000) }
  }

  // ── Opens delete dialog and immediately checks usage ──
  const handleDeleteClick = async (supplier: Supplier) => {
    if (!canDelete("suppliers")) {
      showError("You don't have permission to delete suppliers"); return
    }

    // Open dialog right away with loading state
    setSupplierToDelete(supplier)
    setDeleteBlockedReason("")
    setDeleteDialogOpen(true)
    setIsCheckingUsage(true)

    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const usageMessage = await getSupplierUsageMessage(supplier.id, token)
      if (usageMessage) setDeleteBlockedReason(usageMessage)
    } finally { setIsCheckingUsage(false) }
  }

  const handleDeleteConfirm = async () => {
    if (!supplierToDelete || deleteBlockedReason) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return

      // Double-check before actually deleting
      const usageMessage = await getSupplierUsageMessage(supplierToDelete.id, token)
      if (usageMessage) {
        setDeleteBlockedReason(usageMessage); return
      }

      const result = await supplierAPI.delete(supplierToDelete.id, token)
      if (result.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false)
        setSupplierToDelete(null)
        setSuccess("Supplier deleted successfully")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setDeleteBlockedReason(result.message || "Failed to delete supplier")
      }
    } finally { setIsDeleting(false) }
  }

  const handleDeleteDialogClose = () => {
    if (isDeleting || isCheckingUsage) return
    setDeleteDialogOpen(false)
    setSupplierToDelete(null)
    setDeleteBlockedReason("")
  }

  if (!canView("suppliers")) {
    return (
      <AuthGuard><AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground text-center">
                You don't have permission to view suppliers.
              </p>
            </CardContent>
          </Card>
        </div>
      </AuthenticatedLayout></AuthGuard>
    )
  }

  if (isLoading && !hasLoadedOnce) {
    return (
      <AuthGuard><AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading suppliers...</p>
          </div>
        </div>
      </AuthenticatedLayout></AuthGuard>
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

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
                <p className="text-muted-foreground mt-1">
                  Manage your supplier accounts and relationships
                </p>
              </div>
              <PermissionGate module="suppliers" action="create">
                <Link href="/suppliers/register">
                  <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
                    <Users className="h-4 w-4 mr-2" />Register New Supplier
                  </Button>
                </Link>
              </PermissionGate>
            </div>

            {/* Search */}
            <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
              <CardContent className="p-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9 h-10 text-sm" placeholder="Search suppliers..."
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Empty state */}
            {totalItems === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No suppliers found</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    {searchTerm ? "Try adjusting your search criteria" : "Get started by registering your first supplier"}
                  </p>
                  {!searchTerm && (
                    <PermissionGate module="suppliers" action="create">
                      <Link href="/suppliers/register">
                        <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                          <Users className="h-4 w-4 mr-2" />Register New Supplier
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
                        <SortableTableHead label="Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} />
                        <SortableTableHead label="Contact" active={sortState.key === "contact"} direction={sortState.direction} onClick={() => handleSort("contact")} />
                        <SortableTableHead label="City" active={sortState.key === "city"} direction={sortState.direction} onClick={() => handleSort("city")} />
                        <SortableTableHead label="Mobile" active={sortState.key === "mobile"} direction={sortState.direction} onClick={() => handleSort("mobile")} />
                        <SortableTableHead label="Status" active={sortState.key === "status"} direction={sortState.direction} onClick={() => handleSort("status")} className="text-center" buttonClassName="justify-center" />
                        <TableHead className="font-semibold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suppliers.map((supplier) => (
                        <TableRow key={supplier.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center shrink-0">
                                <Users className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <p className="font-medium">{supplier.name}</p>
                                {supplier.group && (
                                  <p className="text-xs text-muted-foreground">{supplier.group}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{supplier.contactPersons[0]?.name || "N/A"}</p>
                            {supplier.contactPersons[0]?.email && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />{supplier.contactPersons[0].email}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-start gap-1">
                              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-sm">{supplier.city}</p>
                                <p className="text-xs text-muted-foreground">{supplier.state}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-mono">
                                {supplier.contactPersons[0]?.mobile || "N/A"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              {canEdit("suppliers") ? (
                                <>
                                  <Switch checked={supplier.isActive}
                                    onCheckedChange={() => handleToggleStatus(supplier.id)} />
                                  <Badge variant={supplier.isActive ? "default" : "secondary"}>
                                    {supplier.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </>
                              ) : (
                                <Badge variant={supplier.isActive ? "default" : "secondary"}>
                                  {supplier.isActive ? "Active" : "Inactive"}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="icon"
                                onClick={() => router.push(`/suppliers/view?id=${supplier.id}`)}
                                className="h-8 w-8 hover:bg-accent/10 hover:text-accent" title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <PermissionGate module="suppliers" action="update">
                                <Button variant="ghost" size="icon"
                                  onClick={() => router.push(`/suppliers/edit?id=${supplier.id}`)}
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate module="suppliers" action="delete">
                                <Button variant="ghost" size="icon"
                                  onClick={() => handleDeleteClick(supplier)}
                                  className="h-8 w-8 hover:bg-red-50 hover:text-red-600" title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
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
                  itemLabel="suppliers"
                />
              </Card>
            )}
          </div>
        </div>

        {/* ── Delete Dialog (same pattern as BrandManager) ── */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { if (!open) handleDeleteDialogClose() }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {isCheckingUsage ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    Checking usage...
                  </>
                ) : deleteBlockedReason ? (
                  <>
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    Cannot Delete Supplier
                  </>
                ) : (
                  "Are you absolutely sure?"
                )}
              </AlertDialogTitle>

              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-1">
                  {isCheckingUsage ? (
                    <p className="text-sm text-muted-foreground">
                      Checking if <strong>{supplierToDelete?.name}</strong> is used in any purchase orders or invoices...
                    </p>
                  ) : deleteBlockedReason ? (
                    // ── BLOCKED state ──
                    <Alert variant="destructive" className="mt-1">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{supplierToDelete?.name}</strong> {deleteBlockedReason.replace(/^This supplier is/, "is")}
                        {" "}Please reassign or remove those records first.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    // ── SAFE to delete ──
                    <p>
                      This will{" "}
                      <strong className="text-red-600">permanently delete</strong>{" "}
                      <strong>{supplierToDelete?.name}</strong> from the database.
                      This action cannot be undone.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={isDeleting || isCheckingUsage}
                onClick={handleDeleteDialogClose}
              >
                {deleteBlockedReason ? "Close" : "Cancel"}
              </AlertDialogCancel>

              {/* Only show Delete button when NOT blocked and NOT checking */}
              {!deleteBlockedReason && !isCheckingUsage && (
                <Button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isDeleting ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting...</>
                  ) : (
                    "Yes, Delete Permanently"
                  )}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </AuthenticatedLayout>
    </AuthGuard>
  )
}
