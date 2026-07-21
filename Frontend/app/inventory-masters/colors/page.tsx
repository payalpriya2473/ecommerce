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
  Palette,
  Search,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { brandAPI, colorAPI } from "@/lib/api";
import type { Brand, Color } from "@/lib/api";
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
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ColorFormFields,
  EMPTY_COLOR_FORM,
} from "@/app/inventory-masters/colors/ColorFormFields";
import type { ColorFormValues } from "@/app/inventory-masters/colors/ColorFormFields";
import type { SortState } from "@/lib/table-sort";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";

export default function ColorsPage() {
  type ColorSortKey = "brandName" | "colorName";
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [colors, setColors] = useState<Color[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState<ColorFormValues>({
    ...EMPTY_COLOR_FORM,
  });
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [sortState, setSortState] = useState<SortState<ColorSortKey>>({
    key: "brandName",
    direction: "asc",
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [colorToDelete, setColorToDelete] = useState<Color | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { canView, canDelete } = usePermissions();

  // The brand filter/form dropdown needs ALL brands, fetched separately (un-paginated).
  const fetchBrands = async () => {
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await brandAPI.getAll(token);
      if (result.success) {
        setBrands(result.data);
      }
    } catch {
      // Keep form usable even if brands fail to preload; validation will still guide the user.
    }
  };

  useEffect(() => {
    void fetchBrands();
  }, []);

  // Debounce the search box before hitting the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // Reset to first page whenever search or sort changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, sortState]);

  // Server-side page fetch.
  useEffect(() => {
    let cancelled = false;
    const loadPage = async () => {
      try {
        if (!hasLoadedOnce) setIsLoading(true);
        const token = sessionStorage.getItem("authToken");
        if (!token) return;
        const result = await colorAPI.getAll(token, undefined, undefined, {
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
          setColors(rows);
          setTotalItems(nextTotal);
          setError("");
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotal / pageSize))),
          );
          if (currentPage > nextTotalPages) setCurrentPage(nextTotalPages);
        } else {
          setColors([]);
          setTotalItems(0);
          setError(result.message || "Failed to fetch colors");
        }
      } catch {
        if (!cancelled) {
          setColors([]);
          setTotalItems(0);
          setError("Failed to load colors");
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

  const handleSort = (key: ColorSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleDeleteClick = (color: Color) => {
    if (!canDelete("colors")) {
      setError("You don't have permission to delete colors");
      setTimeout(() => setError(""), 3000);
      return;
    }
    setColorToDelete(color);
    setDeleteDialogOpen(true);
  };

  const handleOpenAdd = () => {
    setFormValues({ ...EMPTY_COLOR_FORM });
    setFormError("");
    setDialogOpen(true);
  };

  const handleAddColor = async () => {
    setFormError("");
    if (!formValues.brandId) {
      setFormError("Please select a brand");
      return;
    }
    if (!formValues.colorName.trim()) {
      setFormError("Color name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) {
        setFormError("Not authenticated. Please login again.");
        return;
      }

      const result = await colorAPI.register(
        {
          brandId: formValues.brandId,
          colorName: formValues.colorName.trim(),
        },
        token,
      );

      if (result.success) {
        setRefreshToken((v) => v + 1);
        setDialogOpen(false);
        setFormValues({ ...EMPTY_COLOR_FORM });
        setSuccess("Color added successfully");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setFormError(result.message || "Failed to register color");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to register color. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!colorToDelete) return;
    setIsDeleting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await colorAPI.delete(colorToDelete.id, token);
      if (result.success) {
        setRefreshToken((v) => v + 1);
        setDeleteDialogOpen(false);
        setColorToDelete(null);
        setSuccess("Color deleted successfully");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result.message || "Failed to delete color");
      }
    } catch {
      setError("Failed to delete color");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canView("colors")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">
                  You don&apos;t have permission to view colors.
                  <br />
                  Please contact your administrator.
                </p>
              </CardContent>
            </Card>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  if (isLoading && !hasLoadedOnce) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading colors...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
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
                <AlertDescription className="text-green-800">
                  {success}
                </AlertDescription>
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
                <h1 className="text-3xl font-bold tracking-tight">
                  Color Master
                </h1>
                <p className="text-muted-foreground mt-1">
                  Manage brand-wise colors for items and serial/barcode mapping
                </p>
              </div>
              <PermissionGate module="colors" action="create">
                <Button
                  onClick={handleOpenAdd}
                  className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity"
                >
                  <Palette className="h-4 w-4 mr-2" />
                  Add Color
                </Button>
              </PermissionGate>
            </div>

            {/* Search */}
            <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
              <CardContent className="p-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by color name or brand..."
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
                    <Palette className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No colors found</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    {searchTerm
                      ? "Try adjusting your search criteria"
                      : "Get started by adding your first brand color"}
                  </p>
                  {!searchTerm && (
                    <PermissionGate module="colors" action="create">
                      <Button
                        onClick={handleOpenAdd}
                        className="bg-gradient-to-r from-accent to-accent-secondary"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Color
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
                        <SortableTableHead label="Brand Name" active={sortState.key === "brandName"} direction={sortState.direction} onClick={() => handleSort("brandName")} className="w-[45%]" />
                        <SortableTableHead label="Color" active={sortState.key === "colorName"} direction={sortState.direction} onClick={() => handleSort("colorName")} className="w-[40%]" />
                        <TableHead className="font-semibold text-center w-[15%]">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {colors.map((color) => (
                        <TableRow
                          key={color.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                                <Palette className="h-4 w-4 text-white" />
                              </div>
                              <span className="font-medium">
                                {color.brandName || "—"}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="secondary"
                              className="text-sm font-medium px-3 py-1"
                            >
                              {color.colorName}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <PermissionGate module="colors" action="update">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    router.push(
                                      `/inventory-masters/colors/edit?id=${color.id}`,
                                    )
                                  }
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>
                              <PermissionGate module="colors" action="delete">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteClick(color)}
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
                  itemLabel="colors"
                />
              </Card>
            )}

            {/* Delete Dialog */}
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will{" "}
                    <strong className="text-red-600">permanently delete</strong>{" "}
                    the color <strong>{colorToDelete?.colorName}</strong> for
                    brand <strong>{colorToDelete?.brandName}</strong>. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>
                    Cancel
                  </AlertDialogCancel>
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

            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setFormError("");
                  setFormValues({ ...EMPTY_COLOR_FORM });
                }
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-accent to-accent-secondary">
                      <Palette className="h-4 w-4 text-white" />
                    </div>
                    Add Color
                  </DialogTitle>
                  <DialogDescription>
                    Add a new brand-wise color to the color master
                  </DialogDescription>
                </DialogHeader>
                <ColorFormFields
                  values={formValues}
                  onChange={(updated) =>
                    setFormValues((prev) => ({ ...prev, ...updated }))
                  }
                  onSubmit={handleAddColor}
                  onCancel={() => setDialogOpen(false)}
                  error={formError}
                  isSubmitting={isSubmitting}
                  mode="add"
                  brands={brands}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
