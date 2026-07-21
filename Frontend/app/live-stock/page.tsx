"use client"

import { startTransition, useDeferredValue, useEffect, useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { authAPI, companyAPI } from "@/lib/api"
import { stockAPI, StockItem, StockSearchParams, SyncLog } from "@/lib/stockApi"
import { TablePagination, DEFAULT_PAGE_SIZE } from "@/components/ui/table-pagination"

// ── Types ──────────────────────────────────────────────────────────────────
interface FilterState {
  itemgroup: string
  item:      string
  brand:     string
  branch:    string
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1 shadow-sm">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</span>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────
function Badge({ value, variant }: { value: string | number; variant: "success" | "danger" | "warning" | "info" | "default" }) {
  const styles = {
    success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    danger:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    info:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    default: "bg-muted text-muted-foreground",
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${styles[variant]}`}>
      {value}
    </span>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function LiveStockPage() {
  const router = useRouter()
  const [companyCode, setCompanyCode] = useState("")
  const [filters, setFilters]         = useState<FilterState>({ itemgroup: "", item: "", brand: "", branch: "" })
  const [data, setData]               = useState<StockItem[]>([])
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState("")
  const [searched, setSearched]       = useState(false)
  const [search, setSearch]           = useState("")  // table search
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const deferredSearch = useDeferredValue(search)

  // ── Sync (live API → database) ────────────────────────────────────────────
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState("")
  const [lastSync, setLastSync] = useState<SyncLog | null>(null)

  const loadSyncStatus = useCallback(async () => {
    try {
      const res = await stockAPI.getSyncStatus()
      if (res.success) setLastSync(res.latest)
    } catch { /* non-fatal */ }
  }, [])

  useEffect(() => { loadSyncStatus() }, [loadSyncStatus])

  // Get company_code from session (stored after login)
  useEffect(() => {
    const resolveCompanyCode = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token) {
        router.replace("/login")
        return
      }

      const storedCode = sessionStorage.getItem("companyCode") || ""
      if (storedCode) {
        setCompanyCode(storedCode)
        return
      }

      const storedCompanyId = sessionStorage.getItem("companyId") || ""
      if (storedCompanyId) {
        try {
          const companyResult = await companyAPI.getById(token, storedCompanyId)
          const resolvedCode = companyResult?.data?.php_company_code || ""

          if (resolvedCode) {
            sessionStorage.setItem("companyCode", resolvedCode)
            setCompanyCode(resolvedCode)
            return
          }
        } catch (companyError) {
          console.error("Failed to load company code from company details:", companyError)
        }
      }

      const role = sessionStorage.getItem("userRole") || ""
      if (role === "super_admin") {
        try {
          const companies = await authAPI.getCompanies()
          const firstCompany = companies[0]

          if (firstCompany?.id) {
            sessionStorage.setItem("companyId", firstCompany.id)

            const companyResult = await companyAPI.getById(token, firstCompany.id)
            const resolvedCode = companyResult?.data?.php_company_code || ""

            if (resolvedCode) {
              sessionStorage.setItem("companyCode", resolvedCode)
              setCompanyCode(resolvedCode)
              return
            }
          }
        } catch (companyError) {
          console.error("Failed to auto-resolve company for super admin:", companyError)
        }
      }

      setError("Company code not found. Please select/login with a company that has php_company_code set.")
    }

    resolveCompanyCode()
  }, [router])

  const handleSearch = useCallback(async () => {
    if (!companyCode) {
      setError("Company code not found in session. Please log out and log in again.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const params: StockSearchParams = {
        company_code: companyCode,
        ...(filters.itemgroup && { itemgroup: filters.itemgroup }),
        ...(filters.item      && { item:      filters.item      }),
        ...(filters.brand     && { brand:     filters.brand     }),
        ...(filters.branch    && { branch:    filters.branch    }),
      }
      const res = await stockAPI.search(params)
      if (res.flag === 1 && res.stock_search) {
        setData(res.stock_search)
        setCurrentPage(1)
      } else {
        setData([])
        setError(res.message || "No stock data found for the selected filters.")
      }
    } catch {
      setError("Failed to fetch live stock. Check your connection.")
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }, [companyCode, filters])

  const handleReset = () => {
    setFilters({ itemgroup: "", item: "", brand: "", branch: "" })
    setData([])
    setError("")
    setSearched(false)
    setSearch("")
    setCurrentPage(1)
  }

  const handleSync = useCallback(async () => {
    if (!companyCode) {
      setSyncMsg("Company code not found. Log out and log in again.")
      return
    }
    setSyncing(true)
    setSyncMsg("")
    try {
      const res = await stockAPI.syncNow({
        company_code: companyCode,
        ...(filters.itemgroup && { itemgroup: filters.itemgroup }),
        ...(filters.item      && { item:      filters.item      }),
        ...(filters.brand     && { brand:     filters.brand     }),
        ...(filters.branch    && { branch:    filters.branch    }),
      })
      if (res.success && res.result) {
        const r = res.result
        const counts = `Synced ${r.itemsProcessed} items → ${r.itemsCreated} new, ${r.itemsUpdated} updated, ${r.liveStockRows} live-stock rows.`
        setSyncMsg(`${counts} ${res.message || ""}`)
      } else {
        setSyncMsg(res.message || "Sync failed.")
      }
    } catch {
      setSyncMsg("Sync request failed. Check your connection.")
    } finally {
      setSyncing(false)
      loadSyncStatus()
    }
  }, [companyCode, filters, loadSyncStatus])

  // Summary stats
  const stats = useMemo(() => ({
    total:   data.reduce((s, r) => s + Number(r.TSTOCK  || 0), 0),
    damaged: data.reduce((s, r) => s + Number(r.DSTOCK  || 0), 0),
    aged:    data.reduce((s, r) => s + Number(r.ASTOCK  || 0), 0),
    pending: data.reduce((s, r) => s + Number(r.penord  || 0), 0),
    pdel:    data.reduce((s, r) => s + Number(r.PDEL    || 0), 0),
  }), [data])

  // Table-level search
  const filtered = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase()

    if (!normalizedSearch) {
      return data
    }

    return data.filter((row) =>
      row.ITEM.toLowerCase().includes(normalizedSearch) ||
      row.BRAND.toLowerCase().includes(normalizedSearch) ||
      row.ITEMGROUP.toLowerCase().includes(normalizedSearch) ||
      (row.category || "").toLowerCase().includes(normalizedSearch) ||
      (row.hsncode || "").toLowerCase().includes(normalizedSearch)
    )
  }, [data, deferredSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filtered.slice(startIndex, startIndex + pageSize)
  }, [currentPage, pageSize, filtered])

  useEffect(() => {
    setCurrentPage(1)
  }, [deferredSearch])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize)
    setCurrentPage(1)
  }

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <div className="space-y-6 max-w-screen-2xl">
            {/* Header */}
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Live Stock</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Real-time stock data from your inventory system
                </p>
              </div>
              {lastSync && (
                <div className="text-xs text-muted-foreground sm:text-right">
                  <span className="font-medium">Last synced:</span>{" "}
                  {lastSync.finishedAt
                    ? new Date(lastSync.finishedAt).toLocaleString("en-IN")
                    : "in progress…"}
                  <span className={`ml-2 inline-block rounded-full px-2 py-0.5 font-semibold ${
                    lastSync.status === "success" ? "bg-green-100 text-green-700"
                    : lastSync.status === "partial" ? "bg-yellow-100 text-yellow-700"
                    : lastSync.status === "error" ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"}`}>
                    {lastSync.status}
                  </span>
                </div>
              )}
            </div>

            {/* Filter Panel */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-foreground mb-3">Filter Stock</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Item Group</label>
                  <input
                    type="text"
                    placeholder="e.g. MOBILE"
                    value={filters.itemgroup}
                    onChange={e => setFilters(p => ({ ...p, itemgroup: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Item Code</label>
                  <input
                    type="text"
                    placeholder="e.g. TCPSIB2411"
                    value={filters.item}
                    onChange={e => setFilters(p => ({ ...p, item: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Brand</label>
                  <input
                    type="text"
                    placeholder="e.g. SAMSUNG"
                    value={filters.brand}
                    onChange={e => setFilters(p => ({ ...p, brand: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Branch</label>
                  <input
                    type="text"
                    placeholder="e.g. MAIN"
                    value={filters.branch}
                    onChange={e => setFilters(p => ({ ...p, branch: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-accent-secondary px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Loading...
                    </>
                  ) : "Search Live Stock"}
                </button>
                {searched && (
                  <button
                    onClick={handleReset}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition"
                  >
                    Reset
                  </button>
                )}
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    title="Pull the live API data into the database (items, groups, brands, categories, live stock)"
                    className="ml-auto inline-flex items-center gap-2 rounded-md border border-accent px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/10 disabled:opacity-50 transition"
                  >
                    {syncing ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                        Syncing...
                      </>
                    ) : "Sync to Database"}
                  </button>
              </div>
              {syncMsg && (
                <p className="mt-2 text-xs text-muted-foreground">{syncMsg}</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Stats */}
            {data.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <StatCard label="Total Stock" value={stats.total} color="text-foreground" />
                <StatCard label="Damaged" value={stats.damaged} color="text-red-600 dark:text-red-400" />
                <StatCard label="Aged" value={stats.aged} color="text-yellow-600 dark:text-yellow-400" />
                <StatCard label="Pending Orders" value={stats.pending} color="text-blue-600 dark:text-blue-400" />
                <StatCard label="Pending Delivery" value={stats.pdel} color="text-orange-600 dark:text-orange-400" />
              </div>
            )}

            {/* Table */}
            {data.length > 0 && (
              <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    {filtered.length} item{filtered.length !== 1 ? "s" : ""} found
                  </p>
                  <input
                    type="text"
                    placeholder="Search by item, brand, group..."
                    value={search}
                    onChange={(e) => {
                      const nextValue = e.target.value
                      startTransition(() => {
                        setSearch(nextValue)
                      })
                    }}
                    className="w-full sm:w-64 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Item</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Group</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Brand</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Total</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Damaged</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Aged</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Pend. Ord.</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Pend. Del.</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">MRP</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Incentive</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Scheme</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Category</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">HSN</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">GST %</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Margin %</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Op. Qty</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">Min Qty</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">MOP %</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">MOP Amt</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">NLC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.map((row, i) => (
                        <tr
                          key={`${row.ITEM}-${row.BRAND}-${row.ITEMGROUP}-${i}`}
                          className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{row.ITEM}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.ITEMGROUP}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.BRAND}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge value={row.TSTOCK || 0} variant="success" />
                          </td>
                          <td className="px-4 py-3 text-right">
                            {Number(row.DSTOCK) > 0
                              ? <Badge value={row.DSTOCK} variant="danger" />
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {Number(row.ASTOCK) > 0
                              ? <Badge value={row.ASTOCK} variant="warning" />
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {Number(row.penord) > 0
                              ? <Badge value={row.penord} variant="info" />
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {Number(row.PDEL) > 0
                              ? <Badge value={row.PDEL} variant="warning" />
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                            {row.offerprice ? `₹${Number(row.offerprice).toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 whitespace-nowrap">
                            {row.incentive ? `₹${Number(row.incentive).toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-blue-700 dark:text-blue-400 whitespace-nowrap">
                            {row.schamt ? `₹${Number(row.schamt).toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.category || "—"}</td>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.hsncode || "—"}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {row.gst !== undefined && row.gst !== "" ? `${Number(row.gst)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {row.margin_prc !== undefined && row.margin_prc !== "" ? `${Number(row.margin_prc)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {row.opqty !== undefined && row.opqty !== "" ? Number(row.opqty).toLocaleString("en-IN") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {row.minqty !== undefined && row.minqty !== "" ? Number(row.minqty).toLocaleString("en-IN") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {row.mopprc !== undefined && row.mopprc !== "" ? `${Number(row.mopprc)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {row.mopamt !== undefined && row.mopamt !== "" ? `₹${Number(row.mopamt).toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">
                            {row.nlc !== undefined && row.nlc !== "" ? `₹${Number(row.nlc).toLocaleString("en-IN")}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  page={currentPage}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={handlePageSizeChange}
                  itemLabel="items"
                />
              </div>
            )}

            {/* Empty state */}
            {searched && !loading && data.length === 0 && !error && (
              <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
                <p className="text-lg font-medium">No stock found</p>
                <p className="text-sm mt-1">Try adjusting your filters or clearing them to see all items.</p>
              </div>
            )}

            {/* Initial state */}
            {!searched && !loading && (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
                <p className="text-lg font-medium">Apply filters and click Search</p>
                <p className="text-sm mt-1">Leave all filters blank to load all live stock.</p>
              </div>
            )}
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
