"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { AuthGuard } from "@/components/auth-guard"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { branchAPI, salesInvoiceAPI, type Branch, type SalesInvoice } from "@/lib/api"
import { Building2, FileText, IndianRupee, Store } from "lucide-react"

type DashboardInvoice = SalesInvoice & Record<string, unknown>
type ApiBranch = Branch & Record<string, unknown>

const salesChartConfig = { revenue: { label: "Sales", color: "hsl(var(--primary))" } } satisfies ChartConfig
const branchChartConfig = {
  showroom: { label: "Showrooms", color: "#e11d48" }, godown: { label: "Godowns", color: "#f59e0b" },
  warehouse: { label: "Warehouses", color: "#0ea5e9" }, office: { label: "Offices", color: "#8b5cf6" },
  service_center: { label: "Service centres", color: "#10b981" }, other: { label: "Other", color: "#64748b" },
} satisfies ChartConfig
const branchColours: Record<string, string> = { showroom: "#e11d48", godown: "#f59e0b", warehouse: "#0ea5e9", office: "#8b5cf6", service_center: "#10b981", other: "#64748b" }
const toNumber = (value: unknown) => Number(value) || 0
const formatCurrency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value)

function getRecords<T>(response: unknown): T[] {
  const data = (response as { data?: unknown })?.data
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === "object") {
    const records = data as { rows?: unknown; items?: unknown; data?: unknown }
    if (Array.isArray(records.rows)) return records.rows as T[]
    if (Array.isArray(records.items)) return records.items as T[]
    if (Array.isArray(records.data)) return records.data as T[]
  }
  return []
}
function invoiceAmount(invoice: DashboardInvoice) {
  const storedAmount = toNumber(invoice.netAmount ?? invoice.net_amount ?? invoice.totalAmount ?? invoice.total_amount)
  if (storedAmount) return storedAmount
  const items = (Array.isArray(invoice.items) ? invoice.items : Array.isArray(invoice.invoiceItems) ? invoice.invoiceItems : []) as Record<string, unknown>[]
  if (!items.length) return 0
  const gross = items.reduce((sum, item) => sum + toNumber(item.qty) * toNumber(item.rate), 0)
  const scheme = items.reduce((sum, item) => sum + toNumber(item.scheme), 0)
  const itemDiscount = items.reduce((sum, item) => sum + toNumber(item.discountRs), 0)
  const taxable = items.reduce((sum, item) => sum + toNumber(item.amount), 0)
  const installation = items.reduce((sum, item) => sum + toNumber(item.installation), 0)
  return gross - scheme - itemDiscount - (taxable * toNumber(invoice.discountPercent)) / 100 + toNumber(invoice.freightAmount) + toNumber(invoice.otherCharges) + toNumber(invoice.processingFees1) + toNumber(invoice.processingFees2) + toNumber(invoice.installationAmt) + installation
}
function needsInvoiceHydration(invoice: DashboardInvoice) {
  return invoiceAmount(invoice) === 0 && !Array.isArray(invoice.items) && !Array.isArray(invoice.invoiceItems) && Boolean(invoice.id)
}
function invoiceDate(invoice: DashboardInvoice) {
  const value = invoice.billDate ?? invoice.bill_date ?? invoice.createdAt ?? invoice.created_at
  const date = value ? new Date(String(value)) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}
function monthKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}` }
function branchType(branch: ApiBranch) {
  const type = String(branch.type ?? branch.branchType ?? branch.branch_type ?? "other").toLowerCase()
  return type in branchChartConfig ? type : "other"
}

export default function DashboardPage() {
  const router = useRouter()
  const [userRole, setUserRole] = useState("")
  const [invoices, setInvoices] = useState<DashboardInvoice[]>([])
  const [branches, setBranches] = useState<ApiBranch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    let isMounted = true
    const loadDashboardData = async () => {
      const token = sessionStorage.getItem("authToken")
      const companyId = sessionStorage.getItem("companyId") || undefined
      const role = sessionStorage.getItem("userRole") || ""
      if (!token || sessionStorage.getItem("isAuthenticated") !== "true") { router.replace("/login"); return }
      setUserRole(role)
      try {
        const [invoiceResponse, branchResponse] = await Promise.all([
          salesInvoiceAPI.getAll(token),
          branchAPI.getAll(token, role === "super_admin" ? undefined : companyId),
        ])
        if (!isMounted) return
        const errors: string[] = []
        if (!(invoiceResponse as { success?: boolean }).success) errors.push("sales invoices")
        if (!(branchResponse as { success?: boolean }).success) errors.push("branches")
        const listedInvoices = getRecords<DashboardInvoice>(invoiceResponse)
        const hydratedInvoices = await Promise.all(listedInvoices.map(async (invoice) => {
          if (!needsInvoiceHydration(invoice)) return invoice
          try {
            const detail = await salesInvoiceAPI.getById(token, String(invoice.id))
            return detail.success && detail.data ? { ...invoice, ...detail.data } as DashboardInvoice : invoice
          } catch { return invoice }
        }))
        if (!isMounted) return
        setInvoices(hydratedInvoices)
        setBranches(getRecords<ApiBranch>(branchResponse))
        setLoadError(errors.length ? `Unable to load ${errors.join(" and ")}.` : "")
      } catch {
        if (isMounted) setLoadError("Unable to load dashboard data. Please refresh and try again.")
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }
    void loadDashboardData()
    return () => { isMounted = false }
  }, [router])

  const dashboard = useMemo(() => {
    const now = new Date(), currentMonth = monthKey(now)
    const totalSales = invoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0)
    const thisMonthInvoices = invoices.filter((invoice) => {
      const date = invoiceDate(invoice)
      return date ? monthKey(date) === currentMonth : false
    })
    const thisMonthSales = thisMonthInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0)
    const trend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1), key = monthKey(date)
      const matching = invoices.filter((invoice) => { const invoiceDay = invoiceDate(invoice); return invoiceDay ? monthKey(invoiceDay) === key : false })
      return { month: date.toLocaleString("en-IN", { month: "short" }), revenue: matching.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0), invoices: matching.length }
    })
    const typeCounts = branches.reduce<Record<string, number>>((counts, branch) => {
      const type = branchType(branch); counts[type] = (counts[type] || 0) + 1; return counts
    }, {})
    const branchDistribution = Object.entries(typeCounts).map(([type, value]) => ({ type, name: branchChartConfig[type as keyof typeof branchChartConfig]?.label || type, value, fill: branchColours[type] || branchColours.other }))
    return { totalSales, thisMonthSales, thisMonthInvoiceCount: thisMonthInvoices.length, trend, branchDistribution }
  }, [branches, invoices])

  if (isLoading) return <AuthGuard><div className="flex min-h-screen items-center justify-center"><div className="text-center"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" /><p className="text-muted-foreground">Loading dashboard...</p></div></div></AuthGuard>

  return <AuthGuard><div className="flex min-h-screen bg-gradient-to-br from-accent/5 via-background to-accent-secondary/5"><AppSidebar /><div className="ml-64 flex-1"><AppHeader /><main className="w-full px-4 py-8 md:px-6">
    <div className="mb-8"><h1 className="text-3xl font-bold tracking-tight">{userRole === "super_admin" ? "Super Admin Dashboard" : "Dashboard"}</h1><p className="mt-2 text-muted-foreground">A live overview of sales invoices and branch operations.</p></div>
    {loadError && <p className="mb-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard title="Sales Invoices" value={invoices.length.toLocaleString("en-IN")} description="All recorded invoices" icon={<FileText className="h-5 w-5" />} onDoubleClick={() => router.push("/sales-invoices/list")} />
      <MetricCard title="Sales this month" value={formatCurrency(dashboard.thisMonthSales)} description={`${dashboard.thisMonthInvoiceCount} invoice${dashboard.thisMonthInvoiceCount === 1 ? "" : "s"} this month`} icon={<IndianRupee className="h-5 w-5" />} onDoubleClick={() => router.push("/sales-invoices/list")} />
      <MetricCard title="Total sales" value={formatCurrency(dashboard.totalSales)} description="All recorded invoice value" icon={<IndianRupee className="h-5 w-5" />} onDoubleClick={() => router.push("/sales-invoices/list")} />
      <MetricCard title="Total branches" value={branches.length.toLocaleString("en-IN")} description={`${dashboard.branchDistribution.find((item) => item.type === "showroom")?.value || 0} showrooms`} icon={<Building2 className="h-5 w-5" />} onDoubleClick={() => router.push("/branch/list")} />
    </section>
    <section className="mt-6 grid gap-6 xl:grid-cols-5">
      <Card className="cursor-pointer select-none transition-shadow hover:shadow-md xl:col-span-3" onDoubleClick={() => router.push("/sales-invoices/list")} title="Double-click to open Sales Invoices"><CardHeader><CardTitle>Sales performance</CardTitle><CardDescription>Invoice value across the last six months</CardDescription></CardHeader><CardContent>
        {invoices.length ? <ChartContainer config={salesChartConfig} className="h-[300px] w-full aspect-auto"><BarChart accessibilityLayer data={dashboard.trend} margin={{ top: 12, right: 12, left: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} /><YAxis tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => `₹${Number(value) >= 100000 ? `${(Number(value) / 100000).toFixed(1)}L` : Number(value).toLocaleString("en-IN")}`} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} /></BarChart></ChartContainer> : <EmptyChart message="Sales trend will appear after your first invoice is created." />}
      </CardContent></Card>
      <Card className="cursor-pointer select-none transition-shadow hover:shadow-md xl:col-span-2" onDoubleClick={() => router.push("/branch/list")} title="Double-click to open Branches"><CardHeader><CardTitle>Branch distribution</CardTitle><CardDescription>Branches by operating type</CardDescription></CardHeader><CardContent>
        {dashboard.branchDistribution.length ? <><ChartContainer config={branchChartConfig} className="mx-auto h-[230px] w-full max-w-[320px] aspect-auto"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="type" hideLabel />} /><Pie data={dashboard.branchDistribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>{dashboard.branchDistribution.map((entry) => <Cell key={entry.type} fill={entry.fill} />)}</Pie></PieChart></ChartContainer><div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">{dashboard.branchDistribution.map((entry) => <span className="flex items-center gap-1.5" key={entry.type}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />{entry.name} ({entry.value})</span>)}</div></> : <EmptyChart message="Branch distribution will appear after branches are added." />}
      </CardContent></Card>
    </section>
  </main></div></div></AuthGuard>
}

function MetricCard({ title, value, description, icon, onDoubleClick }: { title: string; value: string; description: string; icon: React.ReactNode; onDoubleClick: () => void }) {
  return <Card className="cursor-pointer select-none transition-shadow hover:shadow-md" onDoubleClick={onDoubleClick} title={`Double-click to open ${title}`}><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><span className="text-muted-foreground">{icon}</span></CardHeader><CardContent><div className="text-2xl font-bold">{value}</div><p className="mt-1 text-xs text-muted-foreground">{description}</p></CardContent></Card>
}
function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-[300px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground"><Store className="h-8 w-8" /><p>{message}</p></div>
}
