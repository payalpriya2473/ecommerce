"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

import {
  ArrowLeft,
  Edit,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Wallet,
  Calendar,
  Briefcase,
  Clock,
  FileText,
  Loader2,
} from "lucide-react"

import {
  employeeAPI,
  departmentAPI,
  designationAPI,
  companyAPI,
  Employee,
  Department,
  Designation,
  Company,
} from "@/lib/api"

function EmployeeDetailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const employeeId = searchParams.get("id")

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [department, setDepartment] = useState<Department | null>(null)
  const [designation, setDesignation] = useState<Designation | null>(null)
  const [loading, setLoading] = useState(true)

  /* =========================
     LOAD EMPLOYEE + MASTER DATA
  ========================= */
  useEffect(() => {
    const loadData = async () => {
      const token = sessionStorage.getItem("authToken")
      if (!token) {
        router.push("/login")
        return
      }

      try {
        // Load employee
        if (!employeeId) {
          router.push("/employee/list")
          return
        }

        const empRes = await employeeAPI.getById(employeeId, token)
        if (!empRes.success) {
          router.push("/employee/list")
          return
        }

        setEmployee(empRes.data)

        // Load company
        if (empRes.data.companyId) {
          const companyRes = await companyAPI.getById(token, empRes.data.companyId)
          if (companyRes.success) {
            setCompany(companyRes.data)
          }
        }

        // Load department
        if (empRes.data.departmentId) {
          const deptRes = await departmentAPI.getById(token, empRes.data.departmentId)
          if (deptRes.success) {
            setDepartment(deptRes.data)
          }
        }

        // Load designation
        if (empRes.data.designationId) {
          const desigRes = await designationAPI.getAll(
            token,
            empRes.data.companyId,
            empRes.data.departmentId || undefined
          )
          if (desigRes.success) {
            const desig = desigRes.data.find((d: Designation) => d.id === empRes.data.designationId)
            if (desig) setDesignation(desig)
          }
        }
      } catch (err) {
        console.error("Employee load failed", err)
        router.push("/employee/list")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [employeeId, router])

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const formatDate = (date?: string) => {
    if (!date) return "N/A"
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading employee details...</p>
        </div>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="w-full px-4 md:px-6 py-8">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Employee not found</p>
            <Link href="/employee/list">
              <Button className="mt-4">Back to List</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* =========================
     UI
  ========================= */
  return (
    <div className="w-full px-4 md:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-3xl font-bold">Employee Details</h2>
            <p className="text-muted-foreground">
              Complete information for {employee.name}
            </p>
          </div>
        </div>

        <Link href={`/employee/edit?id=${employee.id}`}>
          <Button>
            <Edit className="h-4 w-4 mr-2" />
            Edit Employee
          </Button>
        </Link>
      </div>

      <div className="grid gap-6">
        {/* PROFILE HEADER */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage 
                  src={employee.photoUrl ? `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}${employee.photoUrl}` : undefined} 
                  alt={employee.name} 
                />
                <AvatarFallback className="text-2xl">{getInitials(employee.name)}</AvatarFallback>
              </Avatar>
              
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-2xl font-bold">{employee.name}</h3>
                    <p className="text-muted-foreground">{designation?.name || "N/A"}</p>
                    <p className="text-sm text-muted-foreground">{department?.name || "N/A"}</p>
                  </div>
                  <Badge variant={employee.isActive ? "default" : "secondary"} className="text-sm">
                    {employee.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                
                <Separator className="my-4" />
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Employee No.</p>
                    <p className="font-semibold">{employee.employeeNo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Gender</p>
                    <p className="capitalize">{employee.gender}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Joining Date</p>
                    <p>{formatDate(employee.joiningDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p>{company?.name || "N/A"}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* CONTACT */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p>{employee.email || "—"}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Mobile</p>
                  <p>{employee.mobile}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* WORK SCHEDULE */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Work Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Off</p>
                  <p>{employee.weeklyOff || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Grace Minutes</p>
                  <p>{employee.graceMinutes ?? 0} min</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">In Time</p>
                  <p>{employee.inTime || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Out Time</p>
                  <p>{employee.outTime || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* IDENTITY */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Identity & Statutory Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">PAN No.</p>
                <p className="font-mono">{employee.panNo || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aadhaar (UID)</p>
                <p className="font-mono">{employee.uidNo || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">PF No.</p>
                <p>{employee.pfNo || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ESI No.</p>
                <p>{employee.esiNo || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SALARY */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Salary Components
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                ["Basic Salary", employee.basicSalary],
                ["HRA", employee.hra],
                ["SPA", employee.spa],
                ["Conveyance", employee.conveyance],
                ["Medical", employee.medical],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between items-center border-b pb-2"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">
                    ₹{((value as number) ?? 0).toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
              <Separator className="my-2" />
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">
                  ₹{(
                    (employee.basicSalary ?? 0) +
                    (employee.hra ?? 0) +
                    (employee.spa ?? 0) +
                    (employee.conveyance ?? 0) +
                    (employee.medical ?? 0)
                  ).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* BANK DETAILS */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Bank Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Bank Name</p>
                <p className="font-semibold">{employee.bankName || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Branch</p>
                <p>{employee.bankBranch || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account Number</p>
                <p className="font-mono">{employee.accountNo || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">IFSC Code</p>
                <p className="font-mono">{employee.ifscCode || "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function EmployeeDetailPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }>
          <EmployeeDetailContent />
        </Suspense>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
