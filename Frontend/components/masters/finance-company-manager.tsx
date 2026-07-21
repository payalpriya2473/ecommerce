"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Trash2, AlertCircle, Edit, Eye, Search, CheckCircle2, Building,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { financeCompanyAPI, type FinanceCompany } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

type FinanceCompanyRecord = FinanceCompany & {
  contactPersons?: Array<{
    name?: string
    mobile?: string
    email?: string
    panNumber?: string
  }>
}

function getPrimaryContact(financeCompany: FinanceCompanyRecord) {
  if (Array.isArray(financeCompany.contactPersons) && financeCompany.contactPersons.length > 0) {
    return financeCompany.contactPersons[0]
  }
  return {
    name: financeCompany.contactPersonName,
    mobile: financeCompany.mobile,
    email: financeCompany.email,
    panNumber: financeCompany.panNumber,
  }
}

export function FinanceCompanyManager() {
  type FinanceCompanySortKey = "name" | "city" | "contact" | "mobile" | "pan" | "gst"
  const router = useRouter()
  const [financeCompanies, setFinanceCompanies] = useState<FinanceCompanyRecord[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [refreshToken, setRefreshToken] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<FinanceCompanyRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sortState, setSortState] = useState<SortState<FinanceCompanySortKey>>({
    key: "name",
    direction: "asc",
  })

  const { canView, canDelete } = usePermissions()

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
        if (!token) return
        const res = await financeCompanyAPI.getAll(token, undefined, {
          page: currentPage,
          limit: pageSize,
          search: debouncedSearchTerm || undefined,
          sortKey: sortState.key,
          sortDirection: sortState.direction,
        })
        if (cancelled) return
        if (res.success) {
          const rows = Array.isArray(res.data) ? res.data : []
          const pagination = res.pagination || {}
          const nextTotal = Number(pagination.totalItems ?? rows.length ?? 0)
          setFinanceCompanies(rows)
          setTotalItems(nextTotal)
          setError("")
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          setFinanceCompanies([])
          setTotalItems(0)
          setError(res.message || "Failed to fetch finance companies")
        }
      } catch {
        if (!cancelled) {
          setFinanceCompanies([])
          setTotalItems(0)
          setError("Failed to fetch finance companies")
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

  const handleSort = (key: FinanceCompanySortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const showSuccess = (message: string) => {
    setSuccess(message)
    setTimeout(() => setSuccess(""), 3000)
  }

  const handleDeleteClick = (financeCompany: FinanceCompanyRecord) => {
    if (!canDelete("finance_companies")) {
      setError("You don't have permission to delete finance companies")
      setTimeout(() => setError(""), 3000)
      return
    }
    setItemToDelete(financeCompany)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await financeCompanyAPI.delete(itemToDelete.id, token)
      if (res.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false)
        setItemToDelete(null)
        showSuccess("Finance company deleted successfully")
      } else {
        setError(res.message || "Failed to delete finance company")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (!canView("finance_companies")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don&apos;t have permission to view finance companies.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading && !hasLoadedOnce) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading finance companies...</p>
        </div>
      </div>
    )
  }

  return (
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
            <h1 className="text-3xl font-bold tracking-tight">Finance Companies</h1>
            <p className="text-muted-foreground mt-1">
              Manage finance companies used in sales invoices
            </p>
          </div>
          <PermissionGate module="finance_companies" action="create">
            <Button
              onClick={() => router.push("/inventory-masters/finance-companies/register")}
              className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4 mr-2" />Add Finance Company
            </Button>
          </PermissionGate>
        </div>

        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, city, contact, or GST..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11"
              />
            </div>
          </CardContent>
        </Card>

        {totalItems === 0 ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mb-2">No finance companies found</p>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                {searchTerm
                  ? "Try adjusting your search criteria"
                  : "Get started by adding your first finance company"}
              </p>
              {!searchTerm && (
                <PermissionGate module="finance_companies" action="create">
                  <Button
                    onClick={() => router.push("/inventory-masters/finance-companies/register")}
                    className="bg-gradient-to-r from-accent to-accent-secondary"
                  >
                    <Plus className="h-4 w-4 mr-2" />Add Finance Company
                  </Button>
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
                    <SortableTableHead label="Company Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} className="w-[22%]" />
                    <SortableTableHead label="City" active={sortState.key === "city"} direction={sortState.direction} onClick={() => handleSort("city")} className="w-[14%]" />
                    <SortableTableHead label="Contact Person" active={sortState.key === "contact"} direction={sortState.direction} onClick={() => handleSort("contact")} className="w-[16%]" />
                    <SortableTableHead label="Mobile" active={sortState.key === "mobile"} direction={sortState.direction} onClick={() => handleSort("mobile")} className="w-[13%]" />
                    <SortableTableHead label="PAN" active={sortState.key === "pan"} direction={sortState.direction} onClick={() => handleSort("pan")} className="w-[13%]" />
                    <SortableTableHead label="GST No." active={sortState.key === "gst"} direction={sortState.direction} onClick={() => handleSort("gst")} className="w-[15%]" />
                    <TableHead className="font-semibold text-center w-[7%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financeCompanies.map((financeCompany) => {
                    const primaryContact = getPrimaryContact(financeCompany)
                    return (
                      <TableRow key={financeCompany.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                              <Building className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium">{financeCompany.name}</p>
                              {financeCompany.address && (
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {financeCompany.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{financeCompany.city || "—"}</p>
                            {financeCompany.pinCode && (
                              <p className="text-xs text-muted-foreground">{financeCompany.pinCode}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{primaryContact.name || "—"}</p>
                            {primaryContact.email && (
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                                {primaryContact.email}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono">{primaryContact.mobile || "—"}</span>
                        </TableCell>
                        <TableCell>
                          {primaryContact.panNumber
                            ? <Badge variant="outline" className="font-mono text-xs">{primaryContact.panNumber}</Badge>
                            : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell>
                          {financeCompany.gstNumber
                            ? <span className="font-mono text-xs">{financeCompany.gstNumber}</span>
                            : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <PermissionGate module="finance_companies" action="view">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/inventory-masters/finance-companies/view?id=${financeCompany.id}`)}
                                className="h-8 w-8 hover:bg-accent/10 hover:text-accent transition-colors"
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate module="finance_companies" action="update">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/inventory-masters/finance-companies/edit?id=${financeCompany.id}`)}
                                className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate module="finance_companies" action="delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(financeCompany)}
                                className="h-8 w-8 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={currentPage}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setCurrentPage}
              onPageSizeChange={handlePageSizeChange}
              itemLabel="finance companies"
            />
          </Card>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently hide{" "}
                <strong>{itemToDelete?.name}</strong>. You can&apos;t undo this action.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
