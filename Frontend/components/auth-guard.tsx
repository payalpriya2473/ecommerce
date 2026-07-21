"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Skip auth check on login page
    if (pathname === "/login") {
      return
    }

    // Check authentication
    const isAuthenticated = sessionStorage.getItem("isAuthenticated")
    const authToken = sessionStorage.getItem("authToken")
    const userId = sessionStorage.getItem("userId")


    // If not authenticated, redirect to login
    if (isAuthenticated !== "true" || !authToken || !userId) {
      
      router.replace("/login")
    } else {
      console.log(" Authenticated, access granted")
    }
  }, [pathname, router])

  return <>{children}</>
}