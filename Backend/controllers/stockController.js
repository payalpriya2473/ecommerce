import { isDirectOdbcConfigured, searchStockDirect, normalizeStockRow } from '../services/accessStockService.js';

const PHP_STOCK_API_URL = process.env.PHP_STOCK_API_URL;
const PHP_STOCK_MASTER_API_URL = process.env.PHP_STOCK_MASTER_API_URL || '';
const PHP_STOCK_API_USER = process.env.PHP_STOCK_API_USER;
const PHP_STOCK_API_PASS = process.env.PHP_STOCK_API_PASS;

function normalizeStockSearchResponse(data) {
  const stockRows = Array.isArray(data?.stock_search) ? data.stock_search.map(normalizeStockRow) : [];
  return {
    ...data,
    stock_search: stockRows,
    total_qty: data?.total_qty ?? '0',
    total_p_delivery: data?.total_p_delivery ?? '0',
    flag: data?.flag ?? (stockRows.length > 0 ? 1 : 0),
  };
}

async function callStockEndpoint(url, companyCode, filters = {}) {
  const params = new URLSearchParams();
  params.append('company_code', companyCode);
  if (filters.itemgroup) params.append('itemgroup', filters.itemgroup);
  if (filters.item) params.append('item', filters.item);
  if (filters.brand) params.append('brand', filters.brand);
  if (filters.branch) params.append('branch', filters.branch);

  const credentials = Buffer.from(`${PHP_STOCK_API_USER}:${PHP_STOCK_API_PASS}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`PHP Stock API returned error: ${response.status}`);
  }

  const data = await response.json();
  return normalizeStockSearchResponse(data);
}


export const searchStock = async (req, res) => {
  try {
    const { company_code, itemgroup, item, brand, branch } = req.body;

    if (!company_code) {
      return res.status(400).json({
        success: false,
        flag: 0,
        message: 'company_code is required',
      });
    }

    // 1) Direct ODBC — runs the live query itself, returns all 20 fields
    if (isDirectOdbcConfigured()) {
      try {
        const data = await searchStockDirect(company_code, { itemgroup, item, brand, branch });
        const normalized = normalizeStockSearchResponse(data);
        console.log(`[stockController] live search via DIRECT ODBC (${normalized.stock_search?.length || 0} rows) — all fields`);
        return res.json({ success: normalized.flag === 1, ...normalized });
      } catch (err) {
        console.warn('[stockController] direct ODBC failed, falling back to PHP API:', err.message);
      }
    } else {
      console.log('[stockController] direct ODBC not configured (ACCESS_DB_DIR missing/invalid) — using PHP API');
    }

    if (!PHP_STOCK_API_URL) {
      return res.status(500).json({
        success: false,
        flag: 0,
        message: 'PHP_STOCK_API_URL is not configured and direct ODBC is unavailable.',
      });
    }

    // 2) Live PHP API — fetch and normalize into the same row shape
    const endpoints = [...new Set([PHP_STOCK_MASTER_API_URL, PHP_STOCK_API_URL].filter(Boolean))];
    if (endpoints.length === 0) {
      return res.status(500).json({
        success: false,
        flag: 0,
        message: 'No PHP stock API URL configured and direct ODBC is unavailable.',
      });
    }

    let normalized = null;
    const errors = [];
    for (const url of endpoints) {
      try {
        normalized = await callStockEndpoint(url, company_code, { itemgroup, item, brand, branch });
        console.log(`[stockController] live search using ${url} (${normalized.stock_search?.length || 0} rows)`);
        break;
      } catch (err) {
        errors.push(`${url}: ${err.message}`);
        console.warn(`[stockController] endpoint failed (${url}):`, err.message);
      }
    }

    if (!normalized) {
      return res.status(502).json({
        success: false,
        flag: 0,
        message: `All PHP stock endpoints failed: ${errors.join(' | ')}`,
      });
    }

    return res.json({
      success: normalized.flag === 1,
      ...normalized,
    });

  } catch (err) {
    console.error('[stockController] Error fetching live stock:', err.message);
    return res.status(500).json({
      success: false,
      flag: 0,
      message: 'Failed to fetch live stock data. Please try again.',
    });
  }
};
