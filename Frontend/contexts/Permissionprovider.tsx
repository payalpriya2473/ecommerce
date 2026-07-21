"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { rbacAPI } from "@/lib/api"

interface Permission {
  id: string
  module: string
  action: string
  description: string
}

interface PermissionContextType {
  permissions: string[]
  permissionDetails: Permission[]
  loading: boolean
  error: string | null
  isSuperAdmin: boolean
  hasPermission: (module: string, action: string) => boolean
  hasAnyPermission: (checks: { module: string; action: string }[]) => boolean
  hasAllPermissions: (checks: { module: string; action: string }[]) => boolean
  canView: (module: string) => boolean
  canCreate: (module: string) => boolean
  canEdit: (module: string) => boolean
  canDelete: (module: string) => boolean
  refreshPermissions: () => Promise<void>
}

const PermissionContext = createContext<PermissionContextType | null>(null)

interface PermissionProviderProps {
  children: React.ReactNode
}

const normalizePermission = (permission: Permission): Permission => ({
  ...permission,
  module: String(permission.module || "").trim().toLowerCase(),
  action: String(permission.action || "").trim().toLowerCase(),
})

const MODULE_ALIASES: Record<string, string[]> = {
  rbac: ["roles"],
  roles: ["rbac"],
  settings: ["invoice_settings"],
  invoice_settings: ["settings"],
  sales_invoices: ["sales"],
  sales: ["sales_invoices"],
  item_master: ["items"],
  items: ["item_master"],
}

const ACTION_ALIASES: Record<string, string[]> = {
  read: ["view"],
  view: ["read"],
  update: ["edit"],
  edit: ["update"],
}

const getModuleCandidates = (module: string): string[] => {
  const normalized = String(module || "").trim().toLowerCase()
  return Array.from(
    new Set([normalized, ...(MODULE_ALIASES[normalized] || [])])
  )
}

const getActionCandidates = (action: string): string[] => {
  const normalized = String(action || "").trim().toLowerCase()
  return Array.from(
    new Set([normalized, ...(ACTION_ALIASES[normalized] || [])])
  )
}

export function PermissionProvider({ children }: PermissionProviderProps) {
  const [permissions, setPermissions] = useState<string[]>([])
  const [permissionDetails, setPermissionDetails] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  const dispatchPermissionsReady = (detail: Record<string, unknown>) => {
    if (typeof window === "undefined") return

    try {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("permissions:ready", { detail }))
      }, 0)
    } catch (e) {
      console.warn("Could not dispatch permissions:ready", e)
    }
  }

  const setResolvedPermissions = (
    items: Permission[],
    nextIsSuperAdmin: boolean
  ) => {
    const normalized = items.map(normalizePermission)
    const codes = normalized.map((p) => `${p.module}:${p.action}`)

    setPermissions(codes)
    setPermissionDetails(normalized)
    setIsSuperAdmin(nextIsSuperAdmin)

    dispatchPermissionsReady({
      permissions: codes,
      isSuperAdmin: nextIsSuperAdmin,
    })
  }

  const clearResolvedPermissions = (extra: Record<string, unknown> = {}) => {
    setPermissions([])
    setPermissionDetails([])
    setIsSuperAdmin(false)
    dispatchPermissionsReady({ permissions: [], ...extra })
  }

  const fetchPermissions = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = sessionStorage.getItem("authToken")
      const userId = sessionStorage.getItem("userId")
      const role = sessionStorage.getItem("userRole")

      if (!token) {
        clearResolvedPermissions()
        return
      }

      if (role === "super_admin") {
        setPermissions(["*"])
        setPermissionDetails([])
        setIsSuperAdmin(true)
        dispatchPermissionsReady({ permissions: ["*"], isSuperAdmin: true })
        return
      }

      let result = await rbacAPI.getCurrentUserPermissions(token)
      let resolvedPermissions = Array.isArray(result?.data) ? result.data : []


      if (result?.success && resolvedPermissions.length === 0 && userId) {
        const fallback = await rbacAPI.getUserPermissions(token, userId)
        if (fallback?.success && Array.isArray(fallback.data)) {
          result = fallback
          resolvedPermissions = fallback.data
        }
      }

      if (result?.success) {
        setResolvedPermissions(
          resolvedPermissions,
          Boolean(result.isSuperAdmin)
        )
      } else {
        const message = result?.message || "Failed to load permissions"
        setError(message)
        clearResolvedPermissions({ error: message })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      clearResolvedPermissions({ error: message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPermissions()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const onRefresh = () => {
      fetchPermissions()
    }

    const onClear = () => {
      clearResolvedPermissions()
      setLoading(false)

      try {
        window.dispatchEvent(new CustomEvent("permissions:cleared"))
      } catch (e) {
        console.warn("Could not dispatch permissions:cleared", e)
      }
    }

    window.addEventListener("permissions:refresh", onRefresh)
    window.addEventListener("permissions:clear", onClear)

    return () => {
      window.removeEventListener("permissions:refresh", onRefresh)
      window.removeEventListener("permissions:clear", onClear)
    }
  }, [])

  const hasPermission = (module: string, action: string): boolean => {
    if (isSuperAdmin) return true

    const moduleCandidates = getModuleCandidates(module)
    const actionCandidates = getActionCandidates(action)

    return moduleCandidates.some((moduleCandidate) =>
      actionCandidates.some((actionCandidate) =>
        permissions.includes(`${moduleCandidate}:${actionCandidate}`)
      )
    )
  }

  const hasAnyPermission = (
    checks: { module: string; action: string }[]
  ): boolean => {
    if (isSuperAdmin) return true
    return checks.some(({ module, action }) => hasPermission(module, action))
  }

  const hasAllPermissions = (
    checks: { module: string; action: string }[]
  ): boolean => {
    if (isSuperAdmin) return true
    return checks.every(({ module, action }) => hasPermission(module, action))
  }

  const canView = (module: string): boolean => hasPermission(module, "read")
  const canCreate = (module: string): boolean => hasPermission(module, "create")
  const canEdit = (module: string): boolean => hasPermission(module, "update")
  const canDelete = (module: string): boolean => hasPermission(module, "delete")

  const refreshPermissions = async () => {
    await fetchPermissions()
  }

  const value: PermissionContextType = {
    permissions,
    permissionDetails,
    loading,
    error,
    isSuperAdmin,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canView,
    canCreate,
    canEdit,
    canDelete,
    refreshPermissions,
  }

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermissions() {
  const context = useContext(PermissionContext)
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionProvider")
  }
  return context
}
