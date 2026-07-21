"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Search,
  Eye,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  User,
} from "lucide-react";
import { incentiveLogAPI } from "@/lib/api";
import type { IncentiveLog } from "@/lib/api";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head";
import type { SortState } from "@/lib/table-sort";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";

// ─────────────────────────────────────────────────────────────
// DiffBadge
// ─────────────────────────────────────────────────────────────

function DiffBadge({
  oldVal,
  newVal,
  prefix = "",
  suffix = "",
}: {
  oldVal: number;
  newVal: number;
  prefix?: string;
  suffix?: string;
}) {
  const diff = newVal - oldVal;
  if (Math.abs(diff) < 0.001)
    return <span className="text-muted-foreground text-xs">—</span>;
  const isUp = diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isUp ? "text-green-600" : "text-red-600"
      }`}
    >
      {isUp ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {prefix}
      {Math.abs(diff).toFixed(2)}
      {suffix}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// EditedByCell — shows email with avatar initial, truncates domain
// ─────────────────────────────────────────────────────────────

function EditedByCell({ email }: { email?: string | null }) {
  if (!email) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <User className="h-3 w-3 text-muted-foreground" />
        </div>
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  // Extract initials from email (before @)
  const username = email.split("@")[0];
  const initial  = username.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-1.5" title={email}>
      <div className="h-6 w-6 rounded-full bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-white">{initial}</span>
      </div>
      <span className="text-xs text-foreground truncate max-w-[100px]">{username}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function IncentivesPage() {
  type IncentiveSortKey = "item" | "brandGroup" | "date" | "nlc" | "incentive" | "margin" | "editedBy";
  const router = useRouter();

  const [searchTerm, setSearchTerm]                 = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [currentPage, setCurrentPage]               = useState(1);
  const [pageSize, setPageSize]                     = useState<number>(DEFAULT_PAGE_SIZE);
  const [logs, setLogs]                             = useState<IncentiveLog[]>([]);
  const [totalItems, setTotalItems]                 = useState(0);
  const [refreshToken, setRefreshToken]             = useState(0);
  const [isLoading, setIsLoading]                   = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce]           = useState(false);
  const [error, setError]                           = useState("");
  const [success, setSuccess]                       = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete]           = useState<IncentiveLog | null>(null);
  const [isDeleting, setIsDeleting]             = useState(false);
  const [sortState, setSortState] = useState<SortState<IncentiveSortKey>>({
    key: "item",
    direction: "asc",
  });

  const { canView, canDelete } = usePermissions();

  // Debounce the search box before hitting the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // Reset to first page whenever search or sort changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, sortState]);

  // Server-side page fetch. Existing filters param is preserved (none used by this
  // page today); pagination/search/sort are passed via the trailing options arg.
  useEffect(() => {
    let cancelled = false;
    const loadPage = async () => {
      try {
        if (!hasLoadedOnce) setIsLoading(true);
        const token = sessionStorage.getItem("authToken");
        if (!token) return;
        const result = await incentiveLogAPI.getAll(token, undefined, {
          page: currentPage,
          limit: pageSize,
          search: debouncedSearchTerm || undefined,
          sortKey: sortState.key,
          sortDirection: sortState.direction,
        });
        if (cancelled) return;
        if (result.success) {
          const rows = Array.isArray(result.data) ? result.data : [];
          const pagination = result.pagination || {};
          const nextTotal = Number(pagination.totalItems ?? rows.length ?? 0);
          setLogs(rows);
          setTotalItems(nextTotal);
          setError("");
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          );
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages);
        } else {
          setLogs([]);
          setTotalItems(0);
          setError(result.message || "Failed to fetch incentive logs");
        }
      } catch {
        if (!cancelled) {
          setLogs([]);
          setTotalItems(0);
          setError("Failed to load incentive logs");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
      }
    };
    void loadPage();
    return () => { cancelled = true; };
  }, [currentPage, pageSize, debouncedSearchTerm, sortState, refreshToken]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handleSort = (key: IncentiveSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleDeleteClick = (log: IncentiveLog) => {
    if (!canDelete("items")) {
      setError("You don't have permission to delete incentive logs");
      setTimeout(() => setError(""), 3000);
      return;
    }
    setLogToDelete(log);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!logToDelete) return;
    setIsDeleting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await incentiveLogAPI.delete(logToDelete.id, token);
      if (result.success) {
        setRefreshToken((v) => v + 1);
        setDeleteDialogOpen(false);
        setLogToDelete(null);
        setSuccess("Incentive log deleted successfully");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result.message || "Failed to delete");
      }
    } catch {
      setError("Failed to delete incentive log");
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Access denied ────────────────────────────────────────
  if (!canView("items")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">
                  You don&apos;t have permission to view incentive logs.
                </p>
              </CardContent>
            </Card>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (isLoading && !hasLoadedOnce) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading incentive logs...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  // ── Main list ─────────────────────────────────────────────
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4 md:px-6 lg:px-8">

          {/* Alerts */}
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

          {/* Page header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Incentive</h1>
              <p className="text-muted-foreground mt-1">
                Track and manage NLC, margin, incentive &amp; offer price changes per item
              </p>
            </div>
            <PermissionGate module="items" action="create">
              <Link href="/inventory-masters/incentives/register">
                <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Add Incentive
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
                  placeholder="Search by item name, brand, group, or edited by..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Empty state */}
          {totalItems === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <TrendingUp className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold mb-2">No incentive logs found</p>
                <p className="text-muted-foreground mb-6 text-center max-w-md">
                  {searchTerm
                    ? "Try adjusting your search criteria"
                    : "Start by adding your first incentive log entry"}
                </p>
                {!searchTerm && (
                  <PermissionGate module="items" action="create">
                    <Link href="/inventory-masters/incentives/register">
                      <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Incentive
                      </Button>
                    </Link>
                  </PermissionGate>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <div className="overflow-x-auto">
                <Table className="min-w-[1100px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <SortableTableHead label="Item" active={sortState.key === "item"} direction={sortState.direction} onClick={() => handleSort("item")} className="w-[20%]" />
                      <SortableTableHead label="Brand / Group" active={sortState.key === "brandGroup"} direction={sortState.direction} onClick={() => handleSort("brandGroup")} className="w-[12%]" />
                      <SortableTableHead label="Date" active={sortState.key === "date"} direction={sortState.direction} onClick={() => handleSort("date")} className="w-[10%]" />
                      <SortableTableHead label="NLC" active={sortState.key === "nlc"} direction={sortState.direction} onClick={() => handleSort("nlc")} className="w-[14%]" />
                      <SortableTableHead label="Incentive %" active={sortState.key === "incentive"} direction={sortState.direction} onClick={() => handleSort("incentive")} className="w-[14%]" />
                      <SortableTableHead label="Margin %" active={sortState.key === "margin"} direction={sortState.direction} onClick={() => handleSort("margin")} className="w-[14%]" />
                      <SortableTableHead label="Edited By" active={sortState.key === "editedBy"} direction={sortState.direction} onClick={() => handleSort("editedBy")} className="w-[10%]" />
                      <TableHead className="font-semibold text-center w-[6%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        {/* Item */}
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                              <TrendingUp className="h-4 w-4 text-white" />
                            </div>
                            <p
                              className="font-medium truncate max-w-[160px]"
                              title={log.itemName}
                            >
                              {log.itemName}
                            </p>
                          </div>
                        </TableCell>

                        {/* Brand / Group */}
                        <TableCell>
                          <div className="space-y-1">
                            {log.brandName && (
                              <Badge variant="secondary" className="text-xs block w-fit">
                                {log.brandName}
                              </Badge>
                            )}
                            {log.itemGroupName && (
                              <p className="text-xs text-muted-foreground">
                                {log.itemGroupName}
                              </p>
                            )}
                          </div>
                        </TableCell>

                        {/* Date */}
                        <TableCell>
                          <span className="text-sm">
                            {new Date(log.effectiveDate).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </TableCell>

                        {/* NLC */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Old:</span>
                              <span className="text-sm">₹{Number(log.oldNlc).toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">New:</span>
                              <span className="text-sm font-medium">
                                ₹{Number(log.newNlc).toFixed(2)}
                              </span>
                              <DiffBadge
                                oldVal={Number(log.oldNlc)}
                                newVal={Number(log.newNlc)}
                                prefix="₹"
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Incentive */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Old:</span>
                              <span className="text-sm">
                                {Number(log.oldIncentive).toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">New:</span>
                              <span className="text-sm font-medium">
                                {Number(log.newIncentive).toFixed(2)}%
                              </span>
                              <DiffBadge
                                oldVal={Number(log.oldIncentive)}
                                newVal={Number(log.newIncentive)}
                                suffix="%"
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* Margin */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Old:</span>
                              <span className="text-sm">
                                {Number(log.oldMargin).toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">New:</span>
                              <span className="text-sm font-medium">
                                {Number(log.newMargin).toFixed(2)}%
                              </span>
                              <DiffBadge
                                oldVal={Number(log.oldMargin)}
                                newVal={Number(log.newMargin)}
                                suffix="%"
                              />
                            </div>
                          </div>
                        </TableCell>

                        {/* ✅ Fixed Edited By — shows avatar + username */}
                        <TableCell>
                          <EditedByCell email={log.editedByEmail} />
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                router.push(
                                  `/inventory-masters/incentives/view?id=${log.id}`
                                )
                              }
                              className="h-8 w-8 hover:bg-accent/10 hover:text-accent"
                              title="View"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <PermissionGate module="items" action="update">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  router.push(
                                    `/inventory-masters/incentives/edit?id=${log.id}`
                                  )
                                }
                                className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate module="items" action="delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteClick(log)}
                                className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
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
                itemLabel="incentives"
              />
            </Card>
          )}

          {/* Delete Dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will{" "}
                  <strong className="text-red-600">permanently delete</strong> the
                  incentive log for{" "}
                  <strong>{logToDelete?.itemName}</strong>. This action cannot be
                  undone.
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
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
