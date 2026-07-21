"use client"
import { DepartmentManager } from "@/components/masters/department-manager"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

export default function DepartmentsPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Departments</h2>
            <p className="text-muted-foreground">Manage company departments</p>
          </div>

          <DepartmentManager />
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
