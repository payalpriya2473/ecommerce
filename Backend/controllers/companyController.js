import { db } from '../config/db.js';

/**
 * Register a new company
 */
export const registerCompany = async (req, res) => {
  try {
    const {
      name, address, city, state, pinCode, gstNumber, panNumber,
      bankName, accountNumber, ifscCode, bankBranch, upiId, qrCodeData,
      udid, msmeRegistered, msmeNumber, msmeCategory, msmeType,
      tdsApplicable, tanNumber, tdsRate, banks,
      dispatchName, dispatchContactPerson, dispatchContactPhone,
    } = req.body;

    const logoUrl = req.file ? `/uploads/companies/${req.file.filename}` : null;

    if (!name || !address || !city || !state || !pinCode) {
      return res.status(400).json({ success: false, message: 'Please provide all required company information' });
    }
    if (!gstNumber || !panNumber) {
      return res.status(400).json({ success: false, message: 'GST and PAN numbers are required' });
    }
    if (!bankName || !accountNumber || !ifscCode) {
      return res.status(400).json({ success: false, message: 'Bank details are required' });
    }

    const [existingCompany] = await db.query('SELECT id FROM companies WHERE gstNumber = ?', [gstNumber]);
    if (existingCompany.length > 0) {
      return res.status(400).json({ success: false, message: 'A company with this GST number already exists' });
    }

    const [companyInsert] = await db.query(
      `INSERT INTO companies (
        name, address, city, state, pinCode, gstNumber, panNumber,
        bankName, accountNumber, ifscCode, bankBranch, upiId, qrCodeData,
        logoUrl, udid, msmeRegistered, msmeNumber, msmeCategory, msmeType,
        tdsApplicable, tanNumber, tdsRate, dispatchName, dispatchContactPerson, dispatchContactPhone, isActive
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        name, address, city, state, pinCode,
        gstNumber.toUpperCase(), panNumber.toUpperCase(),
        bankName, accountNumber, ifscCode.toUpperCase(), bankBranch,
        upiId || null, qrCodeData || null, logoUrl, udid || null,
        msmeRegistered || false, msmeNumber || null, msmeCategory || null, msmeType || null,
        tdsApplicable || false, tanNumber || null, tdsRate || 0,
        dispatchName || null, dispatchContactPerson || null, dispatchContactPhone || null,
      ]
    );

    const companyId = companyInsert.insertId;

    // ── Save additional bank accounts if provided ──
    if (banks) {
      try {
        const banksArray = typeof banks === 'string' ? JSON.parse(banks) : banks;
        if (Array.isArray(banksArray) && banksArray.length > 0) {
          for (const bank of banksArray) {
            const bankId = `bank-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            await db.query(
              `INSERT INTO company_banks (id, companyId, bankName, bankBranch, accountNumber, ifscCode, accountType, isPrimary, upiId)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE bankName = VALUES(bankName)`,
              [
                bankId, companyId, bank.bankName, bank.bankBranch || null,
                bank.accountNumber, (bank.ifscCode || '').toUpperCase(),
                bank.accountType || 'current', bank.isPrimary ? 1 : 0,
                bank.upiId || null,
              ]
            ).catch(() => {}); // Silently skip if table doesn't exist yet
          }
        }
      } catch (_) {}
    }

    const [newCompany] = await db.query('SELECT * FROM companies WHERE id = ?', [companyId]);

    return res.status(201).json({ success: true, message: 'Company registered successfully', data: newCompany[0] });
  } catch (error) {
    console.error('Register company error:', error);
    return res.status(500).json({ success: false, message: 'Server error during company registration', error: error.message });
  }
};

/**
 * Get all companies
 */
export const getAllCompanies = async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userCompanyId = req.user?.companyId;

    const { search, page, limit, sortKey, sortDirection } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      name: 'name',
      location: 'city',
      gstNumber: 'gstNumber',
      panNumber: 'panNumber',
      bankName: 'bankName',
      status: 'isActive',
      createdAt: 'createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || 'createdAt';
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'asc'
      ? 'ASC'
      : String(sortDirection || '').toLowerCase() === 'desc'
        ? 'DESC'
        : 'DESC';

    // Preserve existing access logic: non-super-admin users only see their own company.
    const whereClauses = ['isActive = TRUE'];
    const params = [];

    if (userRole !== 'super_admin' && userCompanyId) {
      whereClauses.push('id = ?');
      params.push(userCompanyId);
    }

    if (search) {
      const term = `%${search}%`;
      whereClauses.push(`(
        name LIKE ? OR
        COALESCE(gstNumber, '') LIKE ? OR
        COALESCE(city, '') LIKE ?
      )`);
      params.push(term, term, term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`;

    let query = `SELECT * FROM companies ${whereSql} ${orderSql}`;

    let totalItems = null;
    if (paginationEnabled) {
      const [countRows] = await db.query(`SELECT COUNT(*) AS total FROM companies ${whereSql}`, params);
      totalItems = Number(countRows?.[0]?.total || 0);
      query += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (pageNumber - 1) * pageSize);
    }

    const [companies] = await db.query(query, params);

    const payload = { success: true, data: companies };
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
    console.error('Get companies error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching companies', error: error.message });
  }
};

/**
 * Get company by ID
 */
export const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    const [companies] = await db.query('SELECT * FROM companies WHERE id = ?', [id]);

    if (companies.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    // ── Try to fetch bank accounts from company_banks table ──
    let banks = [];
    try {
      const [bankRows] = await db.query(
        'SELECT * FROM company_banks WHERE companyId = ? ORDER BY isPrimary DESC, createdAt ASC',
        [id]
      );
      banks = bankRows;
    } catch (_) {}

    // Fallback: build single bank from main columns if no separate table rows
    if (banks.length === 0) {
      const c = companies[0];
      if (c.bankName || c.accountNumber) {
        banks = [{
          id: `legacy-${id}`,
          companyId: id,
          bankName: c.bankName || '',
          bankBranch: c.bankBranch || '',
          accountNumber: c.accountNumber || '',
          ifscCode: c.ifscCode || '',
          accountType: 'current',
          isPrimary: true,
          upiId: c.upiId || '',
        }];
      }
    }

    return res.json({ success: true, data: { ...companies[0], banks } });
  } catch (error) {
    console.error('Get company by ID error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching company', error: error.message });
  }
};

/**
 * Update company
 */
export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [existingCompany] = await db.query('SELECT id FROM companies WHERE id = ?', [id]);
    if (existingCompany.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const updateFields = [];
    const updateValues = [];

    const allowedFields = [
      'name', 'address', 'city', 'state', 'pinCode', 'gstNumber', 'panNumber',
      'bankName', 'accountNumber', 'ifscCode', 'bankBranch', 'upiId', 'qrCodeData',
      'udid', 'msmeRegistered', 'msmeNumber', 'msmeCategory', 'msmeType',
      'tdsApplicable', 'tanNumber', 'tdsRate', 'isActive', 'logoUrl',
      'dispatchName', 'dispatchContactPerson', 'dispatchContactPhone',
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(updateData[field]);
      }
    }

    if (req.file) {
      updateFields.push('logoUrl = ?');
      updateValues.push(`/uploads/companies/${req.file.filename}`);
    }

    if (updateFields.length > 0) {
      updateValues.push(id);
      await db.query(`UPDATE companies SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);
    }

    // ── Update bank accounts if provided ──
    if (updateData.banks) {
      try {
        const banksArray = typeof updateData.banks === 'string'
          ? JSON.parse(updateData.banks)
          : updateData.banks;
        if (Array.isArray(banksArray) && banksArray.length > 0) {
          // Delete old and re-insert
          await db.query('DELETE FROM company_banks WHERE companyId = ?', [id]).catch(() => {});
          for (const bank of banksArray) {
            const bankId = bank.id?.startsWith('legacy-') || !bank.id
              ? `bank-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
              : bank.id;
            await db.query(
              `INSERT INTO company_banks (id, companyId, bankName, bankBranch, accountNumber, ifscCode, accountType, isPrimary, upiId)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                bankId, id, bank.bankName, bank.bankBranch || null,
                bank.accountNumber, (bank.ifscCode || '').toUpperCase(),
                bank.accountType || 'current', bank.isPrimary ? 1 : 0,
                bank.upiId || null,
              ]
            ).catch(() => {});
          }
        }
      } catch (_) {}
    }

    const [updatedCompany] = await db.query('SELECT * FROM companies WHERE id = ?', [id]);

    // Re-fetch banks
    let banks = [];
    try {
      const [bankRows] = await db.query(
        'SELECT * FROM company_banks WHERE companyId = ? ORDER BY isPrimary DESC',
        [id]
      );
      banks = bankRows;
    } catch (_) {}

    if (banks.length === 0) {
      const c = updatedCompany[0];
      if (c.bankName || c.accountNumber) {
        banks = [{
          id: `legacy-${id}`, companyId: id,
          bankName: c.bankName || '', bankBranch: c.bankBranch || '',
          accountNumber: c.accountNumber || '', ifscCode: c.ifscCode || '',
          accountType: 'current', isPrimary: true, upiId: c.upiId || '',
        }];
      }
    }

    return res.json({ success: true, message: 'Company updated successfully', data: { ...updatedCompany[0], banks } });
  } catch (error) {
    console.error('Update company error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating company', error: error.message });
  }
};

/**
 * Toggle company active status
 */
export const toggleCompanyStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const [company] = await db.query('SELECT isActive FROM companies WHERE id = ?', [id]);
    if (company.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const newStatus = !company[0].isActive;
    await db.query('UPDATE companies SET isActive = ? WHERE id = ?', [newStatus, id]);

    return res.json({ success: true, message: `Company ${newStatus ? 'activated' : 'deactivated'} successfully`, data: { isActive: newStatus } });
  } catch (error) {
    console.error('Toggle company status error:', error);
    return res.status(500).json({ success: false, message: 'Server error toggling company status', error: error.message });
  }
};

/**
 * Delete company (soft delete)
 */
export const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const [company] = await db.query('SELECT id FROM companies WHERE id = ?', [id]);
    if (company.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    await db.query('UPDATE companies SET isActive = FALSE WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Delete company error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting company', error: error.message });
  }
};

/**
 * Hard delete company
 */
export const hardDeleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const [company] = await db.query('SELECT id FROM companies WHERE id = ?', [id]);
    if (company.length === 0) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    await db.query('DELETE FROM companies WHERE id = ?', [id]);

    return res.json({ success: true, message: 'Company permanently deleted from database' });
  } catch (error) {
    console.error('Hard delete company error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting company permanently', error: error.message });
  }
};
