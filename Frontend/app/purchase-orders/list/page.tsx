"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ShoppingCart, Search, Eye, Edit, Trash2, AlertCircle, CheckCircle2, Plus, Package, Printer } from "lucide-react"
import { purchaseOrderAPI } from "@/lib/api"
import Link from "next/link"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PermissionGate } from "@/components/PermissionGate"
import { SortableTableHead, SORTABLE_HEADER_ROW_CLASS } from "@/components/ui/sortable-table-head"
import { sortCollectionByKey, type SortState } from "@/lib/table-sort"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

interface PurchaseOrder {
  id: string
  poNumber: string
  supplierId: string
  supplierName: string
  supplierCity?: string
  supplierEmail?: string
  supplierPhone?: string
  poDate: string
  totalAmount: number
  netAmount: number
  discountPercent: number
  sgst: number
  cgst: number
  igst: number
  itemCount: number
  paymentTerms?: string
  createdAt: string
  items?: Array<unknown>
  orderItems?: Array<unknown>
  purchaseOrderItems?: Array<unknown>
}

const getItemCount = (order: PurchaseOrder) => {
  if (typeof order.itemCount === "number" && order.itemCount > 0) return order.itemCount
  if (Array.isArray(order.items)) return order.items.length
  if (Array.isArray(order.orderItems)) return order.orderItems.length
  if (Array.isArray(order.purchaseOrderItems)) return order.purchaseOrderItems.length
  return 0
}

function EmailActionIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={props.className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function WhatsAppActionIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={props.className}>
      <path d="M12 4.5c-4.13 0-7.5 3.18-7.5 7.09 0 1.33.39 2.63 1.13 3.76L4.5 19.5l4.31-1.07c1.03.54 2.2.82 3.38.82 4.13 0 7.5-3.18 7.5-7.09S16.13 4.5 12 4.5Z" />
      <path d="M10.1 8.55c-.16-.34-.31-.35-.46-.35h-.39c-.13 0-.34.05-.53.25-.19.2-.72.69-.72 1.68 0 .98.74 1.93.84 2.06.1.13 1.47 2.18 3.56 3.05.5.21.88.33 1.18.42.49.15.95.13 1.31.08.4-.06 1.2-.48 1.37-.95.17-.47.17-.88.12-.95-.05-.08-.19-.12-.39-.22-.2-.1-1.2-.59-1.38-.66-.18-.07-.31-.1-.45.1-.13.2-.53.66-.65.8-.12.14-.24.15-.45.05-.2-.1-.85-.31-1.62-.98-.6-.53-1.01-1.18-1.13-1.38-.12-.2-.01-.31.09-.42.09-.09.2-.24.29-.35.09-.11.12-.2.2-.33.07-.13.04-.24-.02-.34-.06-.1-.48-1.14-.66-1.56Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

const digitsOnly = (value: string) => value.replace(/\D/g, "")

const buildMailToLink = (order: PurchaseOrder) => {
  if (!order.supplierEmail) return ""
  const subject = `Purchase Order ${order.poNumber} - AppleNext Enterprise Suite`
  const body = [
    `Hello ${order.supplierName || ""},`,
    "",
    `Please find your Purchase Order ${order.poNumber}.`,
    `PO Date: ${order.poDate ? new Date(order.poDate).toLocaleDateString("en-IN") : "-"}`,
    `Amount: ₹ ${(order.netAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    "",
    "Regards,",
    "AppleNext Enterprise Suite",
  ].join("\n")
  return `mailto:${order.supplierEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

const buildWhatsAppLink = (order: PurchaseOrder) => {
  if (!order.supplierPhone) return ""
  let phone = digitsOnly(order.supplierPhone)
  if (!phone) return ""
  if (phone.length === 10) phone = `91${phone}`
  const message = [
    `Hello ${order.supplierName || ""},`,
    `Please check Purchase Order ${order.poNumber}.`,
    `PO Date: ${order.poDate ? new Date(order.poDate).toLocaleDateString("en-IN") : "-"}`,
    `Amount: ₹ ${(order.netAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    "",
    "Regards,",
    "AppleNext Enterprise Suite",
  ].join("\n")
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export default function PurchaseOrdersListPage() {
  type PurchaseOrderSortKey = "poNumber" | "supplier" | "date" | "items" | "netAmount"
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [allOrders, setAllOrders] = useState<PurchaseOrder[]>([])
  const [filteredOrders, setFilteredOrders] = useState<PurchaseOrder[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [sortState, setSortState] = useState<SortState<PurchaseOrderSortKey>>({
    key: "date",
    direction: "desc",
  })

  useEffect(() => { fetchOrders() }, [])
  useEffect(() => { filterOrders() }, [searchTerm, allOrders])

  const fetchOrders = async () => {
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) { setIsLoading(false); return }
      const result = await purchaseOrderAPI.getAll(token)
      if (result.success) {
        setAllOrders(result.data)
      } else {
        setError(result.message || "Failed to load purchase orders")
      }
    } catch {
      setError("Failed to load purchase orders")
    } finally {
      setIsLoading(false)
    }
  }

  const filterOrders = () => {
    let filtered = allOrders
    if (searchTerm) {
      filtered = filtered.filter(
        (o) =>
          o.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          o.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    setFilteredOrders(filtered)
  }

  const sortedOrders = useMemo(
    () =>
      sortCollectionByKey(
        filteredOrders,
        {
          poNumber: (order) => order.poNumber,
          supplier: (order) => order.supplierName,
          date: (order) => new Date(order.createdAt || order.poDate),
          items: (order) => getItemCount(order),
          netAmount: (order) => order.netAmount,
        },
        sortState,
      ),
    [filteredOrders, sortState],
  )

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize))
  const paginatedRows = sortedOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, sortState])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize)
    setCurrentPage(1)
  }

  const handleSort = (key: PurchaseOrderSortKey) => {
    setSortState((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }))
  }

  const handleDeleteClick = (order: PurchaseOrder) => {
    setOrderToDelete(order)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const result = await purchaseOrderAPI.delete(orderToDelete.id, token)
      if (result.success) {
        setAllOrders((prev) => prev.filter((o) => o.id !== orderToDelete.id))
        setSuccess("Purchase Order deleted successfully")
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(result.message || "Failed to delete")
      }
    } catch {
      setError("Failed to delete purchase order")
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setOrderToDelete(null)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-"
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    })
  }

  const formatCurrency = (amount: number) =>
    `₹ ${(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const openExternal = (url: string) => {
    if (!url) return
    window.open(url, "_blank", "noopener,noreferrer")
  }

  if (isLoading) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading purchase orders...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    )
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
                <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
                <p className="text-muted-foreground mt-1">Manage purchase orders with suppliers</p>
              </div>
              <PermissionGate module="suppliers" action="create">
                <Link href="/purchase-orders/register">
                  <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90 transition-opacity">
                    <Plus className="h-4 w-4 mr-2" />
                    New Purchase Order
                  </Button>
                </Link>
              </PermissionGate>
            </div>

            {/* Filters */}
            <Card className="mb-6 border-border/50 shadow-sm py-0 gap-0">
              <CardContent className="p-0">
                <div className="flex gap-4 flex-col sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by PO number or supplier..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-10 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            {filteredOrders.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No purchase orders found</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    {searchTerm ? "Try adjusting your filters" : "Create your first purchase order to get started"}
                  </p>
                  {!searchTerm && (
                    <PermissionGate module="suppliers" action="create">
                      <Link href="/purchase-orders/register">
                        <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                          <Plus className="h-4 w-4 mr-2" />
                          New Purchase Order
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
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <SortableTableHead label="PO Number" active={sortState.key === "poNumber"} direction={sortState.direction} onClick={() => handleSort("poNumber")} />
                        <SortableTableHead label="Supplier" active={sortState.key === "supplier"} direction={sortState.direction} onClick={() => handleSort("supplier")} />
                        <SortableTableHead label="Date" active={sortState.key === "date"} direction={sortState.direction} onClick={() => handleSort("date")} />
                        <SortableTableHead label="Items" active={sortState.key === "items"} direction={sortState.direction} onClick={() => handleSort("items")} />
                        <SortableTableHead label="Net Amount" active={sortState.key === "netAmount"} direction={sortState.direction} onClick={() => handleSort("netAmount")} className="text-right" buttonClassName="justify-end" />
                        <TableHead className="font-semibold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedRows.map((order) => (
                        <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                                <ShoppingCart className="h-5 w-5 text-white" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{order.poNumber}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-sm">{order.supplierName || "—"}</p>
                            {order.supplierCity && (
                              <p className="text-xs text-muted-foreground">{order.supplierCity}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{formatDate(order.poDate)}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{getItemCount(order)} items</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="font-semibold text-sm">{formatCurrency(order.netAmount)}</p>
                            {order.discountPercent > 0 && (
                              <p className="text-xs text-green-600">-{order.discountPercent}% disc.</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              {/* Email */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openExternal(buildMailToLink(order))}
                                className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                title={order.supplierEmail ? "Email Supplier" : "No supplier email available"}
                                disabled={!order.supplierEmail}
                              >
                                <EmailActionIcon className="h-4 w-4" />
                              </Button>

                              {/* WhatsApp */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openExternal(buildWhatsAppLink(order))}
                                className="h-8 w-8 hover:bg-green-50 hover:text-green-600"
                                title={order.supplierPhone ? "WhatsApp Supplier" : "No supplier phone available"}
                                disabled={!order.supplierPhone}
                              >
                                <WhatsAppActionIcon className="h-4 w-4" />
                              </Button>

                              {/* Print */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/purchase-orders/print?id=${order.id}`)}
                                className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                                title="Print PO"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>

                              {/* View */}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push(`/purchase-orders/view?id=${order.id}`)}
                                className="h-8 w-8 hover:bg-accent/10 hover:text-accent"
                                title="View"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              {/* Edit */}
                              <PermissionGate module="suppliers" action="update">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => router.push(`/purchase-orders/edit?id=${order.id}`)}
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </PermissionGate>

                              {/* Delete */}
                              <PermissionGate module="suppliers" action="delete">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteClick(order)}
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
                  totalItems={sortedOrders.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                  itemLabel="purchase orders"
                />
              </Card>
            )}

            {/* Delete Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete <strong>{orderToDelete?.poNumber}</strong>. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteConfirm}
                    disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
