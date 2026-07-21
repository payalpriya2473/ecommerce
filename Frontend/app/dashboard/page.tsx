"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthGuard } from "@/components/auth-guard"
import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { Store, Users, Warehouse, Building2 } from "lucide-react"
import { findCompanyById, findBranchesByCompany, employees, companies } from "@/lib/store"
import type { Company } from "@/lib/types"

export default function DashboardPage() {
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [branchCount, setBranchCount] = useState(0)
  const [showroomCount, setShowroomCount] = useState(0)
  const [godownCount, setGodownCount] = useState(0)
  const [employeeCount, setEmployeeCount] = useState(0)
  const [userRole, setUserRole] = useState<string>("")
  const [totalCompanies, setTotalCompanies] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadDashboardData = () => {
      
      const userId = sessionStorage.getItem("userId")
      const companyId = sessionStorage.getItem("companyId")
      const role = sessionStorage.getItem("userRole") || ""
      const isAuthenticated = sessionStorage.getItem("isAuthenticated")


      if (!userId || isAuthenticated !== "true") {
        
        router.push("/login")
        return
      }

      setUserRole(role)

      if (role === "super_admin") {
        setTotalCompanies(companies.length)

        // Calculate total branches across all companies
        const allBranches = companies.flatMap((c) => findBranchesByCompany(c.id))
        setBranchCount(allBranches.length)
        setShowroomCount(allBranches.filter((b) => b.type === "showroom").length)
        setGodownCount(allBranches.filter((b) => b.type === "godown").length)
        setEmployeeCount(employees.length)
        setIsLoading(false)
        return
      }

      if (!companyId) {
        router.push("/login")
        return
      }

      const companyData = findCompanyById(companyId)
      if (companyData) {
        setCompany(companyData)
        const companyBranches = findBranchesByCompany(companyId)
        setBranchCount(companyBranches.length)
        setShowroomCount(companyBranches.filter((b) => b.type === "showroom").length)
        setGodownCount(companyBranches.filter((b) => b.type === "godown").length)

        const companyEmployees = employees.filter((e) => e.companyId === companyId)
        setEmployeeCount(companyEmployees.length)
      }
      
      setIsLoading(false)
    }

    loadDashboardData()
  }, [router])

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-gradient-to-br from-accent/5 via-background to-accent-secondary/5">
        <AppSidebar />

        {/* Main Content */}
        <div className="flex-1 ml-64">
          <AppHeader />

          <div className="w-full px-4 md:px-6 py-8">
            {/* Welcome Section */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-accent to-accent-secondary bg-clip-text text-transparent">
                {userRole === "super_admin" ? "Super Admin Dashboard" : "Welcome back!"}
              </h2>
              <p className="text-muted-foreground">
                {userRole === "super_admin"
                  ? "Manage all companies and tenants from here"
                  : "Manage your company, branches, and employees from here"}
              </p>
            </div>

            {/* Stats Grid */}
            {/* <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {userRole === "super_admin" && (
                <Card className="hover:shadow-lg hover:border-accent/50 transition-all">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalCompanies}</div>
                    <p className="text-xs text-muted-foreground">Registered tenants</p>
                  </CardContent>
                </Card>
              )}

              <Card className="hover:shadow-lg hover:border-accent/50 transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Branches</CardTitle>
                  <Store className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{branchCount}</div>
                  <p className="text-xs text-muted-foreground">
                    {showroomCount} Showrooms, {godownCount} Godowns
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg hover:border-accent/50 transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Showrooms</CardTitle>
                  <Store className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{showroomCount}</div>
                  <p className="text-xs text-muted-foreground">Active showrooms</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg hover:border-accent/50 transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Godowns</CardTitle>
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{godownCount}</div>
                  <p className="text-xs text-muted-foreground">Storage facilities</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg hover:border-accent/50 transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Employees</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{employeeCount}</div>
                  <p className="text-xs text-muted-foreground">
                    {userRole === "super_admin" ? "Total employees" : "Company employees"}
                  </p>
                </CardContent>
              </Card>
            </div> */}

            {company && userRole !== "super_admin" && (
              <Card>
                <CardHeader>
                  <CardTitle>Company Information</CardTitle>
                  <CardDescription>Your registered company details</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Company Name</p>
                        <p className="font-medium">{company.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Address</p>
                        <p className="font-medium">
                          {company.address}, {company.city}
                        </p>
                        <p className="font-medium">
                          {company.state} - {company.pinCode}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">GST Number</p>
                        <p className="font-medium font-mono">{company.gstNumber}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">PAN Number</p>
                        <p className="font-medium font-mono">{company.panNumber}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-muted-foreground">Bank Details</p>
                        <p className="font-medium">{company.bankName}</p>
                        <p className="text-sm">{company.bankBranch}</p>
                        <p className="text-sm font-mono">{company.accountNumber}</p>
                        <p className="text-sm font-mono">{company.ifscCode}</p>
                      </div>
                      {company.upiId && (
                        <div>
                          <p className="text-sm text-muted-foreground">UPI ID</p>
                          <p className="font-medium font-mono">{company.upiId}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
