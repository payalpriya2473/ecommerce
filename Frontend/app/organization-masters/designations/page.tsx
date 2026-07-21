"use client"
import { DesignationManager } from "@/components/masters/designation-manager"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

export default function DesignationsPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Designations</h2>
            <p className="text-muted-foreground">Manage employee designations</p>
          </div>

          <DesignationManager />
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
