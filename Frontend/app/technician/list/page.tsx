"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Wrench, Search, Plus, Eye, Edit, Trash2, AlertCircle, CheckCircle2, Loader2,
} from "lucide-react";
import { technicianAPI, Technician } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head";
import { type SortState } from "@/lib/table-sort";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";

export default function TechnicianListPage() {
  type TechnicianSortKey = "name" | "specialization" | "experience" | "mobile" | "status";
  const router = useRouter();
  const { canView, canEdit, canDelete } = usePermissions();

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [totalItems, setTotalItems]   = useState(0);
  const [searchTerm, setSearchTerm]   = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [loading, setLoading]         = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] = useState<SortState<TechnicianSortKey>>({
    key: "name",
    direction: "asc",
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [techToDelete, setTechToDelete]         = useState<Technician | null>(null);
  const [isDeleting, setIsDeleting]             = useState(false);

  // Debounce the search box before hitting the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // Reset to the first page whenever the search term or sort changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, sortState]);

  // Server-side page fetch — re-runs on page/size/search/sort/refresh changes.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token     = sessionStorage.getItem("authToken");
      const role      = sessionStorage.getItem("userRole");
      const companyId = sessionStorage.getItem("companyId");
      if (!token) return;
      try {
        if (!hasLoadedOnce) setLoading(true);
        const res = await technicianAPI.getAll(token, {
          page: currentPage,
          limit: pageSize,
          search: debouncedSearchTerm || undefined,
          sortKey: sortState.key,
          sortDirection: sortState.direction,
          // Non-super-admins are scoped to their own company.
          ...(role !== "super_admin" && companyId ? { companyId } : {}),
        });
        if (cancelled) return;
        if (res.success) {
          const parsed = (Array.isArray(res.data) ? res.data : []).map((t: Technician) => ({
            ...t,
            certifications: typeof t.certifications === "string"
              ? JSON.parse(t.certifications as any) : (t.certifications ?? []),
            serviceAreas: typeof t.serviceAreas === "string"
              ? JSON.parse(t.serviceAreas as any) : (t.serviceAreas ?? []),
          }));
          const pagination = res.pagination || {};
          const nextTotal = Number(pagination.totalItems ?? parsed.length ?? 0);
          setTechnicians(parsed);
          setTotalItems(nextTotal);
          setError("");
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          );
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages);
        } else {
          setTechnicians([]);
          setTotalItems(0);
          setError(res.message || "Failed to load technicians");
        }
      } catch (err) {
        console.error("Failed to load technicians", err);
        if (!cancelled) {
          setTechnicians([]);
          setTotalItems(0);
          setError("Failed to load technicians");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [currentPage, pageSize, debouncedSearchTerm, sortState, refreshToken]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handleSort = (key: TechnicianSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleToggleStatus = async (id: string) => {
    if (!canEdit("technicians")) {
      setError("You don't have permission to update technicians");
      setTimeout(() => setError(""), 3000); return;
    }
    setTechnicians((prev) => prev.map((t) => t.id === id ? { ...t, isActive: !t.isActive } : t));
  };

  const handleDeleteClick = (tech: Technician) => {
    if (!canDelete("technicians")) {
      setError("You don't have permission to delete technicians");
      setTimeout(() => setError(""), 3000); return;
    }
    setTechToDelete(tech);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!techToDelete) return;
    setIsDeleting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const res = await technicianAPI.delete(techToDelete.id, token);
      if (res.success) {
        setRefreshToken((v) => v + 1);
        setSuccess("Technician deleted successfully");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(res.message || "Failed to delete technician");
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete technician");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setTechToDelete(null);
    }
  };

  if (!canView("technicians")) {
    return (
      <AuthGuard><AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground text-center">
                You don't have permission to view technicians.
              </p>
            </CardContent>
          </Card>
        </div>
      </AuthenticatedLayout></AuthGuard>
    );
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
                <h1 className="text-3xl font-bold tracking-tight">Technicians</h1>
                <p className="text-muted-foreground mt-1">View and manage all registered technicians</p>
              </div>
              <PermissionGate module="technicians" action="create">
                <Link href="/technician/register">
                  <Button className="bg-red-700 hover:bg-red-800 text-white">
                    <Plus className="h-4 w-4 mr-2" />Register Technician
                  </Button>
                </Link>
              </PermissionGate>
            </div>

            {/* Search */}
            <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
              <CardContent className="p-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9 h-10 text-sm"
                    placeholder="Search by name, specialization or mobile..."
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            {loading && !hasLoadedOnce ? (
              <Card>
                <CardContent className="p-12 text-center flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p>Loading technicians...</p>
                </CardContent>
              </Card>
            ) : totalItems === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Wrench className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No technicians found</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    {searchTerm ? "Try adjusting your search criteria" : "Get started by registering your first technician"}
                  </p>
                  {!searchTerm && (
                    <PermissionGate module="technicians" action="create">
                      <Link href="/technician/register">
                        <Button className="bg-red-700 hover:bg-red-800 text-white">
                          <Plus className="h-4 w-4 mr-2" />Register Technician
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
                      <TableRow className={SORTABLE_HEADER_ROW_CLASS}>
                        <TableHead className="font-semibold">Photo</TableHead>
                        <SortableTableHead label="Name" active={sortState.key === "name"} direction={sortState.direction} onClick={() => handleSort("name")} />
                        <SortableTableHead label="Specialization" active={sortState.key === "specialization"} direction={sortState.direction} onClick={() => handleSort("specialization")} />
                        <SortableTableHead label="Experience" active={sortState.key === "experience"} direction={sortState.direction} onClick={() => handleSort("experience")} />
                        <SortableTableHead label="Mobile" active={sortState.key === "mobile"} direction={sortState.direction} onClick={() => handleSort("mobile")} />
                        <SortableTableHead label="Status" active={sortState.key === "status"} direction={sortState.direction} onClick={() => handleSort("status")} className="text-center" buttonClassName="justify-center" />
                        <TableHead className="font-semibold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {technicians.map((tech) => (
                        <TableRow key={tech.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <Avatar>
                              <AvatarImage
                                src={tech.photoUrl
                                  ? `${process.env.NEXT_PUBLIC_API_URL?.replace("/api", "")}${tech.photoUrl}`
                                  : undefined}
                                alt={tech.name}
                              />
                              <AvatarFallback>{getInitials(tech.name)}</AvatarFallback>
                            </Avatar>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{tech.name}</p>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{tech.specialization}</p>
                              {tech.certifications && tech.certifications.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {tech.certifications.slice(0, 2).join(", ")}
                                  {tech.certifications.length > 2 && ` +${tech.certifications.length - 2}`}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{tech.experience ?? 0} yrs</TableCell>
                          <TableCell>{tech.mobile}</TableCell>
                          <TableCell className="text-center">
                            {/* ✅ FIXED: single status display — no duplicate Badge */}
                            <div className="flex items-center justify-center gap-2">
                              {canEdit("technicians") ? (
                                <>
                                  <Switch checked={!!tech.isActive}
                                    onCheckedChange={() => handleToggleStatus(tech.id)} />
                                  <Badge variant={tech.isActive ? "default" : "secondary"}>
                                    {tech.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </>
                              ) : (
                                <Badge variant={tech.isActive ? "default" : "secondary"}>
                                  {tech.isActive ? "Active" : "Inactive"}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="icon"
                                onClick={() => router.push(`/technician/view?id=${tech.id}`)}
                                className="h-8 w-8 hover:bg-accent/10 hover:text-accent" title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <PermissionGate module="technicians" action="update">
                                <Button variant="ghost" size="icon"
                                  onClick={() => router.push(`/technician/edit?id=${tech.id}`)}
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate module="technicians" action="delete">
                                <Button variant="ghost" size="icon"
                                  onClick={() => handleDeleteClick(tech)}
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
                  itemLabel="technicians"
                />
              </Card>
            )}
          </div>
        </div>

        {/* Delete Confirmation */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will <strong className="text-red-600">permanently delete</strong>{" "}
                <strong>{techToDelete?.name}</strong> from the database. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700">
                {isDeleting ? "Deleting..." : "Yes, Delete Permanently"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </AuthenticatedLayout>
    </AuthGuard>
  );
}
