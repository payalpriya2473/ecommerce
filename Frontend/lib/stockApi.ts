
import { API_BASE_URL } from "./api";

export interface StockItem {
  ITEM: string;
  item?: string;
  itemName?: string;
  description?: string;
  TSTOCK: string;
  totalStock?: string;
  total_stock?: string;
  DSTOCK: string;
  damagedStock?: string;
  ASTOCK: string;
  agedStock?: string;
  incentive: string;
  offerprice: string;
  PDEL: string;
  pendingDelivery?: string;
  ITEMGROUP: string;
  itemgroup?: string;
  itemGroup?: string;
  BRAND: string;
  brand?: string;
  schamt: string;
  schemeAmount?: string;
  penord: string;
  pendingOrders?: string;
  hsncode?: string;
  hsnCode?: string;
  gst?: string;
  margin_prc?: string;
  marginPercent?: string;
  opqty?: string;
  openingQty?: string;
  minqty?: string;
  minQty?: string;
  mopprc?: string;
  mopPercent?: string;
  mopamt?: string;
  mopAmount?: string;
  nlc?: string;
  category?: string;
  branch?: string;
}

function firstString(...values: Array<string | number | null | undefined>): string {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function normalizeStockItem(row: Record<string, unknown>): StockItem {
  const r = row as Record<string, any>;
  const item = firstString(r.ITEM, r.item, r.itemName, r.description);
  const itemGroup = firstString(r.ITEMGROUP, r.itemgroup, r.itemGroup, r.Group, r.group1);
  const brand = firstString(r.BRAND, r.brand, r.Brand);
  const totalStock = firstString(r.TSTOCK, r.totalStock, r.total_stock, r.tstock, r.Total);
  const damagedStock = firstString(r.DSTOCK, r.damagedStock, r.dstock, r.Damaged);
  const agedStock = firstString(r.ASTOCK, r.agedStock, r.astock, r.Aged);
  const pendingDelivery = firstString(r.PDEL, r.pendingDelivery, r.pdel, r["Pend. Del."], r["Pend Del"]);
  const schemeAmount = firstString(r.schamt, r.schemeAmount, r.Scheme);
  const pendingOrders = firstString(r.penord, r.pendingOrders, r["Pend. Ord."], r["Pend Ord"]);
  const incentive = firstString(r.incentive, r.liveIncentive, r.dsltd);
  const offerprice = firstString(r.offerprice, r.offerPrice, r.mrp, r.MRP, r.srate);
  const hsncode = firstString(r.hsncode, r.hsnCode, r.HSN, r.hsn);
  const gst = firstString(r.gst, r.GST, r["GST %"], r["GST%"]);
  const marginPrc = firstString(r.margin_prc, r.marginPercent, r["Margin %"], r.width, r.margin);
  const opqty = firstString(r.opqty, r.openingQty, r["Op. Qty"], r["Op Qty"]);
  const minqty = firstString(r.minqty, r.minQty, r["Min Qty"]);
  const mopprc = firstString(r.mopprc, r.mopPercent, r["MOP %"], r["MOP%"]);
  const mopamt = firstString(r.mopamt, r.mopAmount, r["MOP Amt"]);
  const nlc = firstString(r.nlc, r.show);
  const category = firstString(r.category, r.head);
  const branch = firstString(r.branch);

  return {
    ITEM: item,
    item,
    itemName: item,
    description: firstString(r.description) || item,
    TSTOCK: totalStock,
    totalStock,
    total_stock: totalStock,
    DSTOCK: damagedStock,
    damagedStock,
    ASTOCK: agedStock,
    agedStock,
    incentive,
    offerprice,
    PDEL: pendingDelivery,
    pendingDelivery,
    ITEMGROUP: itemGroup,
    itemgroup: itemGroup,
    itemGroup,
    BRAND: brand,
    brand,
    schamt: schemeAmount,
    schemeAmount,
    penord: pendingOrders,
    pendingOrders,
    hsncode,
    hsnCode: hsncode,
    gst,
    margin_prc: marginPrc,
    marginPercent: marginPrc,
    opqty,
    openingQty: opqty,
    minqty,
    minQty: minqty,
    mopprc,
    mopPercent: mopprc,
    mopamt,
    mopAmount: mopamt,
    nlc,
    category,
    branch,
  };
}

function normalizeStockRows(rows: unknown): StockItem[] {
  return Array.isArray(rows) ? rows.map((row) => normalizeStockItem(row as Record<string, unknown>)) : [];
}

export interface StockSearchParams {
  company_code: string;
  itemgroup?:   string;
  item?:        string;
  brand?:       string;
  branch?:      string;
}

export interface StockSearchResponse {
  success:      boolean;
  flag:         number;       
  message?:     string;
  stock_search?: StockItem[];
  total_qty?:   string;
  total_p_delivery?: string;
}

export interface SyncDiagnostics {
  rowCount:             number;
  firstRowKeys:         string[];
  masterKeysPresent:    string[];
  masterKeysWithValues: string[];
  masterFieldsOk:       boolean;
}

export interface SyncResult {
  success:        boolean;
  status:         "running" | "success" | "partial" | "error";
  sourceType?:    "MASTER" | "BASIC";
  diagnostics?:   SyncDiagnostics;
  itemsProcessed: number;
  itemsCreated:   number;
  itemsUpdated:   number;
  brandsCreated:  number;
  groupsCreated:  number;
  categoriesCreated: number;
  liveStockRows:  number;
  durationMs?:    number;
}

export interface SyncLog {
  id:             number;
  trigger:        "cron" | "manual" | "startup";
  status:         "running" | "success" | "partial" | "error";
  itemsProcessed: number;
  itemsCreated:   number;
  itemsUpdated:   number;
  liveStockRows:  number;
  startedAt:      string;
  finishedAt:     string | null;
  errorMessage:   string | null;
}


export const stockAPI = {

  search: async (params: StockSearchParams): Promise<StockSearchResponse> => {
    const token = sessionStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/stock/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params),
    });
    const data = await response.json();
    return {
      ...data,
      stock_search: normalizeStockRows(data.stock_search),
    };
  },


  syncNow: async (params: StockSearchParams): Promise<{ success: boolean; message?: string; result?: SyncResult }> => {
    const token = sessionStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/stock/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params),
    });
    return response.json();
  },

 
  getSyncStatus: async (): Promise<{ success: boolean; latest: SyncLog | null; history: SyncLog[] }> => {
    const token = sessionStorage.getItem('authToken');
    const response = await fetch(`${API_BASE_URL}/stock/sync/status`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return response.json();
  },
};
