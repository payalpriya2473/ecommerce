import path from 'path';
import fs from 'fs';

const DEFAULT_DB_PASSWORD = 'rajZsdc7';

let odbcPromise = null;
function getOdbc() {
  if (!odbcPromise) {
    odbcPromise = import('odbc')
      .then((m) => m.default || m)
      .catch((err) => {
        odbcPromise = null;
        throw new Error(`'odbc' package not available (run: npm install odbc) — ${err.message}`);
      });
  }
  return odbcPromise;
}

export function isDirectOdbcConfigured() {
  const dir = process.env.ACCESS_DB_DIR;
  if (!dir || !dir.trim()) return false;
  try {
    // A placeholder like "D:\path\to\mdb\folder" must NOT count as configured,
    // otherwise the app thinks Node/ODBC is ready and silently falls back to PHP.
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function escapeSql(v) {
  return String(v).replace(/'/g, "''");
}


function buildConditions({ itemgroup, item, brand, branch } = {}) {
  const conditions = [];
  if (itemgroup) conditions.push(`itemmast.group1 = '${escapeSql(itemgroup)}'`);
  if (item) conditions.push(`psrno.ITEM = '${escapeSql(item)}'`);
  if (brand) conditions.push(`itemmast.BRAND = '${escapeSql(brand)}'`);
  if (branch) conditions.push(`psrno.branch = '${escapeSql(branch)}'`);
  return conditions.length ? `And ${conditions.join(' AND ')}` : '';
}


// Builds the exact same SQL query as the client's PHP endpoint.
// The only dynamic part is the WHERE filter (whereClause), exactly like PHP.
export function buildStockSql(filters = {}) {
  const whereClause = buildConditions(filters);
  return "select fstk.*,pord.penord from (SELECT finalSTK.TSTOCK, finalSTK.DSTOCK, finalSTK.ASTOCK, finalSTK.ITEM, finalSTK.incentive, finalSTK.offerprice, finalSTK.PDEL, finalSTK.ITEMGROUP, finalSTK.BRAND, sch.schamt,finalSTK.hsncode,finalSTK.gst,finalSTK.margin_prc,finalSTK.minqty,finalSTK.mopprc,finalSTK.mopamt, finalSTK.nlc,finalSTK.category FROM ( SELECT STK.TSTOCK, STK.DSTOCK, STK.ASTOCK, STK.ITEM, STK.incentive, STK.offerprice, STK.ITEMGROUP, STK.BRAND, PDEL.PDEL,STK.hsncode,STK.gst,STK.margin_prc,STK.minqty,STK.mopprc,STK.mopamt, STK.nlc,STK.category FROM ( SELECT COUNT(item) AS TSTOCK, SUM(IIF(damagedesc <> '', 1, 0)) AS DSTOCK, SUM(IIF(DATEADD('M', itemgroup.fmonths, pdate) < DATEVALUE(NOW()), 1, 0)) AS ASTOCK, itemmast.dsltd AS incentive, itemmast.mrp AS offerprice, ITEMMAST.GROUP1 AS ITEMGROUP, ITEMMAST.BRAND, psrno.item,itemmast.hsncode,itemmast.gst,itemmast.width as margin_prc,itemmast.minqty,itemmast.mopprc,itemmast.mopamt, itemmast.show as nlc,itemgroup.category FROM psrno, itemgroup, itemmast WHERE psrno.sinvno = 0 AND psrno.item = itemmast.description AND itemmast.group1 = itemgroup.name " + whereClause + " GROUP BY psrno.item, itemmast.dsltd, itemmast.mrp, ITEMMAST.GROUP1, ITEMMAST.BRAND,psrno.item,itemmast.hsncode,itemmast.gst,itemmast.width as margin_prc,itemmast.minqty,itemmast.mopprc,itemmast.mopamt,itemmast.mrp as offerprice, itemmast.show,itemgroup.category ) AS STK LEFT JOIN ( SELECT COUNT(SALES.ITEM) AS PDEL, ITEM FROM SALES WHERE SALES.SRNO = '' GROUP BY ITEM ) AS PDEL ON PDEL.ITEM = STK.ITEM ) AS finalSTK LEFT JOIN ( SELECT SUM(incamt) AS schamt, item FROM scheme WHERE sdate <= DATEVALUE(NOW()) AND edate >= DATEVALUE(NOW()) GROUP BY item ) AS sch ON sch.item = finalSTK.item order by finalSTK.ITEMGROUP, finalSTK.BRAND,finalSTK.ITEM) as fstk left join (select sum(bqty) as penord,item from sorderdet where bqty > 0 group by item) as pord on pord.item = fstk.item";
}


function gv(row, key) {
  if (key in row) return row[key];
  const lk = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lk) return row[k];
  }
  return null;
}
const s = (v) => (v === null || v === undefined ? '' : String(v));


export function normalizeStockRow(row) {
  const item = s(gv(row, 'ITEM') ?? gv(row, 'item') ?? gv(row, 'itemName') ?? gv(row, 'description'));
  const itemGroup = s(gv(row, 'ITEMGROUP') ?? gv(row, 'itemgroup') ?? gv(row, 'itemGroup') ?? gv(row, 'Group') ?? gv(row, 'group1'));
  const brand = s(gv(row, 'BRAND') ?? gv(row, 'brand') ?? gv(row, 'Brand'));
  const totalStock = s(gv(row, 'TSTOCK') ?? gv(row, 'totalStock') ?? gv(row, 'total_stock') ?? gv(row, 'tstock') ?? gv(row, 'Total'));
  const damagedStock = s(gv(row, 'DSTOCK') ?? gv(row, 'damagedStock') ?? gv(row, 'dstock') ?? gv(row, 'Damaged'));
  const agedStock = s(gv(row, 'ASTOCK') ?? gv(row, 'agedStock') ?? gv(row, 'astock') ?? gv(row, 'Aged'));
  const pendingDelivery = s(gv(row, 'PDEL') ?? gv(row, 'pendingDelivery') ?? gv(row, 'pdel') ?? gv(row, 'Pend. Del.') ?? gv(row, 'Pend Del'));
  const pendingOrders = s(gv(row, 'penord') ?? gv(row, 'pendingOrders') ?? gv(row, 'Pend. Ord.') ?? gv(row, 'Pend Ord'));
  const schemeAmount = s(gv(row, 'schamt') ?? gv(row, 'schemeAmount') ?? gv(row, 'Scheme'));
  const incentive = s(gv(row, 'incentive') ?? gv(row, 'liveIncentive') ?? gv(row, 'dsltd'));
  const offerprice = s(gv(row, 'offerprice') ?? gv(row, 'offerPrice') ?? gv(row, 'mrp') ?? gv(row, 'MRP') ?? gv(row, 'srate'));
  const hsncode = s(gv(row, 'hsncode') ?? gv(row, 'hsnCode') ?? gv(row, 'HSN') ?? gv(row, 'hsn'));
  const gst = s(gv(row, 'gst') ?? gv(row, 'GST') ?? gv(row, 'GST %') ?? gv(row, 'GST%'));
  const marginPrc = s(gv(row, 'margin_prc') ?? gv(row, 'marginPercent') ?? gv(row, 'Margin %') ?? gv(row, 'width') ?? gv(row, 'margin'));
  const opqty = s(gv(row, 'opqty') ?? gv(row, 'openingQty') ?? gv(row, 'Op. Qty') ?? gv(row, 'Op Qty'));
  const minqty = s(gv(row, 'minqty') ?? gv(row, 'minQty') ?? gv(row, 'Min Qty'));
  const mopprc = s(gv(row, 'mopprc') ?? gv(row, 'mopPercent') ?? gv(row, 'MOP %') ?? gv(row, 'MOP%'));
  const mopamt = s(gv(row, 'mopamt') ?? gv(row, 'mopAmount') ?? gv(row, 'MOP Amt'));
  const nlc = s(gv(row, 'nlc') ?? gv(row, 'show'));
  const category = s(gv(row, 'category') ?? gv(row, 'head'));
  const branch = s(gv(row, 'branch'));

  return {
    ITEM: item,
    item,
    itemName: item,
    description: s(gv(row, 'description')) || item,
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
    // master fields (the whole reason for this port)
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

function resolveMdbPath(companyCode) {
  const dir = process.env.ACCESS_DB_DIR;
  if (!dir) throw new Error('ACCESS_DB_DIR is not set in .env');
  const mdb = path.join(dir, `${companyCode}.mdb`);
  if (!fs.existsSync(mdb)) {
    throw new Error(`Access database not found: ${mdb} (check ACCESS_DB_DIR and company code)`);
  }
  return mdb;
}


export async function fetchLiveStockRows(companyCode, filters = {}) {
  if (!companyCode) throw new Error('companyCode is required');

  const odbc = await getOdbc();
  const mdbPath = resolveMdbPath(companyCode);
  const pwd = process.env.ACCESS_DB_PASSWORD || DEFAULT_DB_PASSWORD;
  const connStr = `Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${mdbPath};PWD=${pwd};`;

  let conn;
  try {
    conn = await odbc.connect(connStr);
    const rows = await conn.query(buildStockSql(filters));
    return rows.map(normalizeStockRow);
  } catch (err) {
    console.error('fetchLiveStockRows error:', err);
    throw new Error('Failed to fetch live stock data: ' + err.message);
  } finally {
    if (conn) { try { await conn.close(); } catch { /* ignore */ } }
  }
}


export async function searchStockDirect(companyCode, filters = {}) {
  const rows = await fetchLiveStockRows(companyCode, filters);
  if (rows.length) {
    return { total_qty: '0', total_p_delivery: '0', stock_search: rows, flag: 1 };
  }
  return { flag: 0, message: 'No Data Found' };
}

export default { isDirectOdbcConfigured, fetchLiveStockRows, searchStockDirect, buildStockSql };
