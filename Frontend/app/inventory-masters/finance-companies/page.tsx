"use client"

import { FinanceCompanyManager } from "@/components/masters/finance-company-manager"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

export default function FinanceCompaniesPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <FinanceCompanyManager />
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
