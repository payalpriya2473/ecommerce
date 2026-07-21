"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText, Search, Eye, Edit, Trash2, AlertCircle,
  CheckCircle2, Plus,
} from "lucide-react";
import { salesInvoiceAPI } from "@/lib/api";
import Link from "next/link";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PermissionGate } from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head";
import { sortCollectionByKey, type SortState } from "@/lib/table-sort";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";

const toNumber = (v: unknown) => Number(v) || 0;

function hasInvoiceItems(inv: any): boolean {
  return Array.isArray(inv?.items) || Array.isArray(inv?.invoiceItems) || Array.isArray(inv?.saleInvoiceItems);
}

function needsInvoiceHydration(inv: any): boolean {
  return toNumber(inv?.netAmount) <= 0 && toNumber(inv?.totalAmount) <= 0 && !hasInvoiceItems(inv);
}

/** Compute net amount the same way SalesInvoiceForm does */
function computeNetAmount(inv: any): number {
  const storedNetAmount = toNumber(inv.netAmount);
  if (storedNetAmount > 0) return storedNetAmount;

  const storedTotalAmount = toNumber(inv.totalAmount);
  if (storedTotalAmount > 0) return storedTotalAmount;

  const items: any[] = Array.isArray(inv.items)
    ? inv.items
    : Array.isArray(inv.invoiceItems)
    ? inv.invoiceItems
    : Array.isArray(inv.saleInvoiceItems)
    ? inv.saleInvoiceItems
    : [];

  if (items.length === 0) {
    return 0;
  }

  const grossAmount     = items.reduce((s: number, i: any) => s + toNumber(i.qty) * toNumber(i.rate), 0);
  const totalScheme     = items.reduce((s: number, i: any) => s + toNumber(i.scheme), 0);
  const totalDiscountRs = items.reduce((s: number, i: any) => s + toNumber(i.discountRs), 0);
  const taxableAmount   = items.reduce((s: number, i: any) => s + toNumber(i.amount), 0);
  const discountAmount  = (taxableAmount * toNumber(inv.discountPercent)) / 100;
  const totalInstallation = items.reduce((s: number, i: any) => s + toNumber(i.installation), 0);

  return (
    grossAmount
    - totalScheme
    - totalDiscountRs
    - discountAmount
    + toNumber(inv.freightAmount)
    + toNumber(inv.otherCharges)
    + toNumber(inv.processingFees1)
    + toNumber(inv.processingFees2)
    + toNumber(inv.installationAmt)
    + totalInstallation
  );
}

export default function SalesInvoicesPage() {
  type SalesInvoiceSortKey = "billNumber" | "party" | "date" | "netAmount";
  const router = useRouter();

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
  const [sortState, setSortState] = useState<SortState<SalesInvoiceSortKey>>({
    key: "date",
    direction: "desc",
  });

  const { canView, canDelete } = usePermissions();

  useEffect(() => { void fetchInvoices(); }, []);

  const fetchInvoices = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await salesInvoiceAPI.getAll(token);
      if (result.success) {
        const invoices = Array.isArray(result.data) ? result.data : [];
        const hydratedInvoices = await Promise.all(
          invoices.map(async (inv) => {
            if (!inv?.id || !needsInvoiceHydration(inv)) return inv;
            try {
              const detail = await salesInvoiceAPI.getById(token, String(inv.id));
              return detail.success && detail.data
                ? { ...inv, ...detail.data }
                : inv;
            } catch {
              return inv;
            }
          })
        );

        setAllInvoices(hydratedInvoices);
        setFiltered(hydratedInvoices);
      } else {
        setError(result.message || "Failed to fetch sale invoices");
      }
    } catch {
      setError("Failed to load sale invoices");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm.trim()) { setFiltered(allInvoices); return; }
    const q = searchTerm.toLowerCase();
    setFiltered(
      allInvoices.filter(
        (inv) =>
          (inv.billNumber || "").toLowerCase().includes(q) ||
          (inv.partyName || inv.customerName || "").toLowerCase().includes(q)
      )
    );
  }, [searchTerm, allInvoices]);

  const sortedInvoices = useMemo(
    () =>
      sortCollectionByKey(
        filteredInvoices,
        {
          billNumber: (inv) => inv.billNumber,
          party: (inv) => inv.partyName || inv.customerName,
          date: (inv) => new Date(inv.createdAt || inv.billDate),
          netAmount: (inv) => computeNetAmount(inv),
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

  const handleSort = (key: SalesInvoiceSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleDeleteClick = (inv: any) => {
    if (!canDelete("sales")) {
      setError("You don't have permission to delete sale invoices");
      setTimeout(() => setError(""), 3000);
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
      const result = await salesInvoiceAPI.delete(invoiceToDelete.id, token);
      if (result.success) {
        setAllInvoices((prev) => prev.filter((i) => i.id !== invoiceToDelete.id));
        setDeleteDialogOpen(false);
        setInvoiceToDelete(null);
        setSuccess("Sale invoice deleted successfully");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result.message || "Failed to delete");
      }
    } catch {
      setError("Failed to delete sale invoice");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canView("sales")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">You don&apos;t have permission to view sale invoices.</p>
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
              <p className="text-muted-foreground">Loading sale invoices...</p>
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
              <h1 className="text-3xl font-bold tracking-tight">Sale Invoices</h1>
              <p className="text-muted-foreground mt-1">Manage all sale invoices</p>
            </div>
            <PermissionGate module="sales" action="create">
              <Link href="/sales-invoices/register">
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
                  placeholder="Search by bill no. or party name..."
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
                <p className="text-lg font-semibold mb-2">No sale invoices found</p>
                <p className="text-muted-foreground mb-6 text-center max-w-md">
                  {searchTerm ? "Try adjusting your search criteria" : "Start by creating your first sale invoice"}
                </p>
                {!searchTerm && (
                  <PermissionGate module="sales" action="create">
                    <Link href="/sales-invoices/register">
                      <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                        <Plus className="h-4 w-4 mr-2" />New Invoice
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
                      <SortableTableHead label="Party / Customer" active={sortState.key === "party"} direction={sortState.direction} onClick={() => handleSort("party")} className="w-[28%]" />
                      <SortableTableHead label="Date" active={sortState.key === "date"} direction={sortState.direction} onClick={() => handleSort("date")} className="w-[18%]" />
                      <SortableTableHead label="Net Amount" active={sortState.key === "netAmount"} direction={sortState.direction} onClick={() => handleSort("netAmount")} className="w-[18%]" />
                      <TableHead className="font-semibold text-center w-[12%]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((inv) => {
                      const netAmt = computeNetAmount(inv);
                      return (
                        <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                                <FileText className="h-4 w-4 text-white" />
                              </div>
                              <span className="font-semibold text-sm truncate max-w-[140px]" title={inv.billNumber}>
                                {inv.billNumber || "-"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium truncate max-w-[160px] block" title={inv.partyName || inv.customerName}>
                              {inv.partyName || inv.customerName || "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {inv.billDate
                                ? new Date(inv.billDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                                : "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-semibold">
                              ₹{netAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" onClick={() => router.push(`/sales-invoices/view?id=${inv.id}`)} className="h-8 w-8 hover:bg-accent/10 hover:text-accent" title="View">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <PermissionGate module="sales" action="update">
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/sales-invoices/edit?id=${inv.id}`)} className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate module="sales" action="delete">
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(inv)} className="h-8 w-8 hover:bg-red-50 hover:text-red-600" title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
                itemLabel="sales invoices"
              />
            </Card>
          )}

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will <strong className="text-red-600">permanently delete</strong> invoice{" "}
                  <strong>{invoiceToDelete?.billNumber || "this record"}</strong>. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
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
