"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination";
import { AlertCircle, Eye, RefreshCw, Search, ShoppingBag } from "lucide-react";
import { onlineOrderAPI, type OnlineOrder } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_CLASS,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_CLASS,
  formatDateTime,
  formatINR,
  paymentMethodLabel,
} from "./order-status";

const TABS: { key: string; label: string; count?: (c: Record<string, number>) => number }[] = [
  { key: "needs_action", label: "To Process", count: (c) => (c.processing || 0) + (c.confirmed || 0) + (c.packed || 0) },
  { key: "processing", label: "New", count: (c) => c.processing || 0 },
  { key: "confirmed", label: "Confirmed", count: (c) => c.confirmed || 0 },
  { key: "packed", label: "Packed", count: (c) => c.packed || 0 },
  { key: "shipped", label: "Shipped", count: (c) => c.shipped || 0 },
  { key: "out_for_delivery", label: "Out for Delivery", count: (c) => c.out_for_delivery || 0 },
  { key: "delivered", label: "Delivered" },
  { key: "pending_payment", label: "Awaiting Payment", count: (c) => c.pending_payment || 0 },
  { key: "cancelled", label: "Cancelled" },
  { key: "returned", label: "Returned" },
  { key: "refund_pending", label: "Refund Check" },
  { key: "all", label: "All" },
];

export default function OnlineOrdersPage() {
  const router = useRouter();
  const { hasPermission, loading: permissionsLoading } = usePermissions();

  const [tab, setTab] = useState("needs_action");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [payment, setPayment] = useState<"" | "cod" | "online">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [tab, debouncedSearch, payment, from, to, pageSize]);

  const fetchOrders = useCallback(async () => {
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    setIsLoading(true);
    try {
      const result = await onlineOrderAPI.getAll(token, {
        status: tab,
        search: debouncedSearch,
        payment,
        from,
        to,
        page,
        limit: pageSize,
      });
      if (result.success) {
        setOrders(Array.isArray(result.data) ? result.data : []);
        setTotal(result.pagination?.total ?? 0);
        setCounts(result.counts ?? {});
        setError("");
      } else {
        setError(result.message || "Failed to load orders");
      }
    } catch {
      setError("Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }, [tab, debouncedSearch, payment, from, to, page, pageSize]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  if (!permissionsLoading && !hasPermission("online_orders", "view")) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Card className="max-w-md w-full">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground text-center">You don&apos;t have permission to view online orders.</p>
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
        <div className="py-8 px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Online Orders</h1>
              <p className="text-muted-foreground mt-1">Orders placed on the website — confirm, pack, ship and deliver</p>
            </div>
            <Button variant="outline" onClick={() => void fetchOrders()} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {TABS.map((t) => {
              const n = t.count ? t.count(counts) : undefined;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                    tab === t.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border"
                  )}
                >
                  {t.label}
                  {n ? (
                    <span
                      className={cn(
                        "ml-2 rounded-full px-1.5 py-0.5 text-xs",
                        tab === t.key ? "bg-white/20" : "bg-muted-foreground/10"
                      )}
                    >
                      {n}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
            <CardContent className="p-3 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Order no., customer name, phone, email, AWB or payment ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>
              <select
                value={payment}
                onChange={(e) => setPayment(e.target.value as "" | "cod" | "online")}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All payments</option>
                <option value="cod">Cash on Delivery</option>
                <option value="online">Online (Razorpay)</option>
              </select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 md:w-40" title="From date" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 md:w-40" title="To date" />
            </CardContent>
          </Card>

          {isLoading && orders.length === 0 ? (
            <div className="flex items-center justify-center min-h-[30vh]">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
            </div>
          ) : orders.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-semibold mb-1">No orders here</p>
                <p className="text-muted-foreground text-sm">Try another tab or clear the filters.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="font-semibold">Order</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold text-center">Qty</TableHead>
                      <TableHead className="font-semibold text-right">Amount</TableHead>
                      <TableHead className="font-semibold">Payment</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold text-center">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow
                        key={o.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => router.push(`/online-orders/view?id=${o.id}`)}
                      >
                        <TableCell>
                          <div className="font-semibold text-sm">{o.orderNumber}</div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(o.placedAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{o.customer.name || o.address.name || "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {[o.customer.phone, o.address.city].filter(Boolean).join(" · ")}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm">{o.itemCount ?? "-"}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{formatINR(o.totalAmount)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{paymentMethodLabel(o.paymentMethod)}</div>
                          <span
                            className={cn(
                              "inline-block mt-0.5 rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize",
                              PAYMENT_STATUS_CLASS[o.paymentStatus]
                            )}
                          >
                            {o.paymentStatus}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", ORDER_STATUS_CLASS[o.status])}>
                            {ORDER_STATUS_LABEL[o.status] || o.status}
                          </span>
                          {o.statusLabel && o.statusLabel.includes("Refund") ? (
                            <div className="text-[11px] text-muted-foreground mt-0.5">{o.statusLabel}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/online-orders/view?id=${o.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="orders"
              />
            </Card>
          )}
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
