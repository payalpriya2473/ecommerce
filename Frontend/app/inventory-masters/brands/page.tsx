"use client"

import { BrandManager } from "@/components/masters/brand-manager"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

export default function BrandsPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <BrandManager />
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
