"use client";
import { resolveAssetUrl } from "@/lib/asset-url"

import { useEffect, useState } from "react";
import Link from "next/link";

import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Search,
  UserPlus,
  Eye,
  Edit,
  Loader2,
  KeyRound,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import {
  employeeAPI,
  departmentAPI,
  designationAPI,
  Employee,
  Department,
  Designation,
} from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head";
import { type SortState } from "@/lib/table-sort";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";

export default function EmployeeListPage() {
  type EmployeeSortKey =
    | "employeeNo"
    | "name"
    | "department"
    | "designation"
    | "contact"
    | "status";
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [refreshToken, setRefreshToken] = useState(0);

  // ✅ Password Change Dialog State
  const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null,
  );
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [sortState, setSortState] = useState<SortState<EmployeeSortKey>>({
    key: "name",
    direction: "asc",
  });
  const { canView, canCreate, canEdit, canDelete } = usePermissions();

  /* =========================
     LOAD DEPARTMENTS / DESIGNATIONS (once — needed for name lookups + sort)
  ========================= */
  useEffect(() => {
    const loadLookups = async () => {
      const token = sessionStorage.getItem("authToken");
      const companyId = sessionStorage.getItem("companyId");
      if (!token) return;
      try {
        const deptRes = await departmentAPI.getAll(token, companyId || undefined);
        if (deptRes.success) setDepartments(deptRes.data);

        const desigRes = await designationAPI.getAll(token, companyId || undefined);
        if (desigRes.success) setDesignations(desigRes.data);
      } catch (err) {
        console.error("Failed to load lookups", err);
      }
    };
    loadLookups();
  }, []);

  /* =========================
     SEARCH DEBOUNCE
  ========================= */
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // Reset to first page whenever search or sort changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, sortState]);

  /* =========================
     LOAD EMPLOYEES (server-side pagination)
  ========================= */
  useEffect(() => {
    let cancelled = false;
    const loadPage = async () => {
      const token = sessionStorage.getItem("authToken");
      const role = sessionStorage.getItem("userRole");
      const companyId = sessionStorage.getItem("companyId");
      if (!token) return;

      try {
        if (!hasLoadedOnce) setLoading(true);
        const empRes = await employeeAPI.getAll(token, {
          page: currentPage,
          limit: pageSize,
          search: debouncedSearchTerm || undefined,
          sortKey: sortState.key,
          sortDirection: sortState.direction,
          // Non-super-admin users are restricted to their own company.
          ...(role !== "super_admin" && companyId ? { companyId } : {}),
        });
        if (cancelled) return;
        if (empRes.success) {
          const rows = Array.isArray(empRes.data) ? empRes.data : [];
          const pagination = empRes.pagination || {};
          const nextTotal = Number(pagination.totalItems ?? rows.length ?? 0);
          setEmployees(rows);
          setTotalItems(nextTotal);
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          );
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages);
        } else {
          setEmployees([]);
          setTotalItems(0);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load employees", err);
          setEmployees([]);
          setTotalItems(0);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      }
    };
    loadPage();
    return () => { cancelled = true; };
  }, [currentPage, pageSize, debouncedSearchTerm, sortState, refreshToken]);

  /* =========================
     HELPERS
  ========================= */
  const getDepartmentName = (id?: string | null) =>
    departments.find((d) => d.id === id)?.name || "N/A";

  const getDesignationName = (id?: string | null) =>
    designations.find((d) => d.id === id)?.name || "N/A";

  const toggleStatusUI = async (id: string) => {
    const token = sessionStorage.getItem("authToken");
    if (!token) return;

    // Optimistic toggle over the current visible page rows (behavior preserved).
    setEmployees((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isActive: !e.isActive } : e)),
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handleSort = (key: EmployeeSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  /* =========================
     ✅ PASSWORD CHANGE
  ========================= */
  const handleOpenPasswordDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setNewPassword("");
    setShowPassword(false);
    setOpenPasswordDialog(true);
  };

  const handleUpdatePassword = async () => {
    if (!selectedEmployee || !selectedEmployee.email) {
      toast({
        title: "Error",
        description: "Employee email not found",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      toast({
        title: "Invalid Password",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      return;
    }

    const token = sessionStorage.getItem("authToken");
    if (!token) return;

    setPasswordLoading(true);

    try {
      const res = await employeeAPI.updatePassword(
        selectedEmployee.email,
        newPassword,
        token,
      );

      if (res.success) {
        toast({
          title: "Password Updated",
          description: `Password for ${selectedEmployee.name} has been changed successfully`,
        });
        setOpenPasswordDialog(false);
      } else {
        toast({
          title: "Update Failed",
          description: res.message || "Failed to update password",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update password",
        variant: "destructive",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  /* =========================
     UI
  ========================= */

  if (!canView("employees")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">
                  You don't have permission to view employees.
                </p>
              </CardContent>
            </Card>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 md:px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold">Employees</h2>
              <p className="text-muted-foreground">
                Manage your company employees ({totalItems} total)
              </p>
            </div>

            <PermissionGate module="employees" action="create">
              <Link href="/employee/register">
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Employee
                </Button>
              </Link>
            </PermissionGate>
          </div>

          {/* Search */}
          <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
            <CardContent className="p-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-10 text-sm"
                  placeholder="Search employees..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p>Loading employees...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="font-semibold">Photo</TableHead>
                        <SortableTableHead label="Emp No." active={sortState.key === "employeeNo"} direction={sortState.direction} onClick={() => handleSort("employeeNo")} />
                        <SortableTableHead label="Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} />
                        <SortableTableHead label="Department" active={sortState.key === "department"} direction={sortState.direction} onClick={() => handleSort("department")} />
                        <SortableTableHead label="Designation" active={sortState.key === "designation"} direction={sortState.direction} onClick={() => handleSort("designation")} />
                        <SortableTableHead label="Contact" active={sortState.key === "contact"} direction={sortState.direction} onClick={() => handleSort("contact")} />
                        <SortableTableHead label="Status" active={sortState.key === "status"} direction={sortState.direction} onClick={() => handleSort("status")} />
                        <TableHead className="text-right font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {employees.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="text-center py-12 text-muted-foreground"
                          >
                            {searchTerm
                              ? "No employees found matching your search"
                              : "No employees found. Start by adding one!"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        employees.map((employee) => (
                          <TableRow key={employee.id}>
                            <TableCell>
                              <Avatar>
                                <AvatarImage
                                  src={
                                    employee.photoUrl
                                      ? resolveAssetUrl(employee.photoUrl)
                                      : undefined
                                  }
                                  alt={employee.name}
                                />
                                <AvatarFallback>
                                  {getInitials(employee.name)}
                                </AvatarFallback>
                              </Avatar>
                            </TableCell>
                            <TableCell className="font-medium">
                              {employee.employeeNo}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{employee.name}</p>
                                <p className="text-sm text-muted-foreground capitalize">
                                  {employee.gender}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {getDepartmentName(employee.departmentId)}
                            </TableCell>
                            <TableCell>
                              {getDesignationName(employee.designationId)}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {employee.email && (
                                  <p className="text-sm">{employee.email}</p>
                                )}
                                <p className="text-sm text-muted-foreground">
                                  {employee.mobile}
                                </p>
                              </div>
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-2">
                                <PermissionGate
                                  module="employees"
                                  action="update"
                                >
                                  <Switch
                                    checked={employee.isActive}
                                    onCheckedChange={() =>
                                      toggleStatusUI(employee.id)
                                    }
                                  />
                                </PermissionGate>
                                <Badge
                                  variant={
                                    employee.isActive ? "default" : "secondary"
                                  }
                                >
                                  {employee.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Link href={`/employee/view?id=${employee.id}`}>
                                  <Button variant="outline" size="sm">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <PermissionGate
                                  module="employees"
                                  action="update"
                                >
                                  <Link
                                    href={`/employee/edit?id=${employee.id}`}
                                  >
                                    <Button variant="outline" size="sm">
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </Link>
                                </PermissionGate>
                                {/* ✅ Change Password Button */}
                                {employee.email && (
                                  <PermissionGate
                                    module="employees"
                                    action="update"
                                  >
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleOpenPasswordDialog(employee)
                                      }
                                    >
                                      <KeyRound className="h-4 w-4" />
                                    </Button>
                                  </PermissionGate>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            {!loading && totalItems > 0 && (
              <TablePagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setCurrentPage}
                onPageSizeChange={handlePageSizeChange}
                itemLabel="employees"
              />
            )}
          </Card>
        </div>

        {/* ✅ Password Change Dialog */}
        <Dialog open={openPasswordDialog} onOpenChange={setOpenPasswordDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>
                Update login password for {selectedEmployee?.name}
              </DialogDescription>
            </DialogHeader>

            {selectedEmployee && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Employee Name</Label>
                  <div className="p-2 bg-muted rounded-md">
                    {selectedEmployee.name}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="p-2 bg-muted rounded-md">
                    {selectedEmployee.email || "—"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum 6 characters
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpenPasswordDialog(false)}
                disabled={passwordLoading}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdatePassword} disabled={passwordLoading}>
                {passwordLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
