"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { branchAPI } from "@/lib/api"
import type { Branch } from "@/lib/api"
import { Store, Warehouse, Plus, Search, Eye, Edit, Trash2, MapPin, Phone, AlertCircle, CheckCircle2 } from "lucide-react"
import Link from "next/link"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

export default function BranchListPage() {
  type BranchSortKey = "name" | "type" | "operationModel" | "location" | "contact"
  const router = useRouter()
  const [branches, setBranches] = useState<Branch[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [refreshToken, setRefreshToken] = useState(0)
  const [sortState, setSortState] = useState<SortState<BranchSortKey>>({
    key: "name",
    direction: "asc",
  })

  //  Get permissions
  const { canView, canCreate, canEdit, canDelete } = usePermissions()

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
        if (!token) {
          console.error('No auth token found')
          return
        }
        const result = await branchAPI.getAll(token, undefined, {
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
          setBranches(rows)
          setTotalItems(nextTotal)
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          console.error('Failed to fetch branches:', result.message)
          setBranches([])
          setTotalItems(0)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching branches:', error)
          setBranches([])
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

  const handleSort = (key: BranchSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const handleDeleteClick = (branch: Branch) => {
    //  Check permission before showing delete dialog
    if (!canDelete('branches')) {
      setError("You don't have permission to delete branches")
      setTimeout(() => setError(""), 3000)
      return
    }

    setBranchToDelete(branch)
    setDeleteDialogOpen(true)
  }

  const handleDeleteBranch = async () => {
    if (!branchToDelete) return
    
    setIsDeleting(true)
    setError("")

    try {
      const token = sessionStorage.getItem('authToken')
      if (!token) return

      const result = await branchAPI.delete(branchToDelete.id, token)

      if (result.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false)
        setBranchToDelete(null)
        setSuccess("Branch deleted successfully")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.message || "Failed to delete branch")
      }
    } catch (error) {
      console.error('Error deleting branch:', error)
      setError("Failed to delete branch")
    } finally {
      setIsDeleting(false)
    }
  }

  //  Check if user can view branches
  if (!canView('branches')) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">
                  You don't have permission to view branches.
                  <br />
                  Please contact your administrator.
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
              <p className="text-muted-foreground">Loading branches...</p>
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
            {/* Success Message */}
            {success && (
              <Alert className="mb-4 border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}

            {/* Error Message */}
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Branches</h1>
                <p className="text-muted-foreground mt-1">Manage your showrooms and godowns</p>
              </div>
              
              {/*  Only show Add Branch button if user has create permission */}
              <PermissionGate module="branches" action="create">
                <Link href="/branch/register">
                  <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Branch
                  </Button>
                </Link>
              </PermissionGate>
            </div>

            <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
              <CardContent className="p-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by branch name, city, or type..."
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
                    <Store className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No branches found</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    {searchTerm
                      ? "Try adjusting your search criteria"
                      : "Get started by registering your first branch"}
                  </p>
                  {!searchTerm && (
                    <PermissionGate module="branches" action="create">
                      <Link href="/branch/register">
                        <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Branch
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
                        <SortableTableHead label="Branch Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} className="w-[34%]" />
                        <SortableTableHead label="Type" active={sortState.key === "type"} direction={sortState.direction} onClick={() => handleSort("type")} className="w-[12%]" />
                        <SortableTableHead label="Operation Model" active={sortState.key === "operationModel"} direction={sortState.direction} onClick={() => handleSort("operationModel")} className="w-[18%]" />
                        <SortableTableHead label="Location" active={sortState.key === "location"} direction={sortState.direction} onClick={() => handleSort("location")} className="w-[20%]" />
                        <SortableTableHead label="Contact" active={sortState.key === "contact"} direction={sortState.direction} onClick={() => handleSort("contact")} className="w-[11%]" />
                        <TableHead className="font-semibold text-center w-[10%]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branches.map((branch) => (
                        <TableRow key={branch.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                                {branch.type === "showroom" ? (
                                  <Store className="h-5 w-5 text-white" />
                                ) : (
                                  <Warehouse className="h-5 w-5 text-white" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{branch.name}</p>
                                <p className="text-xs text-muted-foreground">{branch.contactEmail}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {branch.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={branch.operationModel === "company-operated" ? "default" : "secondary"}
                              className="capitalize"
                            >
                              {branch.operationModel?.replace("-", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm">{branch.city}</p>
                                <p className="text-xs text-muted-foreground">{branch.state}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span>{branch.contactPhone}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              {/* View Icon - Always visible if user can view */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/branch/view?id=${branch.id}`)}
                                className="h-8 w-8 hover:bg-accent/10 hover:text-accent transition-colors"
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              
                              {/* ✅ Edit Icon - Only if user has update permission */}
                              <PermissionGate module="branches" action="update">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => router.push(`/branch/edit?id=${branch.id}`)}
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              
                              {/* ✅ Delete Icon - Only if user has delete permission */}
                              <PermissionGate module="branches" action="delete">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteClick(branch)}
                                  className="h-8 w-8 hover:bg-red-50 hover:text-red-600 transition-colors"
                                  title="Delete"
                                >
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
                  itemLabel="branches"
                />
              </Card>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will <strong className="text-red-600">permanently delete</strong> <strong>{branchToDelete?.name}</strong> from the database. 
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteBranch}
                    disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700"
                  >
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
