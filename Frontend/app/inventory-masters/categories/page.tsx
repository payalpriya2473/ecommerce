"use client"

import { CategoryManager } from "@/components/masters/category-manager"
import { AuthGuard } from "@/components/auth-guard"
import { AuthenticatedLayout } from "@/components/authenticated-layout"

export default function CategoriesPage() {
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="w-full px-4 py-8">
          <CategoryManager />
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  )
}
