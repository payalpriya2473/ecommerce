// Simple in-memory store for demo purposes
// Replace with actual database calls later

import type { Company, Branch, Department, Designation, Employee, User, Technician, ItemGroup, Brand, Category, ItemMaster, Permission, Role, UserRole } from "./types"

// Mock data stores
export const companies: Company[] = []
export const branches: Branch[] = []
export const departments: Department[] = []
export const designations: Designation[] = []
export const employees: Employee[] = []
export const users: User[] = []
export const technicians: Technician[] = []

// Inventory data stores
export const itemGroups: ItemGroup[] = []
export const brands: Brand[] = []
export const categories: Category[] = []
export const itemMasters: ItemMaster[] = []

// RBAC data stores
export const permissions: Permission[] = []
export const roles: Role[] = []
export const userRoles: UserRole[] = []

// Demo Company
// const demoCompanyId = "demo-company-001"
// companies.push({
//   id: demoCompanyId,
//   name: "Demo Enterprises Pvt Ltd",
//   address: "123 Business Park, MG Road",
//   city: "Mumbai",
//   state: "Maharashtra",
//   pinCode: "400001",
//   gstNumber: "27AABCU9603R1ZM",
//   panNumber: "AABCU9603R",
//   bankName: "HDFC Bank",
//   accountNumber: "50200012345678",
//   ifscCode: "HDFC0001234",
//   bankBranch: "MG Road Branch",
//   banks: [
//     {
//       id: "bank-001",
//       bankName: "HDFC Bank",
//       bankBranch: "MG Road Branch",
//       accountNumber: "50200012345678",
//       ifscCode: "HDFC0001234",
//       accountType: "current",
//       isPrimary: true,
//     },
//   ],
//   upiId: "demo@hdfcbank",
//   qrCodeData: "upi://pay?pa=demo@hdfcbank&pn=Demo%20Enterprises&cu=INR",
//   udid: "",
//   msmeRegistered: false,
//   msmeNumber: "",
//   msmeCategory: undefined,
//   msmeType: undefined,
//   tdsApplicable: false,
//   tanNumber: "",
//   tdsRate: 0,
//   isActive: true,
//   createdAt: new Date(),
//   updatedAt: new Date(),
// })

// Demo Branch
// const demoBranchId = "demo-branch-001"
// branches.push({
//   id: demoBranchId,
//   companyId: demoCompanyId,
//   name: "Main Showroom",
//   type: "showroom",
//   operationModel: "company-operated",
//   address: "456 Retail Street, Andheri",
//   city: "Mumbai",
//   state: "Maharashtra",
//   pinCode: "400058",
//   contactPhone: "022-12345678",
//   contactEmail: "showroom@demo.com",
//   createdAt: new Date(),
//   updatedAt: new Date(),
// })

// // Demo Department
// const demoDepartmentId = "demo-dept-001"
// departments.push({
//   id: demoDepartmentId,
//   companyId: demoCompanyId,
//   name: "Administration",
//   description: "Administrative department",
//   createdAt: new Date(),
// })

// Demo Designation
// const demoDesignationId = "demo-desig-001"
// designations.push({
//   id: demoDesignationId,
//   companyId: demoCompanyId,
//   departmentId: demoDepartmentId,
//   name: "Admin Manager",
//   level: 1,
//   createdAt: new Date(),
// })

// Demo Admin User
// const demoUserId = "demo-user-001"
// users.push({
//   id: demoUserId,
//   email: "admin@demo.com",
//   password: "admin123",
//   companyId: demoCompanyId,
//   role: "company_admin",
//   isActive: true,
//   createdAt: new Date(),
// })

// const superAdminId = "super-admin-001"
// users.push({
//   id: superAdminId,
//   email: "superadmin@system.com",
//   password: "super123",
//   companyId: "", // Super admin not tied to specific company
//   role: "super_admin",
//   isActive: true,
//   createdAt: new Date(),
// })

// Demo Employee
// employees.push({
//   id: demoUserId,
//   employeeNo: "EMP001",
//   companyId: demoCompanyId,
//   departmentId: demoDepartmentId,
//   designationId: demoDesignationId,
//   name: "Admin User",
//   gender: "male",
//   permanentAddress1: "123 Home Street",
//   permanentAddress2: "Near Park",
//   permanentAddress3: "",
//   permanentCity: "Mumbai",
//   permanentPhone: "022-11111111",
//   localAddress1: "123 Home Street",
//   localAddress2: "Near Park",
//   localAddress3: "",
//   localCity: "Mumbai",
//   localPhone: "022-11111111",
//   mobile: "9876543210",
//   email: "admin@demo.com",
//   emergencyContactNo: "9876543211",
//   emergencyContactPerson: "Emergency Contact",
//   reference1: "9876543212",
//   reference2: "9876543213",
//   panNo: "ABCDE1234F",
//   uidNo: "123456789012",
//   weeklyOff: "sunday",
//   inTime: "09:00",
//   outTime: "18:00",
//   graceMinutes: 15,
//   pfNo: "PF123456",
//   esiNo: "ESI123456",
//   basicSalary: 30000,
//   spa: 5000,
//   hra: 10000,
//   conveyance: 2000,
//   medical: 1500,
//   machineNo: "",
//   birthDate: new Date("1990-01-01"),
//   joiningDate: new Date(),
//   bankName: "HDFC Bank",
//   bankBranch: "MG Road",
//   accountNo: "50200012345678",
//   ifscCode: "HDFC0001234",
//   userId: demoUserId,
//   marketCategory: "",
//   callSlab: "",
//   documents: [],
//   photoUrl: "",
//   isActive: true,
//   createdAt: new Date(),
//   updatedAt: new Date(),
// })

// Helper functions
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function findCompanyById(id: string): Company | undefined {
  return companies.find((c) => c.id === id)
}

export function findBranchesByCompany(companyId: string): Branch[] {
  return branches.filter((b) => b.companyId === companyId)
}

export function findDepartmentsByCompany(companyId: string): Department[] {
  return departments.filter((d) => d.companyId === companyId)
}

export function findDesignationsByDepartment(departmentId: string): Designation[] {
  return designations.filter((d) => d.departmentId === departmentId)
}

export function findEmployeesByCompany(companyId: string): Employee[] {
  return employees.filter((e) => e.companyId === companyId)
}

export function findEmployeeById(id: string): Employee | undefined {
  return employees.find((e) => e.id === id)
}

export function findTechniciansByCompany(companyId: string): Technician[] {
  return technicians.filter((t) => t.companyId === companyId)
}

export function authenticateUser(email: string, password: string, companyId: string): User | null {
  // Check for super admin first (no company required)
  const superAdmin = users.find(
    (u) => u.email === email && u.password === password && u.role === "super_admin" && u.isActive,
  )

  if (superAdmin) {
    return superAdmin
  }

  // Regular user authentication with company
  const user = users.find(
    (u) =>
      u.email === email &&
      u.password === password &&
      u.companyId === companyId &&
      u.isActive,
  )
  return user || null
}

// Inventory helper functions
export function findItemGroupsByCompany(companyId: string): ItemGroup[] {
  return itemGroups.filter((g) => g.companyId === companyId && g.isActive)
}

export function findBrandsByCompany(companyId: string): Brand[] {
  return brands.filter((b) => b.companyId === companyId && b.isActive)
}

export function findCategoriesByCompany(companyId: string): Category[] {
  return categories.filter((c) => c.companyId === companyId && c.isActive)
}

export function findItemMastersByCompany(companyId: string): ItemMaster[] {
  return itemMasters.filter((i) => i.companyId === companyId && i.isActive)
}

// RBAC helper functions
export function findRolesByCompany(companyId: string): Role[] {
  return roles.filter((r) => r.companyId === companyId || r.isSystemRole)
}

export function findUserRolesByUserId(userId: string): UserRole[] {
  return userRoles.filter((ur) => ur.userId === userId)
}

export function getUserPermissions(userId: string): Permission[] {
  const userRolesList = findUserRolesByUserId(userId)
  const roleIds = userRolesList.map((ur) => ur.roleId)
  const userRoleItems = roles.filter((r) => roleIds.includes(r.id))
  const permissionIds = new Set<string>()

  userRoleItems.forEach((role) => {
    role.permissions.forEach((permId) => permissionIds.add(permId))
  })

  return permissions.filter((p) => permissionIds.has(p.id))
}

export function hasPermission(userId: string, module: string, action: string): boolean {
  const userPermissions = getUserPermissions(userId)
  return userPermissions.some((p) => p.module === module && p.action === action)
}

// Initialize system permissions
const permissionModules = [
  { module: "companies",          label: "Companies" },
  { module: "branches",           label: "Branches" },
  { module: "employees",          label: "Employees" },
  { module: "technicians",        label: "Technicians" },
  { module: "departments",        label: "Departments" },
  { module: "designations",       label: "Designations" },
  { module: "inventory",          label: "Inventory" },
  { module: "item_groups",        label: "Item Groups" },
  { module: "items",              label: "Items" },
  { module: "brands",             label: "Brands" },
  { module: "categories",         label: "Categories" },
  { module: "item_master",        label: "Item Master" },
  // ── Account Masters (new) ──────────────────────────────
  { module: "suppliers",          label: "Suppliers" },
  { module: "purchase_orders",    label: "Purchase Orders" },
  { module: "purchase_invoices",  label: "Purchase Invoices" },
  // ── System ────────────────────────────────────────────
  { module: "reports",            label: "Reports" },
  { module: "analytics",          label: "Analytics" },
  { module: "settings",           label: "Settings" },
  { module: "rbac",               label: "RBAC" },
  { module: "users",              label: "Users" },
]

const permissionActions = [
  { action: "create",  label: "Create" },
  { action: "read",    label: "Read/View" },
  { action: "update",  label: "Update/Edit" },
  { action: "delete",  label: "Delete" },
  { action: "export",  label: "Export" },
  { action: "import",  label: "Import" },
  { action: "approve", label: "Approve" },
]

let initialized = false

export function initDemoData() {
  if (initialized) return
  initialized = true

  // ── Generate all permissions ─────────────────────────────
  permissionModules.forEach((pm) => {
    permissionActions.forEach((pa) => {
      permissions.push({
        id: `perm-${pm.module}-${pa.action}`,
        module: pm.module as any,
        action: pa.action as any,
        description: `${pa.label} ${pm.label}`,
      })
    })
  })

  // ── Super Admin: ALL permissions ─────────────────────────
  const superAdminPermissions = permissions.map((p) => p.id)

  roles.push({
    id: "role-super-admin",
    companyId: "",
    name: "Super Admin",
    description: "Full system access with all permissions",
    isSystemRole: true,
    permissions: superAdminPermissions,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // ── Company Admin: everything EXCEPT company create/delete ──
  const companyAdminPermissions = permissions
    .filter((p) => !(p.module === "companies" && ["create", "delete"].includes(p.action)))
    .map((p) => p.id)

  roles.push({
    id: "role-company-admin",
    companyId: "",
    name: "Company Admin",
    description: "Full company access excluding company management",
    isSystemRole: true,
    permissions: companyAdminPermissions,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // ── Manager: read/create/update on operational modules ───
  const managerModules = [
    "employees",
    "technicians",
    "inventory",
    "item_groups",
    "items",
    "brands",
    "categories",
    "item_master",
    "suppliers",
    "purchase_orders",
    "purchase_invoices",
    "reports",
  ]
  const managerReadOnlyModules = ["departments", "designations"]

  const managerPermissions = permissions
    .filter(
      (p) =>
        (managerModules.includes(p.module) && ["read", "create", "update"].includes(p.action)) ||
        (managerReadOnlyModules.includes(p.module) && p.action === "read"),
    )
    .map((p) => p.id)

  roles.push({
    id: "role-manager",
    companyId: "",
    name: "Manager",
    description: "Manage employees, technicians, inventory, and procurement",
    isSystemRole: true,
    permissions: managerPermissions,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  // ── Employee: read-only on relevant modules ───────────────
  const employeeReadModules = [
    "employees",
    "inventory",
    "item_master",
    "suppliers",
    "purchase_orders",
    "purchase_invoices",
    "reports",
  ]

  const employeePermissions = permissions
    .filter((p) => employeeReadModules.includes(p.module) && p.action === "read")
    .map((p) => p.id)

  roles.push({
    id: "role-employee",
    companyId: "",
    name: "Employee",
    description: "Basic employee access with read-only permissions",
    isSystemRole: true,
    permissions: employeePermissions,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
}