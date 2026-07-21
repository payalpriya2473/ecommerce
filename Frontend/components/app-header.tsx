"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { LogOut, Building2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { authAPI } from "@/lib/api"

export function AppHeader() {
  const router = useRouter()
  const [userName, setUserName] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [branchName, setBranchName] = useState("")
  const [userRole, setUserRole] = useState("")

  useEffect(() => {
    if (typeof window !== "undefined") {
      setUserName(sessionStorage.getItem("userName") || "User")
      setUserEmail(sessionStorage.getItem("userEmail") || "")
      setCompanyName(sessionStorage.getItem("companyName") || "")
      setBranchName(sessionStorage.getItem("branchName") || "")
      setUserRole(sessionStorage.getItem("userRole") || "")
    }
  }, [])

  // FIXED LOGOUT
const handleLogout = async () => {
  try {
    const token = sessionStorage.getItem("authToken")

    if (token) {
      await authAPI.logout(token)
    }
  } catch (error) {
    console.error("Logout API failed:", error)
  } finally {
    sessionStorage.clear()
    router.replace("/login")
  }
}

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="glass-effect sticky top-0 z-30 border-b">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {userRole === "super_admin" ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent/10 border border-accent/20">
              <Building2 className="h-4 w-4 text-accent" />
              <span className="font-medium text-accent">System Administrator</span>
            </div>
          ) : (
            <>
              <Building2 className="h-4 w-4" />
              <span className="font-medium text-foreground">{companyName}</span>
              {branchName && (
                <>
                  <span>/</span>
                  <span>{branchName}</span>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border-2 border-accent/20">
              <AvatarFallback className="bg-gradient-to-br from-accent to-accent-secondary text-white text-sm font-semibold">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
            <div className="text-sm text-right hidden md:block">
              <p className="font-semibold text-foreground leading-none mb-1">{userName}</p>
              <p className="text-xs text-muted-foreground">{userEmail}</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-accent/30 hover:bg-accent hover:text-white hover:border-accent transition-all bg-transparent"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
