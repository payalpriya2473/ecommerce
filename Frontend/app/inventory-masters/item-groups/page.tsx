"use client"

import { ItemGroupManager } from "@/components/masters/item-group-manager"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

export default function ItemGroupsPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <ItemGroupManager />
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
