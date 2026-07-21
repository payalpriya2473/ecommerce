"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Trash2, AlertCircle, Building2, Edit, Search, CheckCircle2 } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { companyAPI, departmentAPI } from "@/lib/api"
import type { Company, Department } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

// ─────────────────────────────────────────────────────────────────────────────
// DepartmentFormFields — the SINGLE source of truth for form fields.
//
// HOW TO ADD A NEW FIELD:
//   1. Add it to DepartmentFormValues below
//   2. Add the default value in EMPTY_FORM
//   3. Add mapping in departmentToFormValues
//   4. Add the JSX input here inside DepartmentFormFields
//   5. Add it to the payload in handleSubmit
//   That's it — both Add and Edit dialogs will automatically include it.
//
// NOTE: The Company selector is Add-only. It is rendered above this component
//       in the dialog, not inside DepartmentFormFields.
// ─────────────────────────────────────────────────────────────────────────────

export interface DepartmentFormValues {
  name: string
  description: string
  // 👇 Add new fields here, e.g.:
  // headCount: string
  // location: string
}

interface DepartmentFormFieldsProps {
  values: DepartmentFormValues
  onChange: (updated: Partial<DepartmentFormValues>) => void
  onSubmit: () => void
  error: string
  isSubmitting: boolean
  mode: "add" | "edit"
}

function DepartmentFormFields({
  values,
  onChange,
  onSubmit,
  error,
  isSubmitting,
  mode,
}: DepartmentFormFieldsProps) {
  return (
    <div className="space-y-4">

      {/* ── Department Name ────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="dept-name">
          Department Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="dept-name"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        />
      </div>

      {/* ── Description ───────────────────────────────── */}
      <div className="space-y-2">
        <Label htmlFor="dept-desc">Description</Label>
        <Textarea
          id="dept-desc"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
        />
      </div>

      {/* ── Error ─────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Submit Button ──────────────────────────────── */}
      <div className="pt-2">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
        >
          {isSubmitting
            ? mode === "add" ? "Adding..." : "Saving..."
            : mode === "add" ? "Add Department" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Default empty form values — update when you add new fields
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_FORM: DepartmentFormValues = {
  name: "",
  description: "",
  // location: "",
}

function departmentToFormValues(dept: Department): DepartmentFormValues {
  return {
    name: dept.name,
    description: dept.description || "",
    // location: dept.location ?? "",
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function DepartmentManager() {
  type DepartmentSortKey = "name" | "company" | "description"
  const [companies, setCompanies] = useState<Company[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
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
  const [sortState, setSortState] = useState<SortState<DepartmentSortKey>>({
    key: "name",
    direction: "asc",
  })

  // ── Unified dialog state ──────────────────────────────────
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formValues, setFormValues] = useState<DepartmentFormValues>(EMPTY_FORM)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  // ── Add-only: Company selector ────────────────────────────
  const [addCompany, setAddCompany] = useState("")

  // ── Delete dialog state ───────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { canView, canDelete } = usePermissions()

  useEffect(() => {
    const fetchCompanies = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await companyAPI.getAll(token)
      if (res.success) setCompanies(res.data)
    }
    fetchCompanies()
  }, [])

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
        const res = await departmentAPI.getAll(token, undefined, {
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
          setDepartments(rows)
          setTotalItems(nextTotal)
          setError("")
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          setDepartments([])
          setTotalItems(0)
          setError(res.message || "Failed to load departments")
        }
      } catch {
        if (!cancelled) {
          setDepartments([])
          setTotalItems(0)
          setError("Failed to load departments")
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

  const handleSort = (key: DepartmentSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  // ── Open Add ──────────────────────────────────────────────
  const handleOpenAdd = () => {
    setDialogMode("add")
    setFormValues(EMPTY_FORM)
    setEditingDepartment(null)
    setAddCompany("")
    setFormError("")
    setDialogOpen(true)
  }

  // ── Open Edit ─────────────────────────────────────────────
  const handleEditClick = (dept: Department) => {
    setDialogMode("edit")
    setFormValues(departmentToFormValues(dept))
    setEditingDepartment(dept)
    setFormError("")
    setDialogOpen(true)
  }

  // ── Validate form ─────────────────────────────────────────
  const validateForm = (): boolean => {
    if (dialogMode === "add" && !addCompany) {
      setFormError("Please select a company")
      return false
    }
    if (!formValues.name.trim()) {
      setFormError("Please enter department name")
      return false
    }
    // Add more validation here for new fields if needed
    return true
  }

  // ── Submit (handles both Add and Edit) ────────────────────
  const handleSubmit = async () => {
    setFormError("")
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return

      // Build the shared payload — add new fields here to send them to the API
      const sharedPayload = {
        name: formValues.name.trim(),
        description: formValues.description.trim() || undefined,
        // location: formValues.location.trim() || undefined,
      }

      if (dialogMode === "add") {
        const res = await departmentAPI.register(
          { ...sharedPayload, companyId: addCompany },
          token
        )
        if (res.success) {
          setRefreshToken((v) => v + 1)
          setDialogOpen(false)
          showSuccess(`Department "${res.data.name}" added successfully`)
        } else {
          setFormError(res.message || "Failed to add department")
        }
      } else {
        if (!editingDepartment) return
        const res = await departmentAPI.update(editingDepartment.id, sharedPayload, token)
        if (res.success) {
          setRefreshToken((v) => v + 1)
          setDialogOpen(false)
          setEditingDepartment(null)
          showSuccess("Department updated successfully")
        } else {
          setFormError(res.message || "Failed to update department")
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 3000)
  }

  // ── Delete ────────────────────────────────────────────────
  const handleDeleteClick = (dept: Department) => {
    if (!canDelete("departments")) {
      setError("You don't have permission to delete departments")
      setTimeout(() => setError(""), 3000)
      return
    }
    setDepartmentToDelete(dept)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!departmentToDelete) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await departmentAPI.delete(departmentToDelete.id, token)
      if (res.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false)
        setDepartmentToDelete(null)
        showSuccess("Department deleted successfully")
      } else {
        setError(res.message || "Failed to delete department")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  // ── Access Denied ─────────────────────────────────────────
  if (!canView("departments")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view departments.
              <br />Please contact your administrator.
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
          <p className="text-muted-foreground">Loading departments...</p>
        </div>
      </div>
    )
  }

  // ── Main Render ───────────────────────────────────────────
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

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Departments</h1>
            <p className="text-muted-foreground mt-1">View and manage all departments</p>
          </div>
          <PermissionGate module="departments" action="create">
            <Button
              onClick={handleOpenAdd}
              className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Department
            </Button>
          </PermissionGate>
        </div>

        {/* Search */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by department name, description or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11"
              />
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        {totalItems === 0 ? (
          <Card className="border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mb-2">No departments found</p>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first department"}
              </p>
              {!searchTerm && (
                <PermissionGate module="departments" action="create">
                  <Button onClick={handleOpenAdd} className="bg-gradient-to-r from-accent to-accent-secondary">
                    <Plus className="h-4 w-4 mr-2" />Add Department
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
                    <SortableTableHead label="Department Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} />
                    <SortableTableHead label="Company" active={sortState.key === "company"} direction={sortState.direction} onClick={() => handleSort("company")} />
                    <SortableTableHead label="Description" active={sortState.key === "description"} direction={sortState.direction} onClick={() => handleSort("description")} />
                    <TableHead className="font-semibold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((dept) => (
                    <TableRow key={dept.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                            <Building2 className="h-5 w-5 text-white" />
                          </div>
                          <p className="font-medium">{dept.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">{dept.companyName || "—"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground truncate max-w-xs">
                          {dept.description || "—"}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <PermissionGate module="departments" action="update">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(dept)}
                              className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate module="departments" action="delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(dept)}
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
              itemLabel="departments"
            />
          </Card>
        )}

        {/* ── UNIFIED ADD / EDIT DIALOG ──────────────────── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
                  {dialogMode === "add"
                    ? <Plus className="h-4 w-4 text-white" />
                    : <Edit className="h-4 w-4 text-white" />}
                </div>
                {dialogMode === "add" ? "Add Department" : "Edit Department"}
              </DialogTitle>
              <DialogDescription>
                {dialogMode === "add"
                  ? "Create a new department for your organization"
                  : <>Update details for <strong>{editingDepartment?.name}</strong></>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* ── Add-only: Company selector ─────────────── */}
              {dialogMode === "add" && (
                <div className="space-y-2">
                  <Label>Company <span className="text-destructive">*</span></Label>
                  <Select value={addCompany} onValueChange={setAddCompany}>
                    <SelectTrigger className="w-full h-10">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Single shared form — add fields to DepartmentFormFields above */}
              <DepartmentFormFields
                values={formValues}
                onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
                onSubmit={handleSubmit}
                error={formError}
                isSubmitting={isSubmitting}
                mode={dialogMode}
              />
            </div>

            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSubmitting}
              className="w-full -mt-2"
            >
              Cancel
            </Button>
          </DialogContent>
        </Dialog>

        {/* ── DELETE DIALOG ──────────────────────────────── */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will{" "}
                <strong className="text-red-600">permanently delete</strong>{" "}
                <strong>{departmentToDelete?.name}</strong>. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {isDeleting ? "Deleting..." : "Yes, Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  )
}
