"use client";

import React from "react";
import { usePermissions } from "@/contexts/Permissionprovider";

interface PermissionGateProps {
  module: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component to conditionally render children based on permissions
 * Usage: <PermissionGate module="employees" action="create">...</PermissionGate>
 */
export function PermissionGate({
  module,
  action,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return null;
  }

  if (!hasPermission(module, action)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface MultiPermissionGateProps {
  permissions: { module: string; action: string }[];
  requireAll?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Component to conditionally render based on multiple permissions
 * Usage:
 * <MultiPermissionGate permissions={[{module: "employees", action: "create"}, {...}]} requireAll>
 *   ...
 * </MultiPermissionGate>
 */
export function MultiPermissionGate({
  permissions,
  requireAll = false,
  children,
  fallback = null,
}: MultiPermissionGateProps) {
  const { hasAnyPermission, hasAllPermissions, loading } = usePermissions();

  if (loading) {
    return null;
  }

  const permitted = requireAll
    ? hasAllPermissions(permissions)
    : hasAnyPermission(permissions);

  if (!permitted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
