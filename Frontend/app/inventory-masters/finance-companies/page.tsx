"use client"

import { ModuleTemporarilyDisabled } from "@/components/module-temporarily-disabled"
// Temporarily disabled: Finance Companies screen.
// import { FinanceCompanyManager } from "@/components/masters/finance-company-manager"

export default function FinanceCompaniesPage() {
  return <ModuleTemporarilyDisabled moduleName="Finance Companies" />
}
