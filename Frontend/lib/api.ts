// export const API_BASE_URL = 'https://uniqueconsultancy.in/motabhai_next_backend/api';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

const AUTH_ERROR_MESSAGES = [
  'invalid or expired token',
  'access token is required',
  'no token provided',
  'invalid token',
  'user not authenticated',
];

function shouldNotifyAuthExpired(status: number, payload: any) {
  const message = String(payload?.message || '').trim().toLowerCase();
  return status === 401 || (status === 403 && AUTH_ERROR_MESSAGES.some((text) => message.includes(text)));
}

function notifyAuthExpired(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('auth:expired', {
      detail: { message: message || 'Your session has expired. Please log in again.' },
    }),
  );
}

async function parseApiResponse(response: Response, options?: { suppressAuthEvent?: boolean }) {
  let payload: any = null;

  try {
    payload = await response.json();
  } catch {
    payload = {
      success: response.ok,
      message: response.statusText || 'Request failed',
    };
  }

  if (!options?.suppressAuthEvent && shouldNotifyAuthExpired(response.status, payload)) {
    notifyAuthExpired(payload?.message || 'Your session has expired. Please log in again.');
  }

  return payload;
}

/** Shared options for server-side paginated list endpoints. */
export interface ListQueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
}

/** Append pagination/search/sort query params (only when present). */
function appendListQuery(params: URLSearchParams, options?: ListQueryOptions) {
  if (!options) return;
  if (options.page)          params.append('page', String(options.page));
  if (options.limit)         params.append('limit', String(options.limit));
  if (options.search)        params.append('search', options.search);
  if (options.sortKey)       params.append('sortKey', options.sortKey);
  if (options.sortDirection) params.append('sortDirection', options.sortDirection);
}

export interface LoginRequest {
  email: string;
  password: string;
  companyId?: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    user: {
      id: string;
      email: string;
      role: string;
      companyId: string | null;
    };
    token: string;
  };
}

export interface Company {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  gstNumber: string;
  panNumber: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  bankBranch: string;
  upiId: string;
  qrCodeData: string;
  logoUrl?: string;    
  isActive: boolean;
  udid?: string;
  msmeRegistered?: boolean;
  msmeNumber?: string;
  msmeCategory?: string;
  msmeType?: string;
  tdsApplicable?: boolean;
  tanNumber?: string;
  tdsRate?: number;
  dispatchName?: string;
  dispatchContactPerson?: string;
  dispatchContactNumber?: string;
  php_company_code?: string | null;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  type: 'showroom' | 'godown' | 'warehouse' | 'office' | 'service_center';
  operationModel: 'company-operated' | 'franchise';
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  gstNumber?: string;
  panNumber?: string;
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  ifscCode?: string;
  contactPhone?: string;
  contactEmail?: string;
  companyName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  companyName?: string;
  createdAt?: string;
}

export interface Designation {
  id: string;
  companyId: string;
  departmentId: string;
  name: string;
  level: number;
  reportsToDesignationId?: string;
  reportsToName?: string;
  departmentName?: string;
  companyName?: string;
  roleIds?: string[] | string; // API may return JSON string or array
  roleNames?: string | Record<string, string> | string[];
  roles?: Array<{    //  Populated role objects
    id: string;
    name: string;
    description?: string;
  }>;
  createdAt?: string;
}

export interface Employee {
  id: string;
  employeeNo: string;
  companyId: string;
  departmentId: string | null;
  designationId: string | null;
  name: string;
  gender: "male" | "female" | "other";
  mobile: string;
  email?: string;
  isActive: boolean;
  photoUrl?: string;

  // NEW: Role information from designation
  userId?: string;
  userEmail?: string;
  departmentName?: string;
  designationName?: string;
  designationRoleIds?: string;
  userRoleIds?: string;
  roleNames?: string; // Comma-separated role names

  // Optional fields
  joiningDate?: string;
  panNo?: string;
  uidNo?: string;
  weeklyOff?: string;
  inTime?: string;
  outTime?: string;
  graceMinutes?: number;

  basicSalary?: number;
  spa?: number;
  hra?: number;
  conveyance?: number;
  medical?: number;

  bankName?: string;
  bankBranch?: string;
  accountNo?: string;
  ifscCode?: string;

  pfNo?: string;
  esiNo?: string;

  createdAt?: string;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  description: string;
}

export interface Role {
  id: string;
  companyId: string | null;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  permissionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleWithPermissions extends Role {
  permissions: string[];
  permissionDetails: Permission[];
}

export interface UserRole {
  id: string;
  userId: string;
  roleId: string;
  assignedBy: string | null;
  assignedAt: string;
  roleName?: string;
  roleDescription?: string;
  assignedByEmail?: string;
}

export interface UserWithRoles {
  id: string;
  email: string;
  companyId: string | null;
  legacyRole: string;
  isActive: boolean;
  employeeName: string | null;
  employeeNo: string | null;
  roleNames: string | null;
  roleIds: string | null;
}
// Supplier Interfaces
export interface ContactPerson {
  id?: string;
  name: string;
  mobile: string;
  alternateMobile?: string;
  email?: string;
}

export interface BankAccount {
  id?: string;
  bankName: string;
  bankBranch: string;
  accountNumber: string;
  ifscCode: string;
  accountHolderName: string;
}

export interface Supplier {
  id: string;
  name: string;
  group?: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  country: string;
  state: string;
  city: string;
  pinCode: string;
  creditLimit: number;
  creditDays: number;
  graceDays: number;
  balanceAmount: number;
  balanceType: 'credit' | 'debit';
  panNumber?: string;
  gstNumber?: string;
  tdsApplicable: boolean;
  tcsApplicable: boolean;
  msmeRegistered: boolean;
  msmeNumber?: string;
  msmeCategory?: string;
  msmeType?: string;
  isActive: boolean;
  contactPersons: ContactPerson[];
  bankAccounts: BankAccount[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  companyId: string;
  name: string;
  marginPercent: number;

  // new fields
  slug?: string;
  description?: string;
  categoryImage?: string;      
  category_image?: string;
  categoryIconUrl?: string;
  categoryIcon?: string;
  displayOrder?: number;       
  display_order?: number;
  showOnWebsite?: boolean;     
  show_on_website?: boolean | number | string;
  metaTitle?: string;          
  meta_title?: string;
  metaDescription?: string;    
  meta_description?: string;
  seoHeading?: string;         
  seo_heading?: string;
  parentCategoryId?: string;   
  parent_category_id?: string;

  companyName?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Brand {
  id: string;
  companyId: string;
  name: string;
  iconUrl?: string; 
  isActive: boolean;
  companyName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ItemGroup {
  id: string;
  companyId: string;
  categoryId?: string;
  name: string;
  combineGroup?: string;
  hsnCode?: string;
  gst: number;
  hasDemoInstallation: boolean;
  buyBackValue?: number;
  maxQty: number;
  isActive: boolean;
  categoryName?: string;
  companyName?: string;
  createdAt?: string;
  updatedAt?: string;
} 

export interface ItemVariant {
 
  id: string;               
  itemId?: string;          
  variant?: string | null;  
  openingStock: number;
  minimumQty: number;
  maxMOPPercent: number;
  offerPrice: number;
  stockValue: number;
  margin: number;
  incentive: number;
  maxMOPAmount: number;
  nlc: number;
  sortOrder: number;        
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Item {
  id: string;
  companyId: string;
  itemGroupId?: string;
  brandId?: string;
  itemName: string;
  uom: string;
  hsnCode?: string;
  gst: number;
  hasDemoInstallation: boolean;
  description?: string;
  freeService?: string;
  billPrintNote?: string;
  warranty?: string;
  isActive: boolean;
 
  // ── Variant columns (flattened onto this row) ──
  variant?: string | null;
  openingStock?: number;
  minimumQty?: number;
  maxMOPPercent?: number;
  offerPrice?: number;
  stockValue?: number;
  margin?: number;
  incentive?: number;
  maxMOPAmount?: number;
  nlc?: number;
  sortOrder?: number;
 
  // ── Joined fields ──
  itemGroupName?: string;
  brandName?: string;
  categoryName?: string;
  companyName?: string;
 
  // ── Relations (same shape as before) ──
  variants?: ItemVariant[];      // sibling rows returned by API
  variantCount?: number;
  primaryImage?: ItemImage | null;
  images?: ItemImage[];
  createdAt?: string;
  updatedAt?: string;
}
 
export interface ItemImage {
  id: string;
  itemId: string;
  imageUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sortOrder: number;
}
 export interface ItemVariantRow {
 
  id?: string;
 
  variant: string;
  openingStock: string;
  minimumQty: string;
  maxMOPPercent: string;
  offerPrice: string;
  stockValue: string;
  margin: string;
  incentive: string;
  maxMOPAmount: string;
  nlc: string;
}

export interface PurchaseOrderItem {
  id?: string;
  itemId?: string;
  brandId?: string;
  brandName?: string;
  itemName?: string;
  remarks?: string;
  gstRate?: number;
  gstPercent?: number;
  gst?: number;
  qty: number;
  rate: number;
  amount: number;
  marginPercent?: number;
  incPercent?: number;
  sgstPercent?: number;
  sgstAmount?: number;
  cgstPercent?: number;
  cgstAmount?: number;
  igstPercent?: number;
  igstAmount?: number;
}

export interface PurchaseOrder {
  id: string;
  companyId: string;
  poNumber: string;
  supplierId: string;
  supplierName?: string;
  supplierCity?: string;
  poDate: string;
  paymentTerms?: string;
  deliverySchedule?: string;
  transportation?: string;
  remarks?: string;
  discountPercent: number;
  discountAmount: number;
  totalAmount: number;
  sgst: number;
  cgst: number;
  igst: number;
  otherCharges: number;
  netAmount: number;
  itemCount?: number;
  items?: PurchaseOrderItem[];
  createdAt?: string;
}

export interface Technician {
  id: string;
  userId?: string;
  technicianNo: string;
  companyId: string;
  name: string;
  gender?: string;
  mobile: string;
  email?: string;

  address1?: string;
  address2?: string;
  address3?: string;
  city?: string;
  state?: string;
  pinCode?: string;

  gstNumber?: string;
  panNo?: string;
  uidNo?: string;
  vehicleNumber?: string;
  drivingLicense?: string;

  specialization: string;
  experience?: number;
  certifications?: string[];
  serviceAreas?: string[];

  joiningDate?: string;
  resignDate?: string;

  salaryType?: "fixed" | "commission" | "both";
  fixedSalary?: number;
  commissionRate?: number;

  bankName?: string;
  bankBranch?: string;
  accountNo?: string;
  ifscCode?: string;

  bankAccounts?: Array<{
    id: string;
    bankName: string;
    bankBranch: string;
    accountNo: string;
    ifscCode: string;
    accountHolderName: string;
    accountType: string;
    isPrimary: boolean;
  }>;
  documents?: Array<{
    id: string;
    documentType: string;
    documentName: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
  }>;

  photoUrl?: string;
  isActive: boolean;

  userEmail?: string;
  companyName?: string;
  createdAt?: string;
  updatedAt?: string;
}



export interface PurchaseInvoiceSerial {
  id?: string;
  srNo: string;
  color?: string;
}

export interface PurchaseInvoiceItem {
  id?: string;
  purchaseOrderId?: string | null;
  poNumber?: string | null;
  itemId?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  itemName: string;

  remarks?: string | null;

  qty: number;
  rate: number;
  discountRs?: number;
  amount: number;
  poRate?: number;
  aTaxPercent?: number;

  sgstPercent?: number;
  sgstAmount?: number;
  cgstPercent?: number;
  cgstAmount?: number;
  igstPercent?: number;
  igstAmount?: number;
  serialRows?: {
    color?: string | null;
    srNo: string;
  }[];
}

export interface PurchaseInvoice {
  id: string;
  companyId: string;
  billNumber?: string;
  billDate: string;
  supplierId: string;
  supplierName?: string;
  supplierCity?: string;
  supplierGST?: string;
  supplierState?: string;
  purchaseOrderId?: string;
  branchId?: string;
  transporterId?: string;
  lrNumber?: string;
  lrDate?: string;
  remarks?: string;
  discountPercent: number;
  discountAmount: number;
  freightAmount: number;
  tcsPercent: number;
  tcsAmount: number;
  otherAmount: number;
  totalAmount: number;
  sgst: number;
  cgst: number;
  igst: number;
  rcmSgst: number;
  rcmCgst: number;
  rcmIgst: number;
  debitNoteAmount: number;
  netAmount: number;
  itemCount?: number;
  items?: PurchaseInvoiceItem[];
  createdAt?: string;
}
 
export interface IncentiveLog {
  id: string;
  companyId?: string;
  itemId: string;
  itemName?: string;
  brandId?: string;
  brandName?: string;
  itemGroupId?: string;
  itemGroupName?: string;
  effectiveDate: string;
 
  oldNlc: number;
  oldIncentive: number;
  oldMargin: number;
  oldOfferPrice: number;
 
  newNlc: number;
  newIncentive: number;
  newMargin: number;
  newOfferPrice: number;
 
  remarks?: string;
  editedBy?: string;
  editedByEmail?: string;
 
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
 
export interface ItemDefaults {
  itemId: string;
  itemName: string;
  brandId?: string;
  brandName?: string;
  itemGroupId?: string;
  itemGroupName?: string;
  nlc: number;
  incentive: number;
  margin: number;
  offerPrice: number;
  companyId?: string;
}
export interface Color {
  id: string;
  companyId?: string;
  brandId: string;
  colorName: string;
  isActive: boolean;
  brandName?: string;
  createdAt?: string;
  updatedAt?: string;
}


export interface FinanceCompany {
  id: string;
  companyId?: string;
  name: string;
  address?: string;
  city?: string;
  pinCode?: string;
  contactPersonName?: string;
  mobile?: string;
  email?: string;
  panNumber?: string;
  gstNumber?: string;
  isActive: boolean;
  companyName?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface SalesInvoiceSerialRow {
  id?: string;
  color?: string | null;
  srNo: string;
}
 
export interface SalesInvoiceItemPayload {
  id?: string;
  itemId?: string | null;
  brandId?: string | null;
  itemName: string;
  brandName?: string | null;
  remarks?: string | null;
  qty: number;
  rate: number;
  amount: number;
  scheme?: number;
  discountPercent?: number;
  discountRs?: number;
  gstPercent?: number;
  incPercent?: number;
  sgstPercent?: number;
  sgstAmount?: number;
  cgstPercent?: number;
  cgstAmount?: number;
  igstPercent?: number;
  igstAmount?: number;
  incentive?: number;
  buyBack?: number;
  installation?: number;
  bookingAmount?: number;
  demo?: boolean | number;
  selfDelivery?: boolean;
  serialRows?: SalesInvoiceSerialRow[];
}
 
export interface SalesInvoiceInstallment {
  id?: string;
  instAmt: number;
  noOfInst: number;
  totalAmt: number;
  stDate?: string;
  days?: number;
}
 
export interface SalesInvoice {
  id?: string;
  companyId: string;
  branchId?: string | null;
  billNumber: string;
  billDate: string;
 
  // Party
  customerId?: string | null;
  partyName: string;
  address?: string | null;
  partyCityVillage?: string | null;
  mobileNo?: string | null;
  adharNo?: string | null;
  otpVerified?: boolean;
 
  // References
  reference1?: string | null;
  reference1Address?: string | null;
  reference1City?: string | null;
  reference1Mobile?: string | null;
  reference2?: string | null;
  reference2Address?: string | null;
  reference2City?: string | null;
  reference2Mobile?: string | null;
 
  // Financials
  discountPercent?: number;
  discountAmount?: number;
  freightAmount?: number;
  scheme?: number;
  otherCharges?: number;
  processingFees1?: number;
  processingFees2?: number;
  installationAmt?: number;
  totalAmount?: number;
  sgst?: number;
  cgst?: number;
  igst?: number;
  netAmount?: number;
 
  // Payment
  mop?: string | null;
  booking?: number;
  buyBack?: number;
  margin?: number;
  cashMargin?: number;
  onlineMargin?: number;
  balance?: number;
  cashbookId?: string | null;
  bankBookId?: string | null;
  utrNumber?: string | null;
  paymentAtDelivery?: boolean;
 
  // Finance companies
  fAmt1?: number;
  fComp1?: string | null;
  dbd1?: number;
  fileNo1?: string | null;
  fAmt2?: number;
  fComp2?: string | null;
  dbd2?: number;
  fileNo2?: string | null;
 
  // Salesman / Remarks
  salesmanId?: string | null;
  remarks?: string | null;
 
  // Relations (returned by GET)
  branchName?: string;
  itemCount?: number;
  items?: SalesInvoiceItemPayload[];
  installments?: SalesInvoiceInstallment[];
  createdAt?: string;
  updatedAt?: string;
}
 
export interface SerialLookupResult {
  id: number;
  serialNo: string;
  color: string | null;
  status: 'in_stock' | 'sold' | 'returned' | 'damaged' | 'transferred';
  purchaseParty: string | null;
  purchaseBillNo: string | null;
  purchaseDate: string | null;
  purchaseRate: number | null;
  branchName: string | null;
  // Item / brand info joined from purchase_invoice_items + items + brands
  itemId: number | null;
  brandId: number | null;
  itemName: string | null;
  brandName: string | null;
  gstPercent: number;
  hsnCode: string | null;
  uom: string | null;
  qty: number;
  rate: number;
}

export interface PartyLookupResult {
  customerId?: string | number | null;
  partyName?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  partyCityVillage?: string | null;
  mobileNo?: string | null;
  mobile?: string | null;
  adharNo?: string | null;
}

export const authAPI = {
  // Login
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return parseApiResponse(response, { suppressAuthEvent: true });
  },

  // Get companies
  getCompanies: async (): Promise<Company[]> => {
    const response = await fetch(`${API_BASE_URL}/auth/companies`);
    const result = await response.json();
    return result.success ? result.data : [];
  },

  // Verify token
  verifyToken: async (token: string): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return parseApiResponse(response, { suppressAuthEvent: true });
  },

  // Logout
  logout: async (token: string): Promise<any> => {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return parseApiResponse(response, { suppressAuthEvent: true });
  },
};

// Company API
export const companyAPI = {
  // Get all companies (supports optional server-side pagination/search/sort)
  getAll: async (token: string, options?: ListQueryOptions) => {
    const params = new URLSearchParams();
    appendListQuery(params, options);
    const queryString = params.toString();
    const res = await fetch(`${API_BASE_URL}/companies${queryString ? `?${queryString}` : ''}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },
 
  // Get company by ID
  getById: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/companies/${companyId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },
 
  // Register new company — accepts FormData (with optional logo) or plain object
  register: async (data: FormData | Record<string, any>, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/companies/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // Do NOT set Content-Type for FormData — browser sets it with boundary
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return res.json();
  },
 
  // Update company — accepts FormData (with optional logo) or plain object
  update: async (companyId: string, data: FormData | Partial<Company>, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/companies/${companyId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return res.json();
  },
 
  // Toggle company status
  toggleStatus: async (companyId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/companies/${companyId}/toggle-status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },
 
  // Delete company
  delete: async (companyId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/companies/${companyId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },
};

// Branch API
export const branchAPI = {
  // Get all branches (with optional company filter + server-side pagination/search/sort)
  getAll: async (token: string, companyId?: string, options?: ListQueryOptions) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    appendListQuery(params, options);
    const queryString = params.toString();
    const url = `${API_BASE_URL}/branches${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },

  // Get branch by ID
  getById: async (token: string, branchId: string) => {
    const res = await fetch(`${API_BASE_URL}/branches/${branchId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },

  // Register a new branch
  register: async (data: Partial<Branch>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/branches/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Update branch
  update: async (branchId: string, data: Partial<Branch>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/branches/${branchId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Delete branch
  delete: async (branchId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/branches/${branchId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },

  // Get branches by company
  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/branches/company/${companyId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },
};

// Department API
export const departmentAPI = {
  // Get all departments (optional company filter + optional server-side pagination)
  getAll: async (token: string, companyId?: string, options?: ListQueryOptions) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    appendListQuery(params, options);

    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/departments?${qs}` : `${API_BASE_URL}/departments`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return res.json();
  },

  // Get department by ID
  getById: async (token: string, departmentId: string) => {
    const res = await fetch(`${API_BASE_URL}/departments/${departmentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return res.json();
  },

  // Register department
  register: async (
    data: Partial<Department>,
    token: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/departments/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    return res.json();
  },

  // Update department
  update: async (
    departmentId: string,
    data: Partial<Department>,
    token: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/departments/${departmentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    return res.json();
  },

  // Delete department
  delete: async (departmentId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/departments/${departmentId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return res.json();
  },
};

// Designation API
export const designationAPI = {
  // Get all designations with proper query params and roles (+ optional server-side pagination)
  getAll: async (
    token: string,
    companyId?: string,
    departmentId?: string,
    options?: ListQueryOptions
  ) => {
    const params = new URLSearchParams();
    if (companyId) params.append("companyId", companyId);
    if (departmentId) params.append("departmentId", departmentId);
    appendListQuery(params, options);

    const queryString = params.toString();
    const url = queryString
      ? `${API_BASE_URL}/designations?${queryString}`
      : `${API_BASE_URL}/designations`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Get single designation by ID with roles
  getById: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/designations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Register designation with roles
  register: async (
    data: Partial<Designation> & { roleIds?: string[] },
    token: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/designations/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Update designation with roles
  update: async (
    id: string,
    data: Partial<Designation> & { roleIds?: string[] },
    token: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/designations/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Delete designation
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/designations/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// Employee API
export const employeeAPI = {
  // Get all employees (supports optional company filter + server-side pagination/search/sort)
  getAll: async (
    token: string,
    options?: ListQueryOptions & { companyId?: string; departmentId?: string; status?: string },
  ) => {
    const params = new URLSearchParams();
    if (options?.companyId) params.append('companyId', options.companyId);
    if (options?.departmentId) params.append('departmentId', options.departmentId);
    if (options?.status) params.append('status', options.status);
    appendListQuery(params, options);
    const queryString = params.toString();
    const res = await fetch(`${API_BASE_URL}/employees${queryString ? `?${queryString}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Get employees by company
  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/employees/company/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Get employee by ID
  getById: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/employees/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Register employee (WITH PHOTO)
  register: async (formData: FormData, token: string) => {
    const res = await fetch(`${API_BASE_URL}/employees/register`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // NOTE: Do NOT set Content-Type when sending FormData
        // The browser will set it automatically with the correct boundary
      },
      body: formData,
    });
    return res.json();
  },

  // Update employee
  update: async (id: string, formData: FormData, token: string) => {
    const res = await fetch(`${API_BASE_URL}/employees/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    return res.json();
  },

  // Delete (soft)
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/employees/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  //  NEW: Update user password
  updatePassword: async (email: string, newPassword: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/employees/user/update-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email, newPassword }),
    });
    return res.json();
  },
};



// ============= RBAC API =============
export const rbacAPI = {
  // ========== PERMISSIONS ==========
  
  /**
   * Get all permissions
   */
  getAllPermissions: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/rbac/permissions`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  /**
   * Get current logged-in user's permissions
   */
  getCurrentUserPermissions: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/rbac/permissions/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  // ========== ROLES ==========
  
  /**
   * Get all roles (with optional company filter)
   */
  getAllRoles: async (token: string, companyId?: string) => {
    const url = companyId
      ? `${API_BASE_URL}/rbac/roles?companyId=${companyId}`
      : `${API_BASE_URL}/rbac/roles`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  /**
   * Get role by ID with permissions
   */
  getRoleById: async (token: string, roleId: string) => {
    const res = await fetch(`${API_BASE_URL}/rbac/roles/${roleId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  /**
   * Create a new role
   */
  createRole: async (
    data: {
      name: string;
      description?: string;
      permissions: string[];
    },
    token: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/rbac/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  /**
   * Update a role
   */
  updateRole: async (
    roleId: string,
    data: {
      name: string;
      description?: string;
      permissions: string[];
    },
    token: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/rbac/roles/${roleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  /**
   * Delete a role
   */
  deleteRole: async (roleId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/rbac/roles/${roleId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  // ========== USER ROLES ==========
  
  /**
   * Get all users with their assigned roles
   */
  getUsersWithRoles: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/rbac/users-with-roles`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  /**
   * Get roles assigned to a specific user
   */
  getUserRoles: async (token: string, userId: string) => {
    const res = await fetch(`${API_BASE_URL}/rbac/users/${userId}/roles`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  /**
   * Assign roles to a user
   */
  assignUserRoles: async (
    userId: string,
    roleIds: string[],
    token: string
  ) => {
    const res = await fetch(`${API_BASE_URL}/rbac/users/${userId}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ roleIds }),
    });
    return res.json();
  },

  // ========== USER PERMISSIONS ==========
  
  /**
   * Get all permissions for a user (from all their roles)
   */
  getUserPermissions: async (token: string, userId: string) => {
    const res = await fetch(`${API_BASE_URL}/rbac/users/${userId}/permissions`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return res.json();
  },

  /**
   * Check if user has a specific permission
   */
  checkUserPermission: async (
    token: string,
    userId: string,
    module: string,
    action: string
  ) => {
    const res = await fetch(
      `${API_BASE_URL}/rbac/users/${userId}/permissions/${module}/${action}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return res.json();
  },
};

// Supplier API
export const supplierAPI = {
  // Get all suppliers (supports server-side pagination via options)
  getAll: async (
    token: string,
    options?: ListQueryOptions & { status?: string },
  ) => {
    const params = new URLSearchParams();
    appendListQuery(params, options);
    if (options?.status) params.append('status', options.status);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/suppliers?${qs}` : `${API_BASE_URL}/suppliers`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },

  // Get supplier by ID
  getById: async (token: string, supplierId: string) => {
    const res = await fetch(`${API_BASE_URL}/suppliers/${supplierId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },

  // Register new supplier
  register: async (data: Partial<Supplier>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/suppliers/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Update supplier
  update: async (supplierId: string, data: Partial<Supplier>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/suppliers/${supplierId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Toggle supplier status
  toggleStatus: async (supplierId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/suppliers/${supplierId}/toggle-status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },

  // Delete supplier (soft delete)
  delete: async (supplierId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/suppliers/${supplierId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },

  // Hard delete supplier (permanent)
  hardDelete: async (supplierId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/suppliers/${supplierId}/hard-delete`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.json();
  },
};

// Category API 
export const categoryAPI = {
  getAll: async (token: string, companyId?: string, options?: ListQueryOptions) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    appendListQuery(params, options);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/categories?${qs}` : `${API_BASE_URL}/categories`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/categories/company/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  register: async (data: Partial<Category> | FormData, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/categories/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  update: async (id: string, data: Partial<Category> | FormData, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },
};

// ─── Brand API ───────────────────────────────────────────────

export const brandAPI = {
  getAll: async (token: string, companyId?: string, options?: ListQueryOptions) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    appendListQuery(params, options);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/brands?${qs}` : `${API_BASE_URL}/brands`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/brands/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/brands/company/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

register: async (data: Partial<Brand> | FormData, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/brands/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  update: async (id: string, data: Partial<Brand> | FormData, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/brands/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return parseApiResponse(res);
  },


  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/brands/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },
};

// ─── Item Group API ──────────────────────────────────────────
export const itemGroupAPI = {
  getAll: async (
    token: string,
    companyId?: string,
    categoryId?: string,
    options?: ListQueryOptions,
  ) => {
    const params = new URLSearchParams();
    if (companyId)  params.append('companyId',  companyId);
    if (categoryId) params.append('categoryId', categoryId);
    appendListQuery(params, options);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/item-groups?${qs}` : `${API_BASE_URL}/item-groups`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/item-groups/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/item-groups/company/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  register: async (data: Partial<ItemGroup>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/item-groups/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  update: async (id: string, data: Partial<ItemGroup>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/item-groups/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/item-groups/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },
};

// ─── Item (Item Master) API ──────────────────────────────────

export const itemAPI = {
  getAll: async (
    token: string,
    companyId?: string,
    search?: string,
    filters?: {
      statuses?: Array<'active' | 'inactive'>;
      brandIds?: string[];
      itemGroupIds?: string[];
      categoryIds?: string[];
      stock?: Array<'inStock' | 'outOfStock'>;
    },
    pagination?: {
      page?: number;
      limit?: number;
      sortKey?: string;
      sortDirection?: 'asc' | 'desc';
    },
    stockSearch?: string,
  ) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (search)    params.append('search',    search);
    if (stockSearch) params.append('stockSearch', stockSearch);
    if (filters?.statuses?.length) {
      params.append('status', filters.statuses.join(','));
    }
    if (filters?.brandIds?.length) {
      params.append('brandIds', filters.brandIds.join(','));
    }
    if (filters?.itemGroupIds?.length) {
      params.append('itemGroupIds', filters.itemGroupIds.join(','));
    }
    if (filters?.categoryIds?.length) {
      params.append('categoryIds', filters.categoryIds.join(','));
    }
    if (filters?.stock?.length) {
      params.append('stock', filters.stock.join(','));
    }
    if (pagination?.page) {
      params.append('page', String(pagination.page));
    }
    if (pagination?.limit) {
      params.append('limit', String(pagination.limit));
    }
    if (pagination?.sortKey) {
      params.append('sortKey', pagination.sortKey);
    }
    if (pagination?.sortDirection) {
      params.append('sortDirection', pagination.sortDirection);
    }
    const qs  = params.toString();
    const url = qs ? `${API_BASE_URL}/items?${qs}` : `${API_BASE_URL}/items`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  // Lightweight full list (no variant/image enrichment, no pagination) — every
  // master item, active + inactive. Used by pickers like the Offers selector.
  getAllLite: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/items?lite=1&status=active,inactive`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/items/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/items/company/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  /**
   * Register item — accepts FormData (with optional itemImages files)
   * OR a plain object (legacy, no images).
   */
  register: async (data: FormData | Record<string, any>, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/items/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // Do NOT set Content-Type for FormData — browser sets it with boundary
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  /**
   * Update item — same as register: accepts FormData or plain object.
   */
  update: async (id: string, data: FormData | Record<string, any>, token: string) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(`${API_BASE_URL}/items/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: isFormData ? data : JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/items/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  // ── Image sub-resource ──────────────────────────────────────

  getImages: async (token: string, itemId: string) => {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/images`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  deleteImage: async (token: string, itemId: string, imageId: string) => {
    const res = await fetch(`${API_BASE_URL}/items/${itemId}/images/${imageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// ─── Offers API ──────────────────────────────────────────────
export type OfferSection =
  | 'flash_sale'
  | 'bank_offer'
  | 'brand_deal'
  | 'coupon'
  | 'combo'
  | 'clearance'
  | 'home_best'
  | 'exchange_offer';

export interface Offer {
  id: string;
  itemId: string;
  // joined from Item Master (read-only on the offer)
  itemName?: string;
  variant?: string;
  brandName?: string;
  itemGroupName?: string;
  primaryImage?: string | null;
  mrp?: number;
  section: OfferSection;
  title?: string;
  badge?: string;
  couponCode?: string;
  discountType?: 'percent' | 'amount';
  discountPercent?: number;
  discountAmount?: number;
  offerPrice?: number;
  soldPercent?: number;
  stockLeft?: number;
  priority?: number;
  isActive: boolean;
  startAt?: string | null;
  endAt?: string | null;
  createdAt?: string;
  // ── Bank offer fields (section = 'bank_offer') ──
  bankName?: string | null;
  bankAbbr?: string | null;
  offerText?: string | null;
  offerSub?: string | null;
  description?: string | null;
  tags?: string | null;
  colorTheme?: string | null;
  // ── Combo deal fields (section = 'combo') ──
  comboTitle?: string | null;
  comboItems?: Array<{ itemId: string | number; itemName?: string; price?: number }> | null;
  // ── Coupon fields (section = 'coupon') ──
  couponTitle?: string | null;
  categoryLabel?: string | null;
  minOrder?: number | null;
  maxOff?: number | null;
  validTill?: string | null;
  // ── Brand deal fields (section = 'brand_deal') ──
  brandId?: string | number | null;
  brandDealName?: string | null;
  discountLabel?: string | null;
  // Joined from Brands Master (read-only on the offer, resolved via brandId)
  brandMasterName?: string | null;
  brandLogo?: string | null;
  // ── Exchange offer fields (section = 'exchange_offer') ──
  exchangeTitle?: string | null;
  exchangePartnerName?: string | null;
  ctaText?: string | null;
  // ── Products this offer is assigned to ──
  productIds?: Array<string | number> | null;
}

export const offerAPI = {
  getAll: async (
    token: string,
    options?: ListQueryOptions & { section?: string; status?: string },
  ) => {
    const params = new URLSearchParams();
    if (options?.section) params.append('section', options.section);
    if (options?.status)  params.append('status', options.status);
    appendListQuery(params, options);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/offers?${qs}` : `${API_BASE_URL}/offers`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return parseApiResponse(res);
  },

  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/offers/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },

  register: async (data: Partial<Offer>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/offers/register`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  update: async (id: string, data: Partial<Offer>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/offers/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return parseApiResponse(res);
  },

  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/offers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseApiResponse(res);
  },
};



// Purchase Order API
export const PurchaseOrderAPI = {
  getNextNumber: async (token: string, companyId?: string) => {
  const url = companyId 
    ? `${API_BASE_URL}/purchase-orders/next-number?companyId=${companyId}`
    : `${API_BASE_URL}/purchase-orders/next-number`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
},
  getAll: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/purchase-orders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/purchase-orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  create: async (data: any, token: string) => {
    const payload = {
      ...data,
      purchaseOrderItems: Array.isArray(data?.purchaseOrderItems)
        ? data.purchaseOrderItems
        : data?.items,
    };
    const res = await fetch(`${API_BASE_URL}/purchase-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  update: async (id: string, data: any, token: string) => {
    const payload = {
      ...data,
      purchaseOrderItems: Array.isArray(data?.purchaseOrderItems)
        ? data.purchaseOrderItems
        : data?.items,
    };
    const res = await fetch(`${API_BASE_URL}/purchase-orders/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/purchase-orders/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  getPendingQtyByGroup: async (token: string, companyId?: string, excludePoId?: string) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (excludePoId) params.append('excludePoId', excludePoId);
    const qs = params.toString();
    const url = qs
      ? `${API_BASE_URL}/purchase-orders/pending-qty-by-group?${qs}`
      : `${API_BASE_URL}/purchase-orders/pending-qty-by-group`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// Backward-compatible alias used across pages
export const purchaseOrderAPI = PurchaseOrderAPI;


// ─── Technician API ─────────────────────────────────────────

export const technicianAPI = {
  /** Get all technicians (super_admin) — supports server-side pagination via options */
  getAll: async (
    token: string,
    options?: ListQueryOptions & { status?: string; companyId?: string },
  ) => {
    const params = new URLSearchParams();
    appendListQuery(params, options);
    if (options?.status) params.append('status', options.status);
    if (options?.companyId) params.append('companyId', options.companyId);
    const qs = params.toString();
    const url = qs ? `${API_BASE_URL}/technicians?${qs}` : `${API_BASE_URL}/technicians`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  /** Get technicians filtered by company */
  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(
      `${API_BASE_URL}/technicians/company/${companyId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.json();
  },

  /**
   * ✅ FIXED: was (id, token) but every caller passes (token, id).
   * Now consistent with companyAPI, employeeAPI pattern: (token, id)
   */
  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/technicians/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  /** Enroll (create) a technician – multipart FormData */
  register: async (formData: FormData, token: string) => {
    const res = await fetch(`${API_BASE_URL}/technicians/register`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },

  /** Update a technician – multipart FormData */
  update: async (id: string, formData: FormData, token: string) => {
    const res = await fetch(`${API_BASE_URL}/technicians/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },

  /** Soft-delete a technician */
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/technicians/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  /** Change login password for a technician */
  updatePassword: async (email: string, newPassword: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/technicians/user/update-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email, newPassword }),
    });
    return res.json();
  },
};


//purchase invoice API
let purchaseInvoicesInFlight:
  | Promise<any>
  | null = null;
let purchaseInvoicesInFlightToken: string | null = null;

export const purchaseInvoiceAPI = {
  getPOsBySupplier: async (token: string, supplierId: string, excludePiId?: string) => {
    const url = excludePiId
      ? `${API_BASE_URL}/purchase-invoices/pos-by-supplier/${supplierId}?excludePiId=${excludePiId}`
      : `${API_BASE_URL}/purchase-invoices/pos-by-supplier/${supplierId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
 
  getAll: async (token: string) => {
    if (purchaseInvoicesInFlight && purchaseInvoicesInFlightToken === token) {
      return purchaseInvoicesInFlight;
    }

    purchaseInvoicesInFlightToken = token;
    purchaseInvoicesInFlight = fetch(`${API_BASE_URL}/purchase-invoices`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .finally(() => {
        purchaseInvoicesInFlight = null;
        purchaseInvoicesInFlightToken = null;
      });

    return purchaseInvoicesInFlight;
  },
 
  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/purchase-invoices/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  // CREATE — plain JSON; invoice item images live in item master
  create: async (data: PurchaseInvoice, token: string) => {
    const res = await fetch(`${API_BASE_URL}/purchase-invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  // UPDATE — plain JSON; invoice item images live in item master
  update: async (id: string, data: PurchaseInvoice, token: string) => {
    const res = await fetch(`${API_BASE_URL}/purchase-invoices/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/purchase-invoices/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

//incentive API
export const incentiveLogAPI = {
  getAll: async (
    token: string,
    filters?: {
      companyId?: string;
      brandId?: string;
      itemGroupId?: string;
      itemId?: string;
      fromDate?: string;
      toDate?: string;
    },
    options?: ListQueryOptions
  ) => {
    const params = new URLSearchParams();
    if (filters?.companyId)   params.append('companyId',   filters.companyId);
    if (filters?.brandId)     params.append('brandId',     filters.brandId);
    if (filters?.itemGroupId) params.append('itemGroupId', filters.itemGroupId);
    if (filters?.itemId)      params.append('itemId',      filters.itemId);
    if (filters?.fromDate)    params.append('fromDate',    filters.fromDate);
    if (filters?.toDate)      params.append('toDate',      filters.toDate);
    appendListQuery(params, options);
    const qs  = params.toString();
    const url = qs ? `${API_BASE_URL}/incentive-logs?${qs}` : `${API_BASE_URL}/incentive-logs`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
 
  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/incentive-logs/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  getItemDefaults: async (token: string, itemId: string) => {
    const res = await fetch(`${API_BASE_URL}/incentive-logs/item-defaults/${itemId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  register: async (data: Partial<IncentiveLog>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/incentive-logs/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  update: async (id: string, data: Partial<IncentiveLog>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/incentive-logs/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/incentive-logs/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};


//color API
export const colorAPI = {
  getAll: async (token: string, companyId?: string, brandId?: string, options?: ListQueryOptions) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    if (brandId)   params.append('brandId',   brandId);
    appendListQuery(params, options);
    const qs  = params.toString();
    const url = qs ? `${API_BASE_URL}/colors?${qs}` : `${API_BASE_URL}/colors`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/colors/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  getByBrand: async (token: string, brandId: string) => {
    const res = await fetch(`${API_BASE_URL}/colors/brand/${brandId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  register: async (data: { brandId: string; colorName: string }, token: string) => {
    const res = await fetch(`${API_BASE_URL}/colors/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  update: async (id: string, data: { brandId: string; colorName: string }, token: string) => {
    const res = await fetch(`${API_BASE_URL}/colors/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/colors/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// ── Finance Company API ──────────────────────────────────────
 
export const financeCompanyAPI = {
  getAll: async (token: string, companyId?: string, options?: ListQueryOptions) => {
    const params = new URLSearchParams();
    if (companyId) params.append('companyId', companyId);
    appendListQuery(params, options);
    const qs  = params.toString();
    const url = qs ? `${API_BASE_URL}/finance-companies?${qs}` : `${API_BASE_URL}/finance-companies`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/finance-companies/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  getByCompany: async (token: string, companyId: string) => {
    const res = await fetch(`${API_BASE_URL}/finance-companies/company/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  register: async (data: Partial<FinanceCompany>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/finance-companies/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  update: async (id: string, data: Partial<FinanceCompany>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/finance-companies/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/finance-companies/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

// ─── Sales Invoice API ────────────────────────────────────────

 
export const salesInvoiceAPI = {
 
 
  getNextNumber: async (token: string): Promise<{ success: boolean; billNumber: string }> => {
    const res = await fetch(`${API_BASE_URL}/sales-invoices/next-number`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData?.message || "Failed to fetch next sales invoice number");
    }
    return res.json();
  },
 
  lookupPartyByMobile: async (
    token: string,
    mobileNo: string
  ): Promise<{ success: boolean; found?: boolean; message?: string; data?: PartyLookupResult | null }> => {
    const res = await fetch(
      `${API_BASE_URL}/sales-invoices/lookup-party/${encodeURIComponent(mobileNo)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.json();
  },
 
  lookupSerial: async (
    token: string,
    serialNo: string
  ): Promise<{ success: boolean; message?: string; data?: SerialLookupResult }> => {
    const res = await fetch(
      `${API_BASE_URL}/sales-invoices/lookup-serial/${encodeURIComponent(serialNo)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.json();
  },
 
  getAll: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/sales-invoices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  getById: async (token: string, id: string) => {
    const res = await fetch(`${API_BASE_URL}/sales-invoices/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  create: async (data: Omit<SalesInvoice, 'id'>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/sales-invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  update: async (id: string, data: Partial<SalesInvoice>, token: string) => {
    const res = await fetch(`${API_BASE_URL}/sales-invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    return res.json();
  },
 
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/sales-invoices/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};





export interface ItemVariantColorImage {
  id: string;
  variantId: string;
  colorId?: string | null;
  imageUrl: string;
  fileName?: string;
  sortOrder: number;
  isPrimary: boolean;
}
 
export interface ItemVariantColor {
  id: string;
  variantId: string;
  colorName: string;
  colorCode: string;
  sortOrder: number;
  isActive: boolean;
  images: ItemVariantColorImage[];
}
 
export interface ItemVariant {
  id: string;
  companyId?: string;
  itemGroupId?: string;
  brandId?: string;
  itemName: string;
  variantLabel: string;
  offerPrice: number;
  nlc: number;
  margin: number;
  incentive: number;
  maxMOPPercent: number;
  maxMOPAmount: number;
  openingStock: number;
  minimumQty: number;
  stockValue: number;
  sortOrder: number;
  isActive: boolean;
  colors: ItemVariantColor[];
  images: ItemVariantColorImage[];
}
 
// ─── Item Variant API ─────────────────────────────────────────
 
export const itemVariantAPI = {
  /** Fetch all variants (with colors+images) for an item */
  getByItem: async (
    token: string,
    options: {
      itemName: string;
      companyId?: string;
      itemGroupId?: string;
      brandId?: string;
    }
  ) => {
    const params = new URLSearchParams();
    params.append("itemName", options.itemName);
    if (options.companyId)  params.append("companyId",  options.companyId);
    if (options.itemGroupId) params.append("itemGroupId", options.itemGroupId);
    if (options.brandId)    params.append("brandId",    options.brandId);
 
    const res = await fetch(`${API_BASE_URL}/item-variants?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  /**
   * Create or update variants (with colors + images).
   * Accepts FormData built by buildVariantFormData().
   */
  upsert: async (data: FormData, token: string) => {
    const res = await fetch(`${API_BASE_URL}/item-variants`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: data,
    });
    return res.json();
  },
 
  /** Delete a single variant (and all its colors/images) */
  delete: async (id: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/item-variants/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
 
  /** Delete a single color (and its images) */
  deleteColor: async (colorId: string, token: string) => {
    const res = await fetch(`${API_BASE_URL}/item-variants/colors/${colorId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};
