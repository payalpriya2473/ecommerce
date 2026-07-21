"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Tag, Plus, Search, Edit, Trash2, AlertCircle, CheckCircle2,
} from "lucide-react"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"
import { offerAPI, type Offer } from "@/lib/api"
import { SECTION_OPTIONS } from "@/app/inventory-masters/offers/OfferForm"

const sectionLabel = (s: string) => SECTION_OPTIONS.find((o) => o.value === s)?.label ?? s
const fmt = (n?: number | null) => (n == null ? "—" : `Rs ${Number(n).toLocaleString("en-IN")}`)
const fmtDate = (v?: string | null) => {
  if (!v) return "—"
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

export interface OffersSubmodule {
  title: string
  subtitle: string
  /** sections that belong to this sub-module; empty = all */
  sections: string[]
  /** section the Add button pre-selects */
  addSection: string
}

export function OffersListView({ submodule }: { submodule: OffersSubmodule }) {
  const router = useRouter()
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [refreshToken, setRefreshToken] = useState(0)

  const [deleteTarget, setDeleteTarget] = useState<Offer | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const token = sessionStorage.getItem("authToken")
        if (!token) return
        const res = await offerAPI.getAll(token)
        if (res.success && Array.isArray(res.data)) {
          setOffers(res.data)
          setError("")
        } else {
          setOffers([])
          setError(res.message || "Failed to load offers")
        }
      } catch {
        setOffers([])
        setError("Failed to load offers")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshToken])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const secs = submodule.sections
    return offers.filter((o) => {
      if (secs.length && !secs.includes(o.section)) return false
      if (statusFilter === "active" && !o.isActive) return false
      if (statusFilter === "inactive" && o.isActive) return false
      if (!q) return true
      return (
        (o.itemName || "").toLowerCase().includes(q) ||
        (o.brandName || "").toLowerCase().includes(q) ||
        (o.badge || "").toLowerCase().includes(q) ||
        (o.bankName || "").toLowerCase().includes(q) ||
        (o.comboTitle || "").toLowerCase().includes(q)
      )
    })
  }, [offers, search, statusFilter, submodule.sections])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  useEffect(() => { setCurrentPage(1) }, [search, statusFilter])
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages) }, [currentPage, totalPages])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) return
      const res = await offerAPI.delete(deleteTarget.id, token)
      if (res.success) {
        setDeleteTarget(null)
        setSuccess("Offer deleted")
        setRefreshToken((v) => v + 1)
        setTimeout(() => setSuccess(""), 3000)
      } else {
        setError(res.message || "Failed to delete offer")
      }
    } finally {
      setIsDeleting(false)
    }
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
                <AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{submodule.title}</h1>
                <p className="text-muted-foreground mt-1">{submodule.subtitle}</p>
              </div>
              <Link href={`/inventory-masters/offers/register?section=${submodule.addSection}`}>
                <Button className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90">
                  <Tag className="h-4 w-4 mr-2" /> Add Offer
                </Button>
              </Link>
            </div>

            {/* Filters */}
            <Card className="mb-4 border-border/50 shadow-sm">
              <CardContent className="p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by product, brand, bank, combo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full h-10"><SelectValue placeholder="All Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <div className="py-16 text-center text-muted-foreground">Loading offers...</div>
            ) : filtered.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Tag className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-semibold mb-2">No {submodule.title.toLowerCase()} yet</p>
                  <p className="text-muted-foreground mb-6 text-center max-w-md">
                    Add offers to this section — they appear on the website Offers page automatically.
                  </p>
                  <Link href={`/inventory-masters/offers/register?section=${submodule.addSection}`}>
                    <Button className="bg-gradient-to-r from-accent to-accent-secondary">
                      <Plus className="h-4 w-4 mr-2" /> Add Offer
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/50 shadow-sm">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="font-semibold">Product</TableHead>
                        <TableHead className="font-semibold">Section</TableHead>
                        <TableHead className="font-semibold text-right">Discount</TableHead>
                        <TableHead className="font-semibold text-right">Offer Price</TableHead>
                        <TableHead className="font-semibold">Schedule</TableHead>
                        <TableHead className="font-semibold text-center">Status</TableHead>
                        <TableHead className="font-semibold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((o) => {
                        const isBank = o.section === "bank_offer"
                        const isCombo = o.section === "combo"
                        const isCoupon = o.section === "coupon"
                        const isBrand = o.section === "brand_deal"
                        return (
                        <TableRow key={o.id} className="hover:bg-muted/30">
                          <TableCell>
                            {isBank ? (
                              <>
                                <p className="font-medium">{o.bankName || "—"}{o.bankAbbr ? <span className="text-muted-foreground"> · {o.bankAbbr}</span> : null}</p>
                                <p className="text-xs text-muted-foreground">{[o.offerSub, o.description].filter(Boolean).join(" • ").slice(0, 60)}</p>
                              </>
                            ) : isCombo ? (
                              <>
                                <p className="font-medium">{o.comboTitle || "Combo"}</p>
                                <p className="text-xs text-muted-foreground">{Array.isArray(o.comboItems) ? `${o.comboItems.length} products` : ""}</p>
                              </>
                            ) : isCoupon ? (
                              <>
                                <p className="font-medium">{o.couponTitle || o.couponCode || "Coupon"}</p>
                                <p className="text-xs text-muted-foreground">{[o.couponCode, o.categoryLabel].filter(Boolean).join(" • ")}</p>
                              </>
                            ) : isBrand ? (
                              <>
                                <p className="font-medium">{o.brandDealName || "Brand"}</p>
                                <p className="text-xs text-muted-foreground">{[o.discountLabel, Array.isArray(o.productIds) ? `${o.productIds.length} products` : ""].filter(Boolean).join(" • ")}</p>
                              </>
                            ) : (
                              <>
                                <p className="font-medium">{o.itemName || "—"}{o.variant ? <span className="text-muted-foreground"> · {o.variant}</span> : null}</p>
                                <p className="text-xs text-muted-foreground">{[o.brandName, o.badge].filter(Boolean).join(" • ")}</p>
                              </>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="inline-block rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">{sectionLabel(o.section)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            {isBank
                              ? (o.offerText || "—")
                              : isCombo
                              ? "Combo"
                              : isCoupon
                              ? (o.couponCode || "—")
                              : isBrand
                              ? (o.discountLabel || "—")
                              : o.discountPercent ? `${o.discountPercent}%` : o.discountAmount ? `Rs ${Number(o.discountAmount).toLocaleString("en-IN")}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt(o.offerPrice)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(o.startAt)} <span className="opacity-60">→</span> {fmtDate(o.endAt)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex min-w-[78px] items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${o.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${o.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                              {o.isActive ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" title="Edit" className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600"
                                onClick={() => router.push(`/inventory-masters/offers/edit?id=${o.id}`)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Delete" className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                                onClick={() => setDeleteTarget(o)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
                  totalItems={filtered.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(n) => { setPageSize(n); setCurrentPage(1) }}
                  itemLabel="offers"
                />
              </Card>
            )}

            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this offer?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes <strong>{deleteTarget?.section === "bank_offer" ? deleteTarget?.bankName : deleteTarget?.section === "combo" ? deleteTarget?.comboTitle : deleteTarget?.itemName}</strong> from the <strong>{sectionLabel(deleteTarget?.section || "")}</strong> section on the website.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                    {isDeleting ? "Deleting..." : "Yes, Delete"}
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
