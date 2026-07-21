"use client"

import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Trash2, AlertCircle, Briefcase, Edit, Search, CheckCircle2, X, Check, ChevronsUpDown, Loader2 } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { companyAPI, departmentAPI, designationAPI, rbacAPI } from "@/lib/api"
import type { Company, Department, Designation, Role } from "@/lib/api"
import { usePermissions } from "@/hooks/usePermissions"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

// ─────────────────────────────────────────────────────────────────────────────
// DesignationFormFields — the SINGLE source of truth for form fields.
//
// HOW TO ADD A NEW FIELD:
//   1. Add it to DesignationFormValues below
//   2. Add the default value in EMPTY_FORM
//   3. Add mapping in designationToFormValues
//   4. Add the JSX input here inside DesignationFormFields
//   5. Add it to the payload in handleSubmit
//   That's it — both Add and Edit dialogs will automatically include it.
//
// NOTE: Company & Department selectors are Add-only (passed via addOnlyProps).
//       They are rendered above the shared fields, not inside this component.
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignationFormValues {
  name: string
  level: string
  reportsTo: string | undefined
  selectedRoles: string[]
  // 👇 Add new fields here, e.g.:
  // description: string
  // isActive: boolean
}

interface DesignationFormFieldsProps {
  values: DesignationFormValues
  onChange: (updated: Partial<DesignationFormValues>) => void
  onSubmit: () => void
  error: string
  isSubmitting: boolean
  mode: "add" | "edit"
  // External data
  roles: Role[]
  rolesLoading: boolean
  availableReportsTo: Designation[]
  currentDesignationId?: string   // to exclude self from "reports to" list
  rolePopoverOpen: boolean
  onRolePopoverOpenChange: (open: boolean) => void
}

function parseRoleIds(rawRoleIds: unknown): string[] {
  if (!rawRoleIds) return []

  if (Array.isArray(rawRoleIds)) {
    return rawRoleIds.map((id) => String(id).trim()).filter(Boolean)
  }

  if (typeof rawRoleIds === "string") {
    const trimmed = rawRoleIds.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id).trim()).filter(Boolean)
      }
    } catch {
      return trimmed.split(",").map((id) => id.trim()).filter(Boolean)
    }
  }

  return []
}

interface RoleSearchMultiSelectProps {
  roles: Role[]
  selectedRoleIds: string[]
  open: boolean
  disabled?: boolean
  onOpenChange: (open: boolean) => void
  onToggleRole: (roleId: string) => void
  onClear: () => void
}

function RoleSearchMultiSelect({
  roles,
  selectedRoleIds,
  open,
  disabled = false,
  onOpenChange,
  onToggleRole,
  onClear,
}: RoleSearchMultiSelectProps) {
  const [searchValue, setSearchValue] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filteredRoles = useMemo(() => {
    const q = searchValue.toLowerCase().trim()
    if (!q) return roles

    return roles.filter((role) =>
      role.name.toLowerCase().includes(q) ||
      (role.description || "").toLowerCase().includes(q)
    )
  }, [roles, searchValue])

  useEffect(() => {
    if (!open) setSearchValue("")
  }, [open])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredRoles.length])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }

    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [onOpenChange])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${highlightedIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [highlightedIndex])

  const selectedRoles = roles.filter((role) => selectedRoleIds.includes(role.id))
  const triggerLabel =
    selectedRoles.length === 0
      ? ""
      : selectedRoles.length <= 2
        ? selectedRoles.map((role) => role.name).join(", ")
        : `${selectedRoles.length} role(s) selected`

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(filteredRoles.length - 1, 0)))
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((index) => Math.max(index - 1, 0))
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      const role = filteredRoles[highlightedIndex]
      if (role) onToggleRole(role.id)
      return
    }

    if (e.key === "Escape") {
      onOpenChange(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          "flex items-center h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background transition-colors",
          open && "ring-2 ring-ring ring-offset-2",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onClick={() => {
          if (disabled) return
          onOpenChange(true)
          inputRef.current?.focus()
        }}
      >
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={open ? searchValue : triggerLabel}
          onChange={(e) => {
            setSearchValue(e.target.value)
            onOpenChange(true)
          }}
          onFocus={() => {
            if (!disabled) onOpenChange(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search and select roles"
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {selectedRoleIds.length > 0 && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onClear()
              setSearchValue("")
              inputRef.current?.focus()
            }}
            className="mr-1 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear selected roles"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronsUpDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {filteredRoles.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
              No roles found.
            </div>
          ) : (
            <div ref={listRef} className="max-h-64 overflow-y-auto">
              {filteredRoles.map((role, index) => {
                const isSelected = selectedRoleIds.includes(role.id)
                const isHighlighted = index === highlightedIndex

                return (
                  <div
                    key={role.id}
                    data-idx={index}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onToggleRole(role.id)
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                      isHighlighted && "bg-accent text-accent-foreground",
                      !isHighlighted && isSelected && "bg-primary/5"
                    )}
                  >
                    <Check className={cn("mt-0.5 h-4 w-4 flex-shrink-0", isSelected ? "opacity-100 text-primary" : "opacity-0")} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{role.name}</div>
                      {role.description && (
                        <div className="text-xs text-muted-foreground truncate">{role.description}</div>
                      )}
                    </div>
                    {role.isSystemRole && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        System
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DesignationFormFields({
  values,
  onChange,
  onSubmit,
  error,
  isSubmitting,
  mode,
  roles,
  rolesLoading,
  availableReportsTo,
  currentDesignationId,
  rolePopoverOpen,
  onRolePopoverOpenChange,
}: DesignationFormFieldsProps) {

  const toggleRole = (roleId: string) => {
    const next = values.selectedRoles.includes(roleId)
      ? values.selectedRoles.filter((id) => id !== roleId)
      : [...values.selectedRoles, roleId]
    onChange({ selectedRoles: next })
  }

  return (
    <div className="space-y-4">

      {/* ── Designation Name ───────────────────────────── */}
      <div className="space-y-2">
        <Label>
          Designation Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      {/* ── Hierarchy Level ────────────────────────────── */}
      <div className="space-y-2">
        <Label>
          Hierarchy Level <span className="text-destructive">*</span>
        </Label>
        <Select value={values.level} onValueChange={(v) => onChange({ level: v, reportsTo: undefined })}>
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Select hierarchy level" />
          </SelectTrigger>
          <SelectContent>
            {[1,2,3,4,5,6,7,8,9,10].map((l) => (
              <SelectItem key={l} value={l.toString()}>Level {l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Reports To ─────────────────────────────────── */}
      <div className="space-y-2">
        <Label>Reports To (Optional)</Label>
        <Select
          value={values.reportsTo ?? ""}
          onValueChange={(v) => onChange({ reportsTo: v === "NONE" ? undefined : v })}
          disabled={availableReportsTo.length === 0}
        >
          <SelectTrigger className="w-full h-10">
            <SelectValue placeholder="Select reporting designation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">None</SelectItem>
            {availableReportsTo.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} (Level {d.level})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Assigned Roles ─────────────────────────────── */}
      <div className="space-y-2">
        <Label>
          Assigned Roles <span className="text-destructive">*</span>
        </Label>
        {rolesLoading ? (
          <div className="flex items-center justify-center p-4 border rounded-md">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Loading roles...</span>
          </div>
        ) : (
          <RoleSearchMultiSelect
            roles={roles}
            selectedRoleIds={values.selectedRoles}
            open={rolePopoverOpen}
            disabled={roles.length === 0}
            onOpenChange={onRolePopoverOpenChange}
            onToggleRole={toggleRole}
            onClear={() => onChange({ selectedRoles: [] })}
          />
        )}

        {/* Selected role badges */}
        {values.selectedRoles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {values.selectedRoles.map((roleId) => {
              const role = roles.find((r) => r.id === roleId)
              return (
                <Badge key={roleId} variant="secondary" className="gap-1">
                  {role?.name || roleId}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => toggleRole(roleId)}
                  />
                </Badge>
              )
            })}
          </div>
        )}

        {!rolesLoading && (
          <p className="text-xs text-muted-foreground">
            {roles.length === 0
              ? "⚠️ No roles found. Create roles in RBAC section first."
              : `✅ ${roles.length} role(s) available`}
          </p>
        )}
      </div>

      {/* ── ADD NEW FIELDS BELOW THIS LINE ────────────── */}
      {/*
      <div className="space-y-2">
        <Label htmlFor="desig-description">Description</Label>
        <Input
          id="desig-description"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
      */}

      {/* ── Error ─────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Submit Button ──────────────────────────────── */}
      <div className="flex gap-3 pt-2">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
        >
          {isSubmitting
            ? mode === "add" ? "Adding..." : "Saving..."
            : mode === "add" ? "Add Designation" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Default empty form values — update when you add new fields
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_FORM: DesignationFormValues = {
  name: "",
  level: "1",
  reportsTo: undefined,
  selectedRoles: [],
  // description: "",
}

function designationToFormValues(desig: Designation, parseRoleIds: (v: any) => string[]): DesignationFormValues {
  return {
    name: desig.name,
    level: desig.level.toString(),
    reportsTo: desig.reportsToDesignationId,
    selectedRoles: parseRoleIds(desig.roleIds),
    // description: desig.description ?? "",
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export function DesignationManager() {
  type DesignationSortKey = "name" | "department" | "company" | "level" | "roles"
  const [companies, setCompanies] = useState<Company[]>([])
  // Page rows shown in the table (server-side paginated).
  const [designations, setDesignations] = useState<Designation[]>([])
  // Full list (un-paginated) used by the "Reports To" dropdown logic only.
  const [allDesignations, setAllDesignations] = useState<Designation[]>([])
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
  const [sortState, setSortState] = useState<SortState<DesignationSortKey>>({
    key: "name",
    direction: "asc",
  })

  // ── Unified dialog state ──────────────────────────────────
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formValues, setFormValues] = useState<DesignationFormValues>(EMPTY_FORM)
  const [editingDesignation, setEditingDesignation] = useState<Designation | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [rolePopoverOpen, setRolePopoverOpen] = useState(false)

  // ── Add-only state (company/department selectors) ─────────
  const [addCompany, setAddCompany] = useState("")
  const [addDepartment, setAddDepartment] = useState("")
  const [addDepartments, setAddDepartments] = useState<Department[]>([])

  // ── Roles state (shared, loaded per context) ──────────────
  const [roles, setRoles] = useState<Role[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)

  // ── Delete dialog state ───────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [designationToDelete, setDesignationToDelete] = useState<Designation | null>(null)
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
    loadRoles()
  }, [])

  // The "Reports To" dropdown needs the full designation list (filtered by
  // department/level), so this is fetched separately without pagination params.
  const loadAllDesignations = async () => {
    const token = sessionStorage.getItem("authToken")
    if (!token) return
    const res = await designationAPI.getAll(token)
    if (res.success) setAllDesignations(res.data || [])
  }

  useEffect(() => {
    void loadAllDesignations()
  }, [refreshToken])

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
        const res = await designationAPI.getAll(token, undefined, undefined, {
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
          setDesignations(rows)
          setTotalItems(nextTotal)
          setError("")
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          )
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages)
        } else {
          setDesignations([])
          setTotalItems(0)
          setError(res.message || "Failed to load designations")
        }
      } catch {
        if (!cancelled) {
          setDesignations([])
          setTotalItems(0)
          setError("Failed to load designations")
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

  const handleSort = (key: DesignationSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  // Load departments when company changes in Add mode
  useEffect(() => {
    if (!addCompany) { setAddDepartments([]); setAddDepartment(""); return }
    const fetch = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await departmentAPI.getAll(token, addCompany)
      if (res.success) setAddDepartments(res.data)
    }
    fetch()
  }, [addCompany])

  // Load roles when company changes in Add mode, or when editing designation loads
  const loadRoles = async (companyId?: string) => {
    setRolesLoading(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const userRole = sessionStorage.getItem("userRole")
      const sessionCompanyId = sessionStorage.getItem("companyId") || undefined
      const roleScopeCompanyId =
        userRole === "super_admin"
          ? undefined
          : companyId || sessionCompanyId

      const res = await rbacAPI.getAllRoles(token, roleScopeCompanyId)
      if (res.success && res.data) {
        setRoles(res.data.filter((r: Role) => r.isActive))
      } else {
        setRoles([])
      }
    } finally {
      setRolesLoading(false)
    }
  }

  useEffect(() => {
    if (dialogMode === "add") loadRoles(addCompany)
  }, [addCompany, dialogMode])

  const getRoleLabel = (roleId: string) =>
    roles.find((role) => role.id === roleId)?.name || roleId

  // ── Open Add ──────────────────────────────────────────────
  const handleOpenAdd = () => {
    setDialogMode("add")
    setFormValues(EMPTY_FORM)
    setEditingDesignation(null)
    setAddCompany("")
    setAddDepartment("")
    setAddDepartments([])
    setFormError("")
    setRolePopoverOpen(false)
    setDialogOpen(true)
    loadRoles()
  }

  // ── Open Edit ─────────────────────────────────────────────
  const handleEditClick = async (desig: Designation) => {
    setDialogMode("edit")
    setFormValues(designationToFormValues(desig, parseRoleIds))
    setEditingDesignation(desig)
    setFormError("")
    setRolePopoverOpen(false)
    setDialogOpen(true)
    // Load roles for this designation's company
    if (desig.companyId) await loadRoles(desig.companyId)
  }

  // ── Available "reports to" options ────────────────────────
  const getAvailableReportsTo = (): Designation[] => {
    const level = Number(formValues.level)
    if (dialogMode === "add") {
      return addDepartment
        ? allDesignations.filter((d) => d.departmentId === addDepartment && d.level < level)
        : []
    } else {
      return allDesignations.filter(
        (d) =>
          d.id !== editingDesignation?.id &&
          d.departmentId === editingDesignation?.departmentId &&
          d.level < level
      )
    }
  }

  // ── Validate form ─────────────────────────────────────────
  const validateForm = (): boolean => {
    if (dialogMode === "add") {
      if (!addCompany) { setFormError("Please select a company"); return false }
      if (!addDepartment) { setFormError("Please select a department"); return false }
    }
    if (!formValues.name.trim()) { setFormError("Please enter designation name"); return false }
    if (formValues.selectedRoles.length === 0) { setFormError("Please select at least one role"); return false }
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

      // Build the payload — add new fields here to send them to the API
      const sharedPayload = {
        name: formValues.name.trim(),
        level: Number(formValues.level),
        reportsToDesignationId: formValues.reportsTo,
        roleIds: formValues.selectedRoles,
        // description: formValues.description,
      }

      if (dialogMode === "add") {
        const res = await designationAPI.register(
          { ...sharedPayload, companyId: addCompany, departmentId: addDepartment },
          token
        )
        if (res.success) {
          setRefreshToken((v) => v + 1)
          setDialogOpen(false)
          showSuccess(`Designation "${res.data.name}" added successfully`)
        } else {
          setFormError(res.message || "Failed to add designation")
        }
      } else {
        if (!editingDesignation) return
        const res = await designationAPI.update(editingDesignation.id, sharedPayload, token)
        if (res.success) {
          setRefreshToken((v) => v + 1)
          setDialogOpen(false)
          setEditingDesignation(null)
          showSuccess("Designation updated successfully")
        } else {
          setFormError(res.message || "Failed to update designation")
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
  const handleDeleteClick = (desig: Designation) => {
    if (!canDelete("designations")) {
      setError("You don't have permission to delete designations")
      setTimeout(() => setError(""), 3000)
      return
    }
    setDesignationToDelete(desig)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!designationToDelete) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await designationAPI.delete(designationToDelete.id, token)
      if (res.success) {
        setRefreshToken((v) => v + 1)
        setDeleteDialogOpen(false)
        setDesignationToDelete(null)
        showSuccess("Designation deleted successfully")
      } else {
        setError(res.message || "Failed to delete designation")
      }
    } finally {
      setIsDeleting(false)
    }
  }

  // ── Access Denied ─────────────────────────────────────────
  if (!canView("designations")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <AlertCircle className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have permission to view designations.
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
          <p className="text-muted-foreground">Loading designations...</p>
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
            <h1 className="text-3xl font-bold tracking-tight">Designations</h1>
            <p className="text-muted-foreground mt-1">View and manage all designations</p>
          </div>
          <PermissionGate module="designations" action="create">
            <Button
              onClick={handleOpenAdd}
              className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Designation
            </Button>
          </PermissionGate>
        </div>

        {/* Search */}
        <Card className="mb-6 border-border/50 shadow-sm">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by designation name, department or company..."
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
                <Briefcase className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold mb-2">No designations found</p>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                {searchTerm ? "Try adjusting your search criteria" : "Get started by adding your first designation"}
              </p>
              {!searchTerm && (
                <PermissionGate module="designations" action="create">
                  <Button onClick={handleOpenAdd} className="bg-gradient-to-r from-accent to-accent-secondary">
                    <Plus className="h-4 w-4 mr-2" />Add Designation
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
                    <SortableTableHead label="Designation" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} />
                    <SortableTableHead label="Department" active={sortState.key === "department"} direction={sortState.direction} onClick={() => handleSort("department")} />
                    <SortableTableHead label="Company" active={sortState.key === "company"} direction={sortState.direction} onClick={() => handleSort("company")} />
                    <SortableTableHead label="Level" active={sortState.key === "level"} direction={sortState.direction} onClick={() => handleSort("level")} className="text-center" buttonClassName="justify-center" />
                    <SortableTableHead label="Roles" active={sortState.key === "roles"} direction={sortState.direction} onClick={() => handleSort("roles")} />
                    <TableHead className="font-semibold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {designations.map((desig) => {
                    const roleIds = parseRoleIds(desig.roleIds)
                    return (
                      <TableRow key={desig.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                              <Briefcase className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium">{desig.name}</p>
                              {desig.reportsToName && (
                                <p className="text-xs text-muted-foreground">Reports to: {desig.reportsToName}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground">{desig.departmentName || "—"}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground">{desig.companyName || "—"}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">Level {desig.level}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {roleIds.length === 0 ? (
                              <span className="text-sm text-muted-foreground">—</span>
                            ) : (
                              roleIds.slice(0, 2).map((roleId) => (
                                <Badge key={roleId} variant="secondary" className="text-xs">
                                  {getRoleLabel(roleId)}
                                </Badge>
                              ))
                            )}
                            {roleIds.length > 2 && (
                              <Badge variant="outline" className="text-xs">+{roleIds.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <PermissionGate module="designations" action="update">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditClick(desig)}
                                className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate module="designations" action="delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(desig)}
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
              itemLabel="designations"
            />
          </Card>
        )}

        {/* ── UNIFIED ADD / EDIT DIALOG ──────────────────── */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
                  {dialogMode === "add"
                    ? <Plus className="h-4 w-4 text-white" />
                    : <Edit className="h-4 w-4 text-white" />}
                </div>
                {dialogMode === "add" ? "Add Designation" : "Edit Designation"}
              </DialogTitle>
              <DialogDescription>
                {dialogMode === "add"
                  ? "Create a new designation with roles"
                  : <>Update details for <strong>{editingDesignation?.name}</strong></>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {/* ── Add-only: Company + Department selectors ── */}
              {dialogMode === "add" && (
                <>
                  <div className="space-y-2">
                    <Label>Company <span className="text-destructive">*</span></Label>
                  <Select
                      value={addCompany}
                      onValueChange={(v) => {
                        setAddCompany(v)
                        setAddDepartment("")
                        setFormValues((prev) => ({ ...prev, selectedRoles: [] }))
                      }}
                    >
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

                  <div className="space-y-2">
                    <Label>Department <span className="text-destructive">*</span></Label>
                    <Select
                      value={addDepartment}
                      onValueChange={setAddDepartment}
                      disabled={!addCompany}
                    >
                      <SelectTrigger className="w-full h-10">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {addDepartments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Single shared form — add fields to DesignationFormFields above */}
              <DesignationFormFields
                values={formValues}
                onChange={(updated) => setFormValues((prev) => ({ ...prev, ...updated }))}
                onSubmit={handleSubmit}
                error={formError}
                isSubmitting={isSubmitting}
                mode={dialogMode}
                roles={roles}
                rolesLoading={rolesLoading}
                availableReportsTo={getAvailableReportsTo()}
                currentDesignationId={editingDesignation?.id}
                rolePopoverOpen={rolePopoverOpen}
                onRolePopoverOpenChange={setRolePopoverOpen}
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
                <strong>{designationToDelete?.name}</strong>. This action cannot be undone.
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
