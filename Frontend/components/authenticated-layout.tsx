"use client"

import type React from "react"
import { useState } from "react"

import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { cn } from "@/lib/utils"

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />
      <div
        className={cn(
          "min-h-screen transition-[margin-left] duration-300",
          sidebarCollapsed ? "ml-16" : "ml-64",
        )}
      >
        <AppHeader />
        <main>{children}</main>
      </div>
    </div>
  )
}
