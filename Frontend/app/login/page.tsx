"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { authAPI, companyAPI } from "@/lib/api"

interface Company {
  id: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [selectedCompany, setSelectedCompany] = useState("")
  const [companies, setCompanies] = useState<Company[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSuperAdminLogin, setIsSuperAdminLogin] = useState(false)

  // Check if already logged in
  useEffect(() => {
    const token = sessionStorage.getItem("authToken")
    if (token) {
      router.replace("/dashboard")
    }
  }, [router])

  // Fetch companies on component mount
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const companies = await authAPI.getCompanies()
        const normalizedCompanies = companies.map((company) => ({
          id: String(company.id),
          name: company.name,
        }))
        setCompanies(normalizedCompanies)
      } catch (error) {
        
        // Set demo company as fallback
        setCompanies([
          { id: 'demo-company-001', name: 'Demo Enterprises Pvt Ltd' }
        ])
      }
    }
    fetchCompanies()
  }, [])

  // Check if super admin login
  useEffect(() => {
    if (email.includes("superadmin")) {
      setIsSuperAdminLogin(true)
    } else {
      setIsSuperAdminLogin(false)
    }
  }, [email])

  useEffect(() => {
    if (isSuperAdminLogin) {
      setSelectedCompany("")
    }
  }, [isSuperAdminLogin])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    if (!email || !password) {
      setError("Please enter email and password")
      setIsLoading(false)
      return
    }

    if (!isSuperAdminLogin && !selectedCompany) {
      setError("Please select company")
      setIsLoading(false)
      return
    }

    try {
      const result = await authAPI.login({
        email,
        password,
        companyId: isSuperAdminLogin ? undefined : selectedCompany,
      })

      if (result.success && result.data) {
        // Clear any existing session data
        sessionStorage.clear()

        // Store user data
        sessionStorage.setItem("userId", result.data.user.id)
        sessionStorage.setItem("companyId", result.data.user.companyId || "")
        sessionStorage.setItem("userRole", result.data.user.role)
        sessionStorage.setItem("userEmail", result.data.user.email)
        sessionStorage.setItem("authToken", result.data.token)
        sessionStorage.setItem("isAuthenticated", "true")

        const resolvedCompanyId = result.data.user.companyId || selectedCompany
        if (resolvedCompanyId) {
          sessionStorage.setItem("companyId", resolvedCompanyId)

          try {
            const companyResult = await companyAPI.getById(result.data.token, resolvedCompanyId)
            const companyCode = companyResult?.data?.php_company_code

            if (companyCode) {
              sessionStorage.setItem("companyCode", companyCode)
            }
          } catch (companyError) {
            console.error("Failed to resolve company code during login:", companyError)
          }
        }


        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("permissions:refresh"))
        }


        // Use replace instead of push to avoid back button issues
        router.replace("/dashboard")
      } else {
        setError(result.message || "Invalid credentials or access denied")
      }
    } catch (error) {
      setError("Unable to connect to the server. Please try again later")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent/10 via-background to-accent-secondary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 overflow-hidden rounded-full border bg-white shadow-sm">
              <Image
                src="/motabhai_log.jpeg"
                alt="Motabhai"
                width={64}
                height={64}
                className="h-full w-full object-cover"
                priority
              />
            </div>
          </div>
          <CardTitle className="text-2xl">
            {isSuperAdminLogin ? "Motabhai Enterprise Suite - Super Admin" : "Motabhai Enterprise Suite"}
          </CardTitle>
          <CardDescription>
            {isSuperAdminLogin ? "System administrator access" : "Access your company dashboard"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="employee@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {!isSuperAdminLogin && (
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Select value={selectedCompany} onValueChange={(value) => setSelectedCompany(String(value))}>
                  <SelectTrigger id="company" className="w-full h-10 bg-background">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">Loading companies...</div>
                    ) : (
                      companies.map((company) => (
                        <SelectItem key={String(company.id)} value={String(company.id)}>
                          {company.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedCompany && (
                  <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-muted-foreground">
                    Selected company:{" "}
                    <span className="font-medium text-foreground">
                      {companies.find((company) => String(company.id) === selectedCompany)?.name || "Unknown company"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
              disabled={isLoading}
            >
              {isLoading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <div className="mt-6 space-y-3">
            {/* Super Admin Account */}
            {/* <div className="p-4 bg-accent/5 border border-accent/30 rounded-lg">
              <p className="text-sm font-semibold text-accent mb-2">Super Admin Account:</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium">Email:</span> superadmin@system.com
                </p>
                <p>
                  <span className="font-medium">Password:</span> super123
                </p>
                <p className="text-xs mt-2 text-accent">Can manage all companies and tenants</p>
              </div>
            </div> */}

            {/* Company Admin Account */}
            {/* <div className="p-4 bg-accent/5 border border-accent/30 rounded-lg">
              <p className="text-sm font-semibold text-accent mb-2">Company Admin Account:</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium">Email:</span> admin@demo.com
                </p>
                <p>
                  <span className="font-medium">Password:</span> admin123
                </p>
                <p>
                  <span className="font-medium">Company:</span> Demo Enterprises Pvt Ltd
                </p>
              </div>
            </div> */}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
