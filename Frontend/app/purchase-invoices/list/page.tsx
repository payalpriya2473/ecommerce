"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Search,
  Eye,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Lock,
} from "lucide-react";
import { purchaseInvoiceAPI } from "@/lib/api";
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
import { sortCollectionByKey, type SortState } from "@/lib/table-sort";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";

function POLinkedBadge({ poNumber }: { poNumber?: string | null }) {
  if (!poNumber) return null;
  return (
    <span
      title={`Linked to Purchase Order ${poNumber} - cannot delete`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-red-50 text-red-700 border-red-200 select-none whitespace-nowrap"
    >
      PO: {poNumber}
    </span>
  );
}

export default function PurchaseInvoicesPage() {
  type PurchaseInvoiceSortKey = "billNumber" | "supplier" | "date" | "netAmount";
  const router = useRouter();
  const hasFetchedInvoicesRef = useRef(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [filteredInvoices, setFiltered] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortState, setSortState] = useState<SortState<PurchaseInvoiceSortKey>>({
    key: "date",
    direction: "desc",
  });

  const { canView, canDelete } = usePermissions();

  useEffect(() => {
    if (hasFetchedInvoicesRef.current) return;
    hasFetchedInvoicesRef.current = true;
    void fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await purchaseInvoiceAPI.getAll(token);
      if (result.success) {
        setAllInvoices(result.data);
        setFiltered(result.data);
      } else {
        setError(result.message || "Failed to fetch purchase invoices");
      }
    } catch {
      setError("Failed to load purchase invoices");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFiltered(allInvoices);
      return;
    }

    const q = searchTerm.toLowerCase();
    setFiltered(
      allInvoices.filter(
        (inv) =>
          (inv.billNumber || "").toLowerCase().includes(q) ||
          (inv.supplierName || "").toLowerCase().includes(q)
      )
    );
  }, [searchTerm, allInvoices]);

  const sortedInvoices = useMemo(
    () =>
      sortCollectionByKey(
        filteredInvoices,
        {
          billNumber: (inv) => inv.billNumber,
          supplier: (inv) => inv.supplierName,
          date: (inv) => new Date(inv.createdAt || inv.billDate),
          netAmount: (inv) => Number(inv.netAmount || 0),
        },
        sortState,
      ),
    [filteredInvoices, sortState],
  );

  const totalPages = Math.max(1, Math.ceil(sortedInvoices.length / pageSize));
  const paginatedRows = sortedInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortState]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handleSort = (key: PurchaseInvoiceSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getDeleteBlockReason = (inv: any): string | null => {
    if (inv.purchaseOrderId) {
      return `This invoice is linked to Purchase Order ${inv.poNumber || inv.purchaseOrderId} and cannot be deleted. Unlink the PO first by editing the invoice.`;
    }
    return null;
  };

  const handleDeleteClick = (inv: any) => {
    if (!canDelete("suppliers")) {
      setError("You don't have permission to delete purchase invoices");
      setTimeout(() => setError(""), 3000);
      return;
    }
    const blockReason = getDeleteBlockReason(inv);
    if (blockReason) {
      setError(blockReason);
      setTimeout(() => setError(""), 5000);
      return;
    }
    setInvoiceToDelete(inv);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return;
    setIsDeleting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await purchaseInvoiceAPI.delete(invoiceToDelete.id, token);
      if (result.success) {
        setAllInvoices((prev) => prev.filter((i) => i.id !== invoiceToDelete.id));
        setDeleteDialogOpen(false);
        setInvoiceToDelete(null);
        setSuccess("Purchase invoice deleted successfully");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result.message || "Failed to delete");
      }
    } catch {
      setError("Failed to delete purchase invoice");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canView("suppliers")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">
                  You don&apos;t have permission to view purchase invoices.
                </p>
              </CardContent>
            </Card>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  if (isLoading) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading purchase invoices...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4 md:px-6 lg:px-8">
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
              <h1 className="text-3xl font-bold tracking-tight">Purchase Invoices</h1>
              <p className="text-muted-foreground mt-1">
                Manage all purchase invoices from your suppliers
              </p>
            </div>
            <PermissionGate module="suppliers" action="create">
              <Link href="/purchase-invoices/register">
                <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity">
                  <Plus className="h-4 w-4 mr-2" />
                  New Invoice
                </Button>
              </Link>
            </PermissionGate>
          </div>

          <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
            <CardContent className="p-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by bill no. or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {filteredInvoices.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold mb-2">No purchase invoices found</p>
                <p className="text-muted-foreground mb-6 text-center max-w-md">
                  {searchTerm
                    ? "Try adjusting your search criteria"
                    : "Start by creating your first purchase invoice"}
                </p>
                {!searchTerm && (
                  <PermissionGate module="suppliers" action="create">
                    <Link href="/purchase-invoices/register">
                      <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                        <Plus className="h-4 w-4 mr-2" />
                        New Invoice
                      </Button>
                    </Link>
                  </PermissionGate>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <SortableTableHead label="Bill No." active={sortState.key === "billNumber"} direction={sortState.direction} onClick={() => handleSort("billNumber")} className="w-[24%]" />
                      <SortableTableHead label="Supplier" active={sortState.key === "supplier"} direction={sortState.direction} onClick={() => handleSort("supplier")} className="w-[28%]" />
                      <SortableTableHead label="Date" active={sortState.key === "date"} direction={sortState.direction} onClick={() => handleSort("date")} className="w-[18%]" />
                      <SortableTableHead label="Net Amount" active={sortState.key === "netAmount"} direction={sortState.direction} onClick={() => handleSort("netAmount")} className="w-[18%]" />
                      <TableHead className="font-semibold text-center w-[12%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((inv) => {
                      const blockReason = getDeleteBlockReason(inv);
                      const isBlocked = !!blockReason;

                      return (
                        <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                                <FileText className="h-4 w-4 text-white" />
                              </div>
                              <span
                                className="font-semibold text-sm truncate max-w-[140px]"
                                title={inv.billNumber}
                              >
                                {inv.billNumber || "-"}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span
                              className="text-sm font-medium truncate max-w-[160px] block"
                              title={inv.supplierName}
                            >
                              {inv.supplierName || "-"}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm">
                              {inv.billDate
                                ? new Date(inv.billDate).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "-"}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span className="text-sm font-semibold">
                              Rs
                              {Number(inv.netAmount || 0).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/purchase-invoices/view?id=${inv.id}`)}
                                className="h-8 w-8 hover:bg-accent/10 hover:text-accent"
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <PermissionGate module="suppliers" action="update">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => router.push(`/purchase-invoices/edit?id=${inv.id}`)}
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>

                              <PermissionGate module="suppliers" action="delete">
                                {isBlocked ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    disabled
                                    className="h-8 w-8 cursor-not-allowed opacity-40"
                                    title={blockReason ?? "Cannot delete"}
                                  >
                                    <Lock className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteClick(inv)}
                                    className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </PermissionGate>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <TablePagination
                page={currentPage}
                pageSize={pageSize}
                totalItems={sortedInvoices.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={handlePageSizeChange}
                itemLabel="purchase invoices"
              />

              {allInvoices.some((inv) => inv.purchaseOrderId) && (
                <div className="px-4 py-3 border-t border-border/40 bg-muted/20 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3 w-3 text-muted-foreground" />
                    <span>Lock icon = cannot delete</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <POLinkedBadge poNumber="ABC-001" />
                    <span>= linked to a Purchase Order (edit invoice to unlink)</span>
                  </span>
                </div>
              )}
            </Card>
          )}

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will <strong className="text-red-600">permanently delete</strong> invoice{" "}
                  <strong>{invoiceToDelete?.billNumber || "this record"}</strong>. This action
                  cannot be undone.
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
