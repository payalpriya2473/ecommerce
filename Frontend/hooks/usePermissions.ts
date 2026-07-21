'use client'

import { useContext } from 'react'
import { usePermissions as usePermissionsContext } from '@/contexts/Permissionprovider'

/**
 * Hook to access user permissions and check access
 */
export function usePermissions() {
  return usePermissionsContext()
}
    
/**
 * Hook to check if user has specific permission
 */
export function useHasPermission(module: string, action: string): boolean {
  const { hasPermission } = usePermissions()
  return hasPermission(module, action)
}

/**
 * Hook to check if user has any of the permissions
 */
export function useHasAnyPermission(checks: { module: string; action: string }[]): boolean {
  const { hasAnyPermission } = usePermissions()
  return hasAnyPermission(checks)
}

/**
 * Hook to check if user has all permissions
 */
export function useHasAllPermissions(checks: { module: string; action: string }[]): boolean {
  const { hasAllPermissions } = usePermissions()
  return hasAllPermissions(checks)
}

/**
 * Hook to check module-level access
 */
export function useModuleAccess(module: string) {
  const { canView, canCreate, canEdit, canDelete } = usePermissions()

  return {
    canView: canView(module),
    canCreate: canCreate(module),
    canEdit: canEdit(module),
    canDelete: canDelete(module),
  }
}