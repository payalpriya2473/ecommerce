// services/reports/salesSources.js
// The two places sales are recorded, normalised to one shape so reports can
// UNION them:
//   • Showroom — sales_invoices / sales_invoice_items (Transaction → Sales Invoices)
//   • Website  — website_orders / website_order_items (Online Orders)
//
// Amount conventions (kept exactly as each module records them):
//   Showroom  line value = sales_invoice_items.amount  (qty × rate − scheme − discount;
//             this is what Sales Invoices totals into Net Amount), GST = stored
//             SGST + CGST + IGST amounts, bill net = sales_invoices.netAmount.
//   Website   prices are GST-inclusive. Order-level discounts (coupon, platform)
//             are spread over the lines pro rata; taxable = value / (1 + GST%),
//             bill net = website_orders.totalAmount.

export const CHANNELS = ["showroom", "website"];

// Website orders that count as a sale (money received or COD in progress).
export const WEBSITE_SALE_STATUSES = ["processing", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
export const WEBSITE_ALL_STATUSES = [
  "pending_payment", "payment_failed", ...WEBSITE_SALE_STATUSES, "cancelled", "returned",
];

/** SQL + params limiting website orders by the report's status filter. */
export function websiteStatusClause(status, alias = "o") {
  if (status === "all") return { sql: "", params: [] };
  if (WEBSITE_ALL_STATUSES.includes(status)) return { sql: ` AND ${alias}.status = ?`, params: [status] };
  return { sql: ` AND ${alias}.status IN (?)`, params: [WEBSITE_SALE_STATUSES] };
}

/**
 * Normalised LINE rows (one per product sold) for one channel.
 * Output columns: channel, docId, docNumber, docDate, customerName, customerPhone,
 *   itemId, itemName, variant, colorName, brandId, brandName, categoryId,
 *   categoryName, itemGroupId, qty, rate, discount, taxableAmount, gstPercent,
 *   taxAmount, lineValue, paymentMode, status, salesmanId
 */
export function lineSource(channel, { range, status }) {
  if (channel === "showroom") {
    return {
      sql: `
        SELECT 'showroom' AS channel, si.id AS docId, si.billNumber AS docNumber, si.billDate AS docDate,
               si.partyName AS customerName, si.mobileNo AS customerPhone,
               sii.itemId, COALESCE(NULLIF(im.itemName, ''), sii.itemName) AS itemName,
               COALESCE(NULLIF(sii.variant, ''), im.variant) AS variant, NULL AS colorName,
               COALESCE(im.brandId, sii.brandId) AS brandId, COALESCE(b.name, sii.brandName) AS brandName,
               c.id AS categoryId, c.name AS categoryName, ig.id AS itemGroupId,
               sii.qty AS qty, sii.rate AS rate,
               (COALESCE(sii.scheme, 0) + COALESCE(sii.discountRs, 0)) AS discount,
               sii.amount AS taxableAmount, sii.gstPercent AS gstPercent,
               (COALESCE(sii.sgstAmount, 0) + COALESCE(sii.cgstAmount, 0) + COALESCE(sii.igstAmount, 0)) AS taxAmount,
               sii.amount AS lineValue,
               si.mop AS paymentMode, 'invoiced' AS status, si.salesmanId AS salesmanId
          FROM sales_invoice_items sii
          JOIN sales_invoices si   ON si.id  = sii.salesInvoiceId
          LEFT JOIN items im       ON im.id  = sii.itemId
          LEFT JOIN item_groups ig ON ig.id  = im.itemGroupId
          LEFT JOIN categories c   ON c.id   = ig.categoryId
          LEFT JOIN brands b       ON b.id   = COALESCE(im.brandId, sii.brandId)
         WHERE si.billDate >= ? AND si.billDate < ?`,
      params: [range.start, range.endExclusive],
    };
  }
  const st = websiteStatusClause(status);
  // share = this line's part of the order's goods after order-level discounts
  return {
    sql: `
      SELECT 'website' AS channel, o.id AS docId, o.orderNumber AS docNumber, o.placedAt AS docDate,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', wc.firstName, wc.lastName)), ''), o.shipName) AS customerName,
             COALESCE(NULLIF(o.shipPhone, ''), wc.phone) AS customerPhone,
             oi.itemId, oi.itemName, COALESCE(NULLIF(oi.variant, ''), im.variant) AS variant, oi.colorName,
             im.brandId AS brandId, COALESCE(b.name, oi.brandName) AS brandName,
             c.id AS categoryId, COALESCE(c.name, oi.categoryName) AS categoryName, ig.id AS itemGroupId,
             oi.qty AS qty, oi.unitPrice AS rate,
             (oi.lineTotal * ow.discountShare) AS discount,
             (oi.lineTotal * (1 - ow.discountShare)) / (1 + COALESCE(oi.gst, 0) / 100) AS taxableAmount,
             oi.gst AS gstPercent,
             (oi.lineTotal * (1 - ow.discountShare))
               - (oi.lineTotal * (1 - ow.discountShare)) / (1 + COALESCE(oi.gst, 0) / 100) AS taxAmount,
             (oi.lineTotal * (1 - ow.discountShare)) AS lineValue,
             o.paymentMethod AS paymentMode, o.status AS status, NULL AS salesmanId
        FROM website_order_items oi
        JOIN website_orders o ON o.id = oi.orderId
        JOIN (
          SELECT id,
                 CASE WHEN subtotal > 0
                      THEN LEAST(1, (COALESCE(couponDiscount, 0) + COALESCE(platformDiscount, 0)) / subtotal)
                      ELSE 0 END AS discountShare
            FROM website_orders
           WHERE placedAt >= ? AND placedAt < ?
        ) ow ON ow.id = o.id
        LEFT JOIN website_customers wc ON wc.id  = o.customerId
        LEFT JOIN items im             ON im.id  = oi.itemId
        LEFT JOIN item_groups ig       ON ig.id  = im.itemGroupId
        LEFT JOIN categories c         ON c.id   = ig.categoryId
        LEFT JOIN brands b             ON b.id   = im.brandId
       WHERE o.placedAt >= ? AND o.placedAt < ?${st.sql}`,
    params: [range.start, range.endExclusive, range.start, range.endExclusive, ...st.params],
  };
}

/**
 * Normalised BILL rows (one per invoice / order) for one channel.
 * Output columns: channel, docId, docNumber, docDate, customerName, customerPhone,
 *   city, salesmanId, salesmanName, paymentMode, status, itemCount, qty,
 *   grossAmount, discount, taxableAmount, taxAmount, otherCharges, netAmount
 */
export function billSource(channel, { range, status }) {
  if (channel === "showroom") {
    return {
      sql: `
        SELECT 'showroom' AS channel, si.id AS docId, si.billNumber AS docNumber, si.billDate AS docDate,
               si.partyName AS customerName, si.mobileNo AS customerPhone, si.partyCityVillage AS city,
               si.salesmanId AS salesmanId, e.name AS salesmanName,
               si.mop AS paymentMode, 'invoiced' AS status,
               COALESCE(l.itemCount, 0) AS itemCount, COALESCE(l.qty, 0) AS qty,
               COALESCE(l.gross, 0) AS grossAmount,
               COALESCE(l.lineDiscount, 0) + COALESCE(si.discountAmount, 0) AS discount,
               COALESCE(l.taxable, 0) - COALESCE(si.discountAmount, 0) AS taxableAmount,
               COALESCE(l.tax, 0) AS taxAmount,
               COALESCE(si.freightAmount, 0) + COALESCE(si.otherCharges, 0) + COALESCE(si.processingFees1, 0)
                 + COALESCE(si.processingFees2, 0) + COALESCE(si.installationAmt, 0) AS otherCharges,
               si.netAmount AS netAmount
          FROM sales_invoices si
          LEFT JOIN (
            SELECT sii.salesInvoiceId, COUNT(*) AS itemCount, SUM(sii.qty) AS qty,
                   SUM(sii.qty * sii.rate) AS gross,
                   SUM(COALESCE(sii.scheme, 0) + COALESCE(sii.discountRs, 0)) AS lineDiscount,
                   SUM(sii.amount) AS taxable,
                   SUM(COALESCE(sii.sgstAmount, 0) + COALESCE(sii.cgstAmount, 0) + COALESCE(sii.igstAmount, 0)) AS tax
              FROM sales_invoice_items sii
              JOIN sales_invoices s2 ON s2.id = sii.salesInvoiceId
             WHERE s2.billDate >= ? AND s2.billDate < ?
             GROUP BY sii.salesInvoiceId
          ) l ON l.salesInvoiceId = si.id
          LEFT JOIN employees e ON e.id = si.salesmanId
         WHERE si.billDate >= ? AND si.billDate < ?`,
      params: [range.start, range.endExclusive, range.start, range.endExclusive],
    };
  }
  const st = websiteStatusClause(status);
  return {
    sql: `
      SELECT 'website' AS channel, o.id AS docId, o.orderNumber AS docNumber, o.placedAt AS docDate,
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', wc.firstName, wc.lastName)), ''), o.shipName) AS customerName,
             COALESCE(NULLIF(o.shipPhone, ''), wc.phone) AS customerPhone, o.shipCity AS city,
             NULL AS salesmanId, NULL AS salesmanName,
             o.paymentMethod AS paymentMode, o.status AS status,
             COALESCE(l.itemCount, 0) AS itemCount, COALESCE(l.qty, 0) AS qty,
             o.subtotal AS grossAmount,
             COALESCE(o.couponDiscount, 0) + COALESCE(o.platformDiscount, 0) AS discount,
             o.totalAmount - COALESCE(o.deliveryCharge, 0) - COALESCE(o.codFee, 0) - COALESCE(o.taxAmount, 0) AS taxableAmount,
             COALESCE(o.taxAmount, 0) AS taxAmount,
             COALESCE(o.deliveryCharge, 0) + COALESCE(o.codFee, 0) AS otherCharges,
             o.totalAmount AS netAmount
        FROM website_orders o
        LEFT JOIN (
          SELECT oi.orderId, COUNT(*) AS itemCount, SUM(oi.qty) AS qty
            FROM website_order_items oi
            JOIN website_orders o2 ON o2.id = oi.orderId
           WHERE o2.placedAt >= ? AND o2.placedAt < ?
           GROUP BY oi.orderId
        ) l ON l.orderId = o.id
        LEFT JOIN website_customers wc ON wc.id = o.customerId
       WHERE o.placedAt >= ? AND o.placedAt < ?${st.sql}`,
    params: [range.start, range.endExclusive, range.start, range.endExclusive, ...st.params],
  };
}

/** UNION ALL of the requested channels' sources. */
export function unionSources(builder, channels, ctx) {
  const parts = channels.map((ch) => builder(ch, ctx));
  return {
    sql: parts.map((p) => `(${p.sql})`).join("\nUNION ALL\n"),
    params: parts.flatMap((p) => p.params),
  };
}
