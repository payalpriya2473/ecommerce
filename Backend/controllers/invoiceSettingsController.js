// controllers/invoiceSettingsController.js
import pool from '../config/db.js';

// ─── Helper: financial year string e.g. "25-26" ───────────────────────────────
function getFinancialYear(date = new Date()) {
  const year   = date.getFullYear();
  const fyStart = date.getMonth() >= 3 ? year : year - 1; // April = month 3
  const fyEnd   = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`; // "25-26"
}

// ─── Helper: build the document number string ─────────────────────────────────
// Format is always:  <prefix><NNNN>/<FY><suffix>
// e.g. prefix="" → "0017/25-26", prefix="SI" → "SI0017/25-26"
export function generateDocNumber(prefix, suffix, currentNumber) {
  const fy  = getFinancialYear();
  const num = String(currentNumber).padStart(4, '0');
  return `${prefix || ''}${num}/${fy}${suffix || ''}`;
}

// ─── Helper: should auto-reset counter? ──────────────────────────────────────
function shouldAutoReset(lastReset, resetFrequency) {
  if (resetFrequency === 'never' || !lastReset) return false;
  const now  = new Date();
  const last = new Date(lastReset);
  const getFY = (d) => (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);

  if (resetFrequency === 'monthly') {
    return now.getFullYear() !== last.getFullYear() || now.getMonth() !== last.getMonth();
  }
  if (resetFrequency === 'yearly') {
    return getFY(now) !== getFY(last); // resets on 1-Apr every financial year
  }
  return false;
}

// ─── GET /api/settings/invoice ───────────────────────────────────────────────
export const getInvoiceSettings = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invoice_settings WHERE id = 1');
    if (!rows.length) return res.status(404).json({ message: 'Settings not found' });
    const r = rows[0];

    res.json({
      po: {
        prefix:         r.po_prefix,
        suffix:         r.po_suffix,
        startNumber:    r.po_start_number,
        currentNumber:  r.po_current_number,
        resetFrequency: r.po_reset_frequency,
        lastReset:      r.po_last_reset ? r.po_last_reset.toISOString() : null,
      },
      pi: {
        prefix:         r.pi_prefix,
        suffix:         r.pi_suffix,
        startNumber:    r.pi_start_number,
        currentNumber:  r.pi_current_number,
        resetFrequency: r.pi_reset_frequency,
        lastReset:      r.pi_last_reset ? r.pi_last_reset.toISOString() : null,
      },
      si: {
        prefix:         r.si_prefix,
        suffix:         r.si_suffix,
        startNumber:    r.si_start_number,
        currentNumber:  r.si_current_number,
        resetFrequency: r.si_reset_frequency,
        lastReset:      r.si_last_reset ? r.si_last_reset.toISOString() : null,
      },
    });
  } catch (err) {
    console.error('getInvoiceSettings error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PUT /api/settings/invoice ───────────────────────────────────────────────
export const saveInvoiceSettings = async (req, res) => {
  try {
    const { po, pi, si } = req.body;

    await pool.query(
      `UPDATE invoice_settings SET
        po_prefix = ?, po_suffix = ?, po_start_number = ?, po_current_number = ?,
        po_reset_frequency = ?, po_last_reset = ?,
        pi_prefix = ?, pi_suffix = ?, pi_start_number = ?, pi_current_number = ?,
        pi_reset_frequency = ?, pi_last_reset = ?,
        si_prefix = ?, si_suffix = ?, si_start_number = ?, si_current_number = ?,
        si_reset_frequency = ?, si_last_reset = ?
      WHERE id = 1`,
      [
        po.prefix, po.suffix, po.startNumber, po.currentNumber,
        po.resetFrequency, po.lastReset ? new Date(po.lastReset) : null,
        pi.prefix, pi.suffix, pi.startNumber, pi.currentNumber,
        pi.resetFrequency, pi.lastReset ? new Date(pi.lastReset) : null,
        si.prefix, si.suffix, si.startNumber, si.currentNumber,
        si.resetFrequency, si.lastReset ? new Date(si.lastReset) : null,
      ]
    );

    res.json({ message: 'Settings saved successfully' });
  } catch (err) {
    console.error('saveInvoiceSettings error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET /api/purchase-orders/next-number ────────────────────────────────────
export const getNextPONumber = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invoice_settings WHERE id = 1');
    if (!rows.length) return res.json({ poNumber: generateDocNumber('', '', 1) });

    const row = rows[0];
    let currentNumber = row.po_current_number;

    if (shouldAutoReset(row.po_last_reset, row.po_reset_frequency)) {
      currentNumber = row.po_start_number;
      await pool.query(
        'UPDATE invoice_settings SET po_current_number = ?, po_last_reset = NOW() WHERE id = 1',
        [currentNumber]
      );
    }

    res.json({ poNumber: generateDocNumber(row.po_prefix, row.po_suffix, currentNumber) });
  } catch (err) {
    console.error('getNextPONumber error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET /api/purchase-invoices/next-number ──────────────────────────────────
export const getNextInvoiceNumber = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invoice_settings WHERE id = 1');
    if (!rows.length) return res.json({ invoiceNumber: generateDocNumber('', '', 1) });

    const row = rows[0];
    let currentNumber = row.pi_current_number;

    if (shouldAutoReset(row.pi_last_reset, row.pi_reset_frequency)) {
      currentNumber = row.pi_start_number;
      await pool.query(
        'UPDATE invoice_settings SET pi_current_number = ?, pi_last_reset = NOW() WHERE id = 1',
        [currentNumber]
      );
    }

    res.json({ invoiceNumber: generateDocNumber(row.pi_prefix, row.pi_suffix, currentNumber) });
  } catch (err) {
    console.error('getNextInvoiceNumber error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET /api/sales-invoices/next-number ─────────────────────────────────────
export const getNextSINumber = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM invoice_settings WHERE id = 1');
    if (!rows.length) return res.json({ billNumber: generateDocNumber('', '', 1) });

    const row = rows[0];
    let currentNumber = row.si_current_number;

    if (shouldAutoReset(row.si_last_reset, row.si_reset_frequency)) {
      currentNumber = row.si_start_number;
      await pool.query(
        'UPDATE invoice_settings SET si_current_number = ?, si_last_reset = NOW() WHERE id = 1',
        [currentNumber]
      );
    }

    res.json({ billNumber: generateDocNumber(row.si_prefix, row.si_suffix, currentNumber) });
  } catch (err) {
    console.error('getNextSINumber error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};


export const incrementPONumber = async () => {
  await pool.query(
    'UPDATE invoice_settings SET po_current_number = po_current_number + 1 WHERE id = 1'
  );
};

export const incrementPINumber = async () => {
  await pool.query(
    'UPDATE invoice_settings SET pi_current_number = pi_current_number + 1 WHERE id = 1'
  );
};

// Called from salesInvoiceController AFTER a successful SI insert
export const incrementSINumber = async () => {
  await pool.query(
    'UPDATE invoice_settings SET si_current_number = si_current_number + 1 WHERE id = 1'
  );
};