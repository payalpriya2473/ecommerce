// Database schema types for the UC Enterprise Suite multi-tenant system

export type CompanyType = "company-operated" | "franchise"
export type MSMECategory = "micro" | "small" | "medium" | "not-applicable"
export type MSMEType = "manufacturing" | "service" | "both"

export interface BankAccount {
  id: string
  bankName: string
  bankBranch: string
  accountNumber: string
  ifscCode: string
  accountType: "current" | "savings"
  isPrimary: boolean
}

export interface Company {
  id: string
  name: string
  address: string
  city: string
  state: string
  pinCode: string
  gstNumber: string
  panNumber: string
  banks: BankAccount[]
  upiId?: string
  qrCodeData: string // Base64 encoded QR code
  udid?: string
  msmeRegistered: boolean
  msmeNumber?: string
  msmeCategory?: MSMECategory
  msmeType?: MSMEType
  tdsApplicable: boolean
  tanNumber?: string // Tax Deduction Account Number
  tdsRate?: number // Default TDS rate percentage
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Branch {
  id: string
  companyId: string
  type: "showroom" | "godown"
  operationModel: CompanyType
  name: string
  address: string
  city: string
  state: string
  pinCode: string
  gstNumber?: string
  panNumber?: string
  bankName?: string
  bankBranch?: string
  accountNumber?: string
  ifscCode?: string
  contactPhone: string
  contactEmail: string
  createdAt: Date
  updatedAt: Date
}

export interface Department {
  id: string
  companyId: string
  name: string
  description?: string
  createdAt: Date
}

export interface Designation {
  id: string
  companyId: string
  departmentId: string
  name: string
  level: number // For hierarchy
  reportsTo?: string // Designation ID
  createdAt: Date
}

export interface Employee {
  id: string
  companyId: string
  departmentId: string
  designationId: string
  employeeNo: string
  name: string
  gender: "male" | "female"

  // Permanent Address
  permanentAddress1: string
  permanentAddress2: string
  permanentAddress3: string
  permanentCity: string
  permanentPhone: string

  // Local Address
  localAddress1: string
  localAddress2: string
  localAddress3: string
  localCity: string
  localPhone: string

  // Contact Details
  mobile: string
  email: string

  // Emergency Contact
  emergencyContactNo: string
  emergencyContactPerson: string
  reference1: string
  reference2: string

  // Identity
  panNo: string
  uidNo: string // Aadhaar

  // Work Schedule
  weeklyOff: string
  inTime: string
  outTime: string
  graceMinutes: number

  // Employee IDs
  pfNo: string
  esiNo: string

  // Dates
  birthDate: Date
  joiningDate: Date
  resignDate?: Date

  // Salary Components
  basicSalary: number
  spa: number // Special Allowance
  hra: number // House Rent Allowance
  conveyance: number
  medical: number
  machineNo?: string

  // Bank Details
  bankName: string
  bankBranch: string
  accountNo: string
  ifscCode: string

  // User Access
  userId?: string
  marketCategory?: string
  callSlab?: string

  // Documents
  documents: EmployeeDocument[]

  // Photo
  photoUrl?: string

  isActive: boolean

  createdAt: Date
  updatedAt: Date
}

export interface EmployeeDocument {
  id: string
  employeeId: string
  documentName: string
  documentType: string
  fileUrl: string
  uploadedAt: Date
}

export interface Technician {
  id: string
  companyId: string
  technicianNo: string
  name: string
  gender: "male" | "female"

  // Contact Details
  mobile: string
  email: string
  address1: string
  address2: string
  address3: string
  city: string
  state: string
  pinCode: string

  // Identity
  panNo: string
  uidNo: string // Aadhaar

  // Technician Specific
  specialization: string // AC, Refrigerator, Washing Machine, etc.
  experience: number // Years of experience
  certifications: string[] // List of certifications
  serviceAreas: string[] // Areas they can service
  vehicleNumber?: string
  drivingLicense?: string

  // Work Details
  joiningDate: Date
  resignDate?: Date
  isActive: boolean

  // Salary/Payment
  salaryType: "fixed" | "commission" | "both"
  fixedSalary?: number
  commissionRate?: number

  // Bank Details
  bankName: string
  bankBranch: string
  accountNo: string
  ifscCode: string

  // Documents
  documents: TechnicianDocument[]
  photoUrl?: string

  createdAt: Date
  updatedAt: Date
}

export interface TechnicianDocument {
  id: string
  technicianId: string
  documentName: string
  documentType: string
  fileUrl: string
  uploadedAt: Date
}

export interface User {
  id: string
  email: string
  password: string // Hashed
  companyId: string
  employeeId?: string
  role: "super_admin" | "company_admin" | "manager" | "employee"
  isActive: boolean
  createdAt: Date
}

// Inventory Management Types
export interface ItemGroup {
  id: string
  companyId: string
  name: string
  categoryId: string
  combineGroup?: string
  hsnCode?: string
  gst: number
  hasDemoInstallation: boolean
  buyBackValue?: number
  maxQty: number
  isActive: boolean
  createdAt: Date
}

export interface Brand {
  id: string
  companyId: string
  name: string
  isActive: boolean
  createdAt: Date
}

export interface Category {
  id: string
  companyId: string
  name: string
  marginPercent: number
  isActive: boolean
  createdAt: Date
}

export interface ItemMaster {
  id: string
  companyId: string
  itemName: string
  variant?: string
  color?: string
  itemGroupId: string
  brandId: string
  uom: string // Unit of Measurement
  hsnCode?: string
  gst: number
  openingStock: number
  tax: number
  minimumQty: number
  maxMOPPercent: number
  offerPrice: number
  stockValue: number
  margin: number
  incentive: number
  maxMOPAmount: number
  nlc: number
  hasDemoInstallation: boolean
  description?: string
  freeService?: string
  billPrintNote?: string
  warranty?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// RBAC Types
export type PermissionAction = "create" | "read" | "update" | "delete" | "export" | "import" | "approve"

export type PermissionModule =
  | "companies"
  | "branches"
  | "employees"
  | "technicians"
  | "departments"
  | "designations"
  | "inventory"
  | "item_groups"
  | "items"
  | "brands"
  | "categories"
  | "item_master"
  | "suppliers"           
  | "purchase_orders"     
  | "purchase_invoices"   
  | "reports"
  | "analytics"
  | "settings"
  | "rbac"
  | "users"

export interface Permission {
  id: string
  module: PermissionModule
  action: PermissionAction
  description: string
}

export interface Role {
  id: string
  companyId: string 
  name: string
  description?: string
  isSystemRole: boolean 
  permissions: string[] 
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface UserRole {
  id: string
  userId: string
  roleId: string
  assignedBy: string
  assignedAt: Date
}
