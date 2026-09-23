"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Package2,
  Search,
  Eye,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { brandAPI, categoryAPI, itemAPI, itemGroupAPI } from "@/lib/api";
import type { Brand, Category, Item, ItemGroup } from "@/lib/api";
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
import { usePermissions } from "@/hooks/usePermissions";
import { PermissionGate } from "@/components/PermissionGate";
import { FilterMultiSelect, type FilterMultiSelectOption } from "@/components/ui/filter-multi-select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";
import { type SortState } from "@/lib/table-sort";

type ItemSortKey = "itemName" | "group" | "brand" | "hsn" | "gst" | "uom" | "stock" | "margin";
type ItemStatusFilterValue = "active" | "inactive";
type StockFilterValue = "inStock" | "outOfStock";

const visibleCheckboxClassName =
  "size-5 rounded-md border-2 border-slate-400 bg-white shadow-sm data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-white";

const STOCK_FILTER_OPTIONS: FilterMultiSelectOption[] = [
  { value: "inStock", label: "In Stock" },
  { value: "outOfStock", label: "Out of Stock" },
];

const STATUS_FILTER_OPTIONS: FilterMultiSelectOption[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export default function ItemsPage() {
  const router = useRouter();
  const formatWholeNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed).toString() : "0";
  };
  const getPrimaryVariant = (item: Item) => item.variants?.[0];
  const getVariantText = (item: Item) => getPrimaryVariant(item)?.variant ?? item.variant ?? "";
  const getOpeningStock = (item: Item) => item.openingStock ?? getPrimaryVariant(item)?.openingStock ?? 0;
  const getMinimumQty = (item: Item) => getPrimaryVariant(item)?.minimumQty ?? item.minimumQty ?? 0;
  const getMargin = (item: Item) => getPrimaryVariant(item)?.margin ?? item.margin ?? 0;
  const getOfferPrice = (item: Item) => getPrimaryVariant(item)?.offerPrice ?? item.offerPrice ?? 0;
  const getStockFilterValues = (item: Item): StockFilterValue[] => {
    const openingStock = Number(getOpeningStock(item));

    if (openingStock <= 0) return ["outOfStock"];
    return ["inStock"];
  };
  const matchesSearch = (item: Item, query: string) =>
    (query.length > 0 && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(query)
      ? Number(getOpeningStock(item)) === Number(query)
      : item.itemName.toLowerCase().includes(query) ||
        getVariantText(item).toLowerCase().includes(query) ||
        (item.categoryName || "").toLowerCase().includes(query) ||
        (item.brandName || "").toLowerCase().includes(query) ||
        (item.itemGroupName || "").toLowerCase().includes(query) ||
        (item.hsnCode || "").toLowerCase().includes(query));
  const matchesCategoryFilter = (item: Item, categoryNames: string[]) =>
    categoryNames.length === 0 || categoryNames.includes(item.categoryName || "");
  const matchesStockFilter = (item: Item, stockFilters: StockFilterValue[]) =>
    stockFilters.length === 0 ||
    getStockFilterValues(item).some((filterValue) => stockFilters.includes(filterValue));
  const buildFilterOptions = (
    items: Item[],
    getValue: (item: Item) => string | undefined,
  ): FilterMultiSelectOption[] => {
    const counts = new Map<string, number>();

    items.forEach((item) => {
      const rawValue = getValue(item)?.trim();
      if (!rawValue) return;
      counts.set(rawValue, (counts.get(rawValue) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({
        value,
        label: value,
        count,
      }));
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<ItemStatusFilterValue[]>([
    "active",
    "inactive",
  ]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [selectedStockFilters, setSelectedStockFilters] = useState<StockFilterValue[]>([]);
  const [stockSearchTerm, setStockSearchTerm] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [sortState, setSortState] = useState<SortState<ItemSortKey>>({
    key: "itemName",
    direction: "asc",
  });
  const [categoryOptions, setCategoryOptions] = useState<FilterMultiSelectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<FilterMultiSelectOption[]>([]);
  const [brandOptions, setBrandOptions] = useState<FilterMultiSelectOption[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [restored, setRestored] = useState(false);
  const FILTERS_STORAGE_KEY = "itemMasterFilters";

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { canView, canDelete, canEdit } = usePermissions();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // Restore saved filters on mount so they survive view/edit navigation.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
      if (raw) {
        const f = JSON.parse(raw);
        if (typeof f.searchTerm === "string") setSearchTerm(f.searchTerm);
        if (Array.isArray(f.selectedStatuses)) setSelectedStatuses(f.selectedStatuses);
        if (Array.isArray(f.selectedCategoryIds)) setSelectedCategoryIds(f.selectedCategoryIds);
        if (Array.isArray(f.selectedGroupIds)) setSelectedGroupIds(f.selectedGroupIds);
        if (Array.isArray(f.selectedBrandIds)) setSelectedBrandIds(f.selectedBrandIds);
        if (Array.isArray(f.selectedStockFilters)) setSelectedStockFilters(f.selectedStockFilters);
        if (typeof f.stockSearchTerm === "string") setStockSearchTerm(f.stockSearchTerm);
        if (f.sortState && f.sortState.key) setSortState(f.sortState);
        if (typeof f.pageSize === "number") setPageSize(f.pageSize);
      }
    } catch {
      /* ignore malformed storage */
    }
    setRestored(true);
  }, []);

  // Persist filters whenever they change (only after the initial restore, so we
  // never overwrite the saved filters with the defaults on first mount).
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          searchTerm,
          selectedStatuses,
          selectedCategoryIds,
          selectedGroupIds,
          selectedBrandIds,
          selectedStockFilters,
          stockSearchTerm,
          sortState,
          pageSize,
        }),
      );
    } catch {
      /* ignore quota / unavailable storage */
    }
  }, [
    restored,
    searchTerm,
    selectedStatuses,
    selectedCategoryIds,
    selectedGroupIds,
    selectedBrandIds,
    selectedStockFilters,
    stockSearchTerm,
    sortState,
    pageSize,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadFilterOptions = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;

      try {
        const [categoryResult, brandResult, groupResult] = await Promise.all([
          categoryAPI.getAll(token),
          brandAPI.getAll(token),
          itemGroupAPI.getAll(token),
        ]);

        if (cancelled) return;

        if (categoryResult.success) {
          setCategoryOptions(
            (Array.isArray(categoryResult.data) ? categoryResult.data : []).map((category: Category) => ({
              value: category.id,
              label: category.name,
            })),
          );
        }

        if (brandResult.success) {
          setBrandOptions(
            (Array.isArray(brandResult.data) ? brandResult.data : []).map((brand: Brand) => ({
              value: brand.id,
              label: brand.name,
            })),
          );
        }

        if (groupResult.success) {
          setGroupOptions(
            (Array.isArray(groupResult.data) ? groupResult.data : []).map((group: ItemGroup) => ({
              value: group.id,
              label: group.name,
            })),
          );
        }
      } catch {
        // Filter options are helpful but non-blocking.
      }
    };

    void loadFilterOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadItems = async () => {
      try {
        if (!hasLoadedOnce) {
          setIsLoading(true);
        }
        setError("");

        const token = sessionStorage.getItem("authToken");
        if (!token) return;
        if (!selectedStatuses.length) {
          setAllItems([]);
          setTotalItems(0);
          setHasLoadedOnce(true);
          return;
        }

        const result = await itemAPI.getAll(
          token,
          debouncedSearchTerm || undefined,
          {
            statuses: selectedStatuses,
            brandIds: selectedBrandIds,
            itemGroupIds: selectedGroupIds,
            categoryIds: selectedCategoryIds,
            stock: selectedStockFilters,
          },
          {
            page: currentPage,
            limit: pageSize,
            sortKey: sortState.key,
            sortDirection: sortState.direction,
          },
          stockSearchTerm.trim() || undefined,
        );

        if (cancelled) return;

        if (result.success) {
          const items = Array.isArray(result.data) ? result.data : [];
          const pagination = result.pagination || {};
          const nextTotalItems = Number(pagination.totalItems ?? items.length ?? 0);
          const nextTotalPages = Math.max(
            1,
            Number(pagination.totalPages ?? Math.max(1, Math.ceil(nextTotalItems / pageSize))),
          );

          setAllItems(items);
          setTotalItems(nextTotalItems);
          setHasLoadedOnce(true);

          if (currentPage > nextTotalPages) {
            setCurrentPage(nextTotalPages);
          }
        } else {
          setError(result.message || "Failed to fetch items");
          setAllItems([]);
          setTotalItems(0);
          setHasLoadedOnce(true);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load items");
          setAllItems([]);
          setTotalItems(0);
          setHasLoadedOnce(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    pageSize,
    debouncedSearchTerm,
    stockSearchTerm,
    selectedStatuses,
    selectedCategoryIds,
    selectedGroupIds,
    selectedBrandIds,
    selectedStockFilters,
    sortState,
    refreshToken,
  ]);

  const availableCategoryOptions = categoryOptions;
  const availableGroupOptions = groupOptions;
  const availableBrandOptions = brandOptions;
  const availableStockOptions = STOCK_FILTER_OPTIONS;

  const filteredItems = allItems;
  const sortedItems = allItems;
  const paginatedItems = allItems;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setCurrentPage(1);
  };
  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedItemIds.includes(item.id));
  const someFilteredSelected =
    filteredItems.some((item) => selectedItemIds.includes(item.id));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setSelectedItemIds((prev) => prev.filter((id) => filteredItems.some((item) => item.id === id)));
  }, [filteredItems]);

  useEffect(() => {
    setSelectedCategoryIds((prev) => {
      const next = prev.filter((value) => availableCategoryOptions.some((option) => option.value === value));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [availableCategoryOptions]);

  useEffect(() => {
    setSelectedGroupIds((prev) => {
      const next = prev.filter((value) => availableGroupOptions.some((option) => option.value === value));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [availableGroupOptions]);

  useEffect(() => {
    setSelectedBrandIds((prev) => {
      const next = prev.filter((value) => availableBrandOptions.some((option) => option.value === value));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [availableBrandOptions]);

  useEffect(() => {
    setSelectedStockFilters((prev) => {
      const next = prev.filter((value) => availableStockOptions.some((option) => option.value === value));
      return areStringArraysEqual(prev, next) ? prev : next;
    });
  }, [availableStockOptions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    stockSearchTerm,
    selectedStatuses,
    selectedCategoryIds,
    selectedGroupIds,
    selectedBrandIds,
    selectedStockFilters,
  ]);

  const handleSort = (key: ItemSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const handleDeleteClick = (item: Item) => {
    if (!canDelete("items")) {
      setError("You don't have permission to delete items");
      setTimeout(() => setError(""), 3000);
      return;
    }
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      const result = await itemAPI.delete(itemToDelete.id, token);
      if (result.success) {
        setDeleteDialogOpen(false);
        setItemToDelete(null);
        setSuccess("Item deleted successfully");
        setRefreshToken((value) => value + 1);
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result.message || "Failed to delete item");
      }
    } catch {
      setError("Failed to delete item");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedItemIds(checked ? filteredItems.map((item) => item.id) : []);
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    setSelectedItemIds((prev) =>
      checked ? [...new Set([...prev, itemId])] : prev.filter((id) => id !== itemId),
    );
  };

  const handleBulkStatusUpdate = async (isActive: boolean) => {
    if (!selectedItemIds.length || !canEdit("items")) return;

    try {
      setIsUpdatingStatus(true);
      setError("");
      const token = sessionStorage.getItem("authToken");
      if (!token) return;

      const results = await Promise.all(
        selectedItemIds.map((itemId) => itemAPI.update(itemId, { isActive }, token)),
      );
      const failed = results.find((result) => !result.success);
      if (failed) {
        setError(failed.message || "Failed to update selected items");
        return;
      }

      setSuccess(`Selected items ${isActive ? "activated" : "deactivated"} successfully`);
      setSelectedItemIds([]);
      setRefreshToken((value) => value + 1);
      setTimeout(() => setSuccess(""), 3000);
    } catch {
      setError("Failed to update selected items");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    selectedStatuses.length !== STATUS_FILTER_OPTIONS.length ||
    selectedCategoryIds.length > 0 ||
    selectedGroupIds.length > 0 ||
    selectedBrandIds.length > 0 ||
    selectedStockFilters.length > 0 ||
    stockSearchTerm.trim().length > 0;

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedStatuses(["active", "inactive"]);
    setSelectedCategoryIds([]);
    setSelectedGroupIds([]);
    setSelectedBrandIds([]);
    setSelectedStockFilters([]);
    setStockSearchTerm("");
  };

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
                  You don&apos;t have permission to view items.
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
              <p className="text-muted-foreground">Loading items...</p>
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
                <h1 className="text-3xl font-bold tracking-tight">Items</h1>
                <p className="text-muted-foreground mt-1">
                  View and manage all inventory items
                </p>
              </div>
              <PermissionGate module="items" action="create">
                <Link href="/inventory-masters/items/register">
                  <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity">
                    <Package2 className="h-4 w-4 mr-2" />
                    Add Item Master
                  </Button>
                </Link>
              </PermissionGate>
            </div>

            {/* Filters */}
            <Card className="mb-4 overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]">
              <CardContent className="p-2.5 md:p-3">
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    {/* <div>
                      <h2 className="text-[2rem] font-semibold tracking-tight text-slate-950">Item Management</h2>
                      <p className="mt-1 text-base text-slate-500">
                        Search and narrow the list with dependent filters above the table.
                      </p>
                    </div> */}
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50/80 p-1">
                      <Badge
                        variant="secondary"
                        className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm"
                      >
                        {totalItems} item{totalItems === 1 ? "" : "s"}
                      </Badge>
                      <Button
                        variant="outline"
                        onClick={resetFilters}
                        disabled={!hasActiveFilters}
                        className="h-9 rounded-xl border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm hover:bg-white hover:text-slate-600 disabled:border-slate-200 disabled:bg-white disabled:text-slate-400"
                      >
                        Reset Filters
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-slate-200 bg-slate-50/40 p-2">
                    <div className="grid gap-2 xl:grid-cols-[minmax(0,2.35fr)_minmax(10rem,1fr)_repeat(4,minmax(0,1fr))]">
                      <div className="relative min-w-0 xl:col-span-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search items..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="h-9 rounded-md border-input bg-background pl-10 text-sm shadow-none focus-visible:ring-ring/50"
                        />
                      </div>

                      <FilterMultiSelect
                        label="Status"
                        placeholder="All Status"
                        options={STATUS_FILTER_OPTIONS}
                        values={selectedStatuses}
                        onChange={(values) => setSelectedStatuses(values as ItemStatusFilterValue[])}
                        singleSelect
                      />

                      <FilterMultiSelect
                        label="Category"
                        placeholder="All Categories"
                        options={availableCategoryOptions}
                        values={selectedCategoryIds}
                        onChange={setSelectedCategoryIds}
                        disabled={availableCategoryOptions.length === 0}
                      />

                      <FilterMultiSelect
                        label="Group"
                        placeholder="All Groups"
                        options={availableGroupOptions}
                        values={selectedGroupIds}
                        onChange={setSelectedGroupIds}
                        disabled={availableGroupOptions.length === 0}
                      />

                      <FilterMultiSelect
                        label="Brand"
                        placeholder="All Brands"
                        options={availableBrandOptions}
                        values={selectedBrandIds}
                        onChange={setSelectedBrandIds}
                        disabled={availableBrandOptions.length === 0}
                      />

                      <FilterMultiSelect
                        label="Stock"
                        placeholder="All Stock"
                        options={availableStockOptions}
                        values={selectedStockFilters}
                        onChange={(values) => setSelectedStockFilters(values as StockFilterValue[])}
                        singleSelect
                        disableOptionFiltering
                        searchValue={stockSearchTerm}
                        onSearchValueChange={setStockSearchTerm}
                      />
                    </div>
                  </div>

                  {/* <p className="text-sm text-slate-500">
                    Select all applies to filtered rows. Group and brand stay dependent on category. Bulk edit respects current filters.
                  </p> */}
                </div>
              </CardContent>
            </Card>

            {selectedItemIds.length > 0 && (
              <Card className="mb-5 border-border/50 shadow-sm">
                <CardContent className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">
                    {selectedItemIds.length} item{selectedItemIds.length === 1 ? "" : "s"} selected
                  </p>
                  {canEdit("items") && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleBulkStatusUpdate(true)}
                        disabled={isUpdatingStatus}
                      >
                        Activate Selected
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleBulkStatusUpdate(false)}
                        disabled={isUpdatingStatus}
                      >
                        Deactivate Selected
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {filteredItems.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Package2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No items found</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    {hasActiveFilters
                      ? "Try adjusting your search criteria"
                      : "Get started by adding your first inventory item"}
                  </p>
                  {!hasActiveFilters && (
                    <PermissionGate module="items" action="create">
                      <Link href="/inventory-masters/items/register">
                        <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Item Master
                        </Button>
                      </Link>
                    </PermissionGate>
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Table */
              <Card className="border-border/50 shadow-sm">
                <div className="overflow-x-auto">
                  <Table className="table-fixed min-w-[1260px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[5%] text-center">
                          <Checkbox
                            className={visibleCheckboxClassName}
                            checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                            aria-label="Select all items"
                          />
                        </TableHead>
                        <SortableTableHead label="Item Name" active={sortState.key === "itemName"} direction={sortState.direction} onClick={() => handleSort("itemName")} className="w-[18%]" />
                        <SortableTableHead label="Group" active={sortState.key === "group"} direction={sortState.direction} onClick={() => handleSort("group")} className="w-[10%]" />
                        <SortableTableHead label="Brand" active={sortState.key === "brand"} direction={sortState.direction} onClick={() => handleSort("brand")} className="w-[9%]" />
                        <SortableTableHead label="HSN" active={sortState.key === "hsn"} direction={sortState.direction} onClick={() => handleSort("hsn")} className="w-[9%]" />
                        <SortableTableHead label="GST" active={sortState.key === "gst"} direction={sortState.direction} onClick={() => handleSort("gst")} className="w-[7%]" />
                        <SortableTableHead label="UOM" active={sortState.key === "uom"} direction={sortState.direction} onClick={() => handleSort("uom")} className="w-[9%]" />
                        <SortableTableHead label="Stock" active={sortState.key === "stock"} direction={sortState.direction} onClick={() => handleSort("stock")} className="w-[13%]" />
                        <SortableTableHead label="Margin" active={sortState.key === "margin"} direction={sortState.direction} onClick={() => handleSort("margin")} className="w-[12%]" />
                        <TableHead className="font-semibold text-center w-[9%]">
                          Status
                        </TableHead>
                        <TableHead className="font-semibold text-center w-[8%]">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.map((item) => {
                        const variantText = getVariantText(item);
                        const openingStock = getOpeningStock(item);
                        const minimumQty = getMinimumQty(item);
                        const margin = getMargin(item);
                        const offerPrice = getOfferPrice(item);

                        return (
                        <TableRow
                          key={item.id}
                          data-state={selectedItemIds.includes(item.id) ? "selected" : undefined}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <TableCell className="text-center">
                            <Checkbox
                              className={visibleCheckboxClassName}
                              checked={selectedItemIds.includes(item.id)}
                              onCheckedChange={(checked) => handleSelectItem(item.id, Boolean(checked))}
                              aria-label={`Select ${item.itemName}`}
                            />
                          </TableCell>
                          <TableCell className="w-[18%] overflow-hidden pr-2">
                            <div className="flex items-center gap-2">
                              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                                <Package2 className="h-5 w-5 text-white" />
                              </div>

                              <div className="min-w-0 flex-1 overflow-hidden">
                                <p
                                  className="font-medium truncate whitespace-nowrap"
                                  title={item.itemName}
                                >
                                  {item.itemName}
                                </p>
                                {variantText && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {variantText}
                                  </p>
                                )}

                                {Boolean(item.hasDemoInstallation) ? (
                                  <Badge
                                    variant="outline"
                                    className="text-xs mt-0.5"
                                  >
                                    Demo/Install
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="w-[10%] px-2">
                            {item.itemGroupName ? (
                              <div className="truncate max-w-full">
                                <Badge
                                  variant="secondary"
                                  className="inline-block max-w-[130px] truncate text-xs"
                                  title={item.itemGroupName}
                                >
                                  <span className="block truncate">{item.itemGroupName}</span>
                                </Badge>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">—</p>
                            )}
                          </TableCell>

                          <TableCell className="w-[9%] px-2">
                            {item.brandName ? (
                              <div className="truncate max-w-full">
                                <Badge
                                  variant="outline"
                                  className="inline-block max-w-[90px] truncate text-xs"
                                  title={item.brandName}
                                >
                                  <span className="block truncate">{item.brandName}</span>
                                </Badge>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">—</p>
                            )}
                          </TableCell>

                          <TableCell className="w-[9%] px-2">
                            {item.hsnCode ? (
                              <Badge
                                variant="outline"
                                className="font-mono text-xs truncate max-w-[100px]"
                                title={item.hsnCode}
                              >
                                <span className="truncate">{item.hsnCode}</span>
                              </Badge>
                            ) : (
                              <p className="text-xs text-muted-foreground">—</p>
                            )}
                          </TableCell>

                          <TableCell className="w-[7%] px-1">
                            <p className="text-xs font-medium">
                              {item.gst || 0}%
                            </p>
                          </TableCell>

                          <TableCell className="w-[9%] px-1">
                            <Badge variant="outline" className="text-xs">
                              {item.uom}
                            </Badge>
                          </TableCell>

                          <TableCell className="w-[13%] px-1">
                            <p className="font-medium">{formatWholeNumber(openingStock)}</p>
                            {Number(minimumQty) > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Min: {minimumQty}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="w-[12%] px-1">
                            <p className="font-medium">{margin}%</p>
                            {Number(offerPrice) > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Offer: ₹{offerPrice}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="w-[9%] text-center">
                            <span
                              className={`inline-flex min-w-[84px] items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                item.isActive
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-100 text-slate-500"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  item.isActive ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              />
                              {item.isActive ? "Active" : "Inactive"}
                            </span>
                          </TableCell>

                          <TableCell className="w-[8%]">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  router.push(`/inventory-masters/items/view?id=${item.id}`)
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
                                      `/inventory-masters/items/edit?id=${item.id}`,
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
                                  onClick={() => handleDeleteClick(item)}
                                  className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                                  title="Delete"
                                >
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
                  totalItems={totalItems}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                  itemLabel="items"
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
                    <strong>{itemToDelete?.itemName}</strong> from the
                    inventory. This action cannot be undone.
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
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
