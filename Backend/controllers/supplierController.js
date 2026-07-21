import { db } from '../config/db.js';

export const registerSupplier = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const {
      name, group, addressLine1, addressLine2, addressLine3,
      country, state, city, pinCode, creditLimit, creditDays, graceDays,
      balanceAmount, balanceType, panNumber, gstNumber,
      tdsApplicable, tcsApplicable, msmeRegistered, msmeNumber,
      msmeCategory, msmeType, contactPersons, bankAccounts,
    } = req.body;

    if (!name || !addressLine1 || !city || !state || !pinCode)
      return res.status(400).json({ success: false, message: 'Please provide all required supplier information' });
    if (!contactPersons || contactPersons.length === 0)
      return res.status(400).json({ success: false, message: 'At least one contact person is required' });

    if (gstNumber) {
      const [existing] = await connection.query(
        'SELECT id FROM suppliers WHERE gstNumber = ? AND isActive = TRUE', [gstNumber]
      );
      if (existing.length > 0)
        return res.status(400).json({ success: false, message: 'A supplier with this GST number already exists' });
    }

    const [result] = await connection.query(
      `INSERT INTO suppliers (
        name, \`group\`, addressLine1, addressLine2, addressLine3,
        country, state, city, pinCode, creditLimit, creditDays, graceDays,
        balanceAmount, balanceType, panNumber, gstNumber,
        tdsApplicable, tcsApplicable, msmeRegistered, msmeNumber,
        msmeCategory, msmeType, isActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        name, group || null, addressLine1, addressLine2 || null, addressLine3 || null,
        country || 'India', state, city, pinCode,
        creditLimit || 0, creditDays || 0, graceDays || 0,
        balanceAmount || 0, balanceType || 'credit',
        panNumber ? panNumber.toUpperCase() : null,
        gstNumber ? gstNumber.toUpperCase() : null,
        tdsApplicable || false, tcsApplicable || false,
        msmeRegistered || false, msmeNumber || null,
        msmeCategory || null, msmeType || null,
      ]
    );

    const supplierId = result.insertId;

    // ── OPTIMIZED: bulk INSERT contact persons ────────────────────────────────
    // BEFORE: 1 INSERT per contact in a loop → N round-trips
    // AFTER : single bulk INSERT VALUES ?    → 1 round-trip
    if (contactPersons.length > 0) {
      const contactRows = contactPersons.map((c) => [
        supplierId, c.name, c.mobile, c.alternateMobile || null, c.email || null,
      ]);
      await connection.query(
        `INSERT INTO supplier_contact_persons (supplierId, name, mobile, alternateMobile, email) VALUES ?`,
        [contactRows]
      );
    }

    // ── OPTIMIZED: bulk INSERT bank accounts ──────────────────────────────────
    if (bankAccounts && bankAccounts.length > 0) {
      const bankRows = bankAccounts.map((b) => [
        supplierId, b.bankName, b.bankBranch, b.accountNumber, b.ifscCode.toUpperCase(), b.accountHolderName,
      ]);
      await connection.query(
        `INSERT INTO supplier_bank_accounts (supplierId, bankName, bankBranch, accountNumber, ifscCode, accountHolderName) VALUES ?`,
        [bankRows]
      );
    }

    await connection.commit();

    const [[newSupplier]] = await connection.query('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
    const [contacts]      = await connection.query('SELECT * FROM supplier_contact_persons WHERE supplierId = ?', [supplierId]);
    const [banks]         = await connection.query('SELECT * FROM supplier_bank_accounts WHERE supplierId = ?', [supplierId]);

    return res.status(201).json({
      success: true, message: 'Supplier registered successfully',
      data: { ...newSupplier, contactPersons: contacts, bankAccounts: banks },
    });
  } catch (error) {
    await connection.rollback();
    console.error('Register supplier error:', error);
    return res.status(500).json({ success: false, message: 'Server error during supplier registration', error: error.message });
  } finally {
    connection.release();
  }
};

export const getAllSuppliers = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const { search, status, page, limit, sortKey, sortDirection } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const normalizeCsv = (value) => String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const statuses = normalizeCsv(status).filter((entry) => entry === 'active' || entry === 'inactive');

    // The first (oldest) contact person is what the list shows / sorts / searches by.
    const baseFrom = `
      FROM suppliers s
      LEFT JOIN supplier_contact_persons cp
        ON cp.id = (
          SELECT cp2.id FROM supplier_contact_persons cp2
          WHERE cp2.supplierId = s.id
          ORDER BY cp2.createdAt ASC, cp2.id ASC
          LIMIT 1
        )
    `;

    const sortFieldMap = {
      name: 's.name',
      contact: 'cp.name',
      city: 's.city',
      mobile: 'cp.mobile',
      status: 's.isActive',
    };
    const resolvedSortField = sortFieldMap[sortKey] || 's.createdAt';
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : String(sortDirection || '').toLowerCase() === 'asc'
        ? 'ASC'
        : 'DESC';

    const whereClauses = [];
    const params = [];

    // Preserve original behaviour: default to active-only unless caller asks otherwise.
    if (statuses.length === 1) {
      whereClauses.push('s.isActive = ?');
      params.push(statuses[0] === 'active' ? 1 : 0);
    } else if (statuses.length === 0) {
      whereClauses.push('s.isActive = TRUE');
    }

    if (search) {
      const term = `%${search}%`;
      whereClauses.push(`(
        s.name LIKE ? OR
        COALESCE(s.city, '') LIKE ? OR
        COALESCE(s.state, '') LIKE ? OR
        COALESCE(cp.name, '') LIKE ? OR
        COALESCE(cp.mobile, '') LIKE ?
      )`);
      params.push(term, term, term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}, s.id DESC`;

    let query = `
      SELECT s.*
      ${baseFrom}
      ${whereSql}
      ${orderSql}
    `;

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.query(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params);
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (pageNumber - 1) * pageSize);
    }

    const [suppliers] = await db.query(query, params);

    if (suppliers.length === 0) {
      const emptyPayload = { success: true, data: [] };
      if (paginationEnabled) {
        emptyPayload.pagination = {
          page: pageNumber,
          limit: pageSize,
          totalItems: totalItems || 0,
          totalPages: Math.max(1, Math.ceil((totalItems || 0) / pageSize)),
        };
      }
      return res.json(emptyPayload);
    }

    const supplierIds = suppliers.map((s) => s.id);

    // Both sub-table fetches run in parallel
    const [allContacts, allBanks] = await Promise.all([
      db.query(`SELECT * FROM supplier_contact_persons WHERE supplierId IN (?) ORDER BY createdAt ASC`, [supplierIds]),
      db.query(`SELECT * FROM supplier_bank_accounts WHERE supplierId IN (?) ORDER BY createdAt ASC`, [supplierIds]),
    ]);

    const contactsMap = {};
    const banksMap    = {};
    for (const c of allContacts[0]) {
      if (!contactsMap[c.supplierId]) contactsMap[c.supplierId] = [];
      contactsMap[c.supplierId].push(c);
    }
    for (const b of allBanks[0]) {
      if (!banksMap[b.supplierId]) banksMap[b.supplierId] = [];
      banksMap[b.supplierId].push(b);
    }

    const payload = {
      success: true,
      data: suppliers.map((s) => ({
        ...s,
        contactPersons: contactsMap[s.id] || [],
        bankAccounts:   banksMap[s.id]    || [],
      })),
    };
    if (paginationEnabled) {
      payload.pagination = {
        page: pageNumber,
        limit: pageSize,
        totalItems,
        totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      };
    }
    return res.json(payload);
  } catch (error) {
    console.error('Get suppliers error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching suppliers', error: error.message });
  }
};

export const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;
    const [suppliers] = await db.query('SELECT * FROM suppliers WHERE id = ? AND isActive = TRUE', [id]);
    if (suppliers.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });

    // Parallel fetch
    const [[contacts], [banks]] = await Promise.all([
      db.query('SELECT * FROM supplier_contact_persons WHERE supplierId = ?', [id]),
      db.query('SELECT * FROM supplier_bank_accounts WHERE supplierId = ?', [id]),
    ]);

    return res.json({ success: true, data: { ...suppliers[0], contactPersons: contacts, bankAccounts: banks } });
  } catch (error) {
    console.error('Get supplier by ID error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching supplier', error: error.message });
  }
};

export const updateSupplier = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { id }       = req.params;
    const updateData   = req.body;

    const [existingSupplier] = await connection.query('SELECT id FROM suppliers WHERE id = ? AND isActive = TRUE', [id]);
    if (existingSupplier.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const allowedFields = [
      'name', 'group', 'addressLine1', 'addressLine2', 'addressLine3',
      'country', 'state', 'city', 'pinCode', 'creditLimit', 'creditDays',
      'graceDays', 'balanceAmount', 'balanceType', 'panNumber', 'gstNumber',
      'tdsApplicable', 'tcsApplicable', 'msmeRegistered', 'msmeNumber',
      'msmeCategory', 'msmeType',
    ];
    const updateFields = [];
    const updateValues = [];
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updateFields.push(`\`${field}\` = ?`);
        updateValues.push(updateData[field]);
      }
    }
    if (updateFields.length > 0) {
      updateValues.push(id);
      await connection.query(`UPDATE suppliers SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    }

    // ── OPTIMIZED: bulk INSERT contact persons ────────────────────────────────
    if (updateData.contactPersons) {
      await connection.query('DELETE FROM supplier_contact_persons WHERE supplierId = ?', [id]);
      if (updateData.contactPersons.length > 0) {
        const contactRows = updateData.contactPersons.map((c) => [
          id, c.name, c.mobile, c.alternateMobile || null, c.email || null,
        ]);
        await connection.query(
          `INSERT INTO supplier_contact_persons (supplierId, name, mobile, alternateMobile, email) VALUES ?`,
          [contactRows]
        );
      }
    }

    // ── OPTIMIZED: bulk INSERT bank accounts ──────────────────────────────────
    if (updateData.bankAccounts) {
      await connection.query('DELETE FROM supplier_bank_accounts WHERE supplierId = ?', [id]);
      if (updateData.bankAccounts.length > 0) {
        const bankRows = updateData.bankAccounts.map((b) => [
          id, b.bankName, b.bankBranch, b.accountNumber, b.ifscCode.toUpperCase(), b.accountHolderName,
        ]);
        await connection.query(
          `INSERT INTO supplier_bank_accounts (supplierId, bankName, bankBranch, accountNumber, ifscCode, accountHolderName) VALUES ?`,
          [bankRows]
        );
      }
    }

    await connection.commit();

    const [[updatedSupplier]] = await connection.query('SELECT * FROM suppliers WHERE id = ?', [id]);
    const [[contacts], [banks]] = await Promise.all([
      connection.query('SELECT * FROM supplier_contact_persons WHERE supplierId = ?', [id]),
      connection.query('SELECT * FROM supplier_bank_accounts WHERE supplierId = ?', [id]),
    ]);

    return res.json({ success: true, message: 'Supplier updated successfully', data: { ...updatedSupplier, contactPersons: contacts, bankAccounts: banks } });
  } catch (error) {
    await connection.rollback();
    console.error('Update supplier error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating supplier', error: error.message });
  } finally {
    connection.release();
  }
};

export const toggleSupplierStatus = async (req, res) => {
  try {
    const { id }     = req.params;
    const [supplier] = await db.query('SELECT isActive FROM suppliers WHERE id = ?', [id]);
    if (supplier.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const newStatus = !supplier[0].isActive;
    await db.query('UPDATE suppliers SET isActive = ? WHERE id = ?', [newStatus, id]);
    return res.json({ success: true, message: `Supplier ${newStatus ? 'activated' : 'deactivated'} successfully`, data: { isActive: newStatus } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error toggling supplier status', error: error.message });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const { id }     = req.params;
    const [supplier] = await db.query('SELECT id FROM suppliers WHERE id = ?', [id]);
    if (supplier.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });
    await db.query('DELETE FROM suppliers WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Supplier deleted permanently' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error deleting supplier', error: error.message });
  }
};

export const hardDeleteSupplier = async (req, res) => {
  try {
    const { id }     = req.params;
    const [supplier] = await db.query('SELECT id FROM suppliers WHERE id = ?', [id]);
    if (supplier.length === 0) return res.status(404).json({ success: false, message: 'Supplier not found' });
    await db.query('DELETE FROM suppliers WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Supplier permanently deleted from database' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error deleting supplier permanently', error: error.message });
  }
};
