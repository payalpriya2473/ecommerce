import { db } from '../config/db.js';

// Helper: sync contacts for a finance company
async function syncContacts(financeCompanyId, contactPersons = []) {
    await db.query(
        'UPDATE finance_company_contacts SET isActive = 0 WHERE financeCompanyId = ?',
        [financeCompanyId]
    );

    if (!Array.isArray(contactPersons) || contactPersons.length === 0) return;

    const validContacts = contactPersons.filter(
        (c) => c && (c.name || '').trim()
    );
    if (validContacts.length === 0) return;

    const values = validContacts.map((c) => [
        financeCompanyId,
        (c.name || '').trim(),
        (c.mobile || '').trim() || null,
        (c.email || '').trim() || null,
        (c.panNumber || '').trim().toUpperCase() || null,
    ]);

    await db.query(
        `INSERT INTO finance_company_contacts
       (financeCompanyId, name, mobile, email, panNumber)
     VALUES ?`,
        [values]
    );
}

// Helper: fetch active contacts for a finance company
async function fetchContacts(financeCompanyId) {
    const [rows] = await db.query(
        `SELECT id, name, mobile, email, panNumber
     FROM finance_company_contacts
     WHERE financeCompanyId = ? AND isActive = 1
     ORDER BY id ASC`,
        [financeCompanyId]
    );
    return rows;
}

// Helper: attach contacts array to a finance company record
async function withContacts(fc) {
    const contacts = await fetchContacts(fc.id);
    return { ...fc, contactPersons: contacts };
}

// Register a new finance company
export const registerFinanceCompany = async (req, res) => {
    try {
        const {
            name, address, city, pinCode, gstNumber,
            contactPersons,
            contactPersonName, mobile, email, panNumber,
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Finance company name is required' });
        }

        const [existing] = await db.query(
            'SELECT id FROM finance_companies WHERE name = ? AND isActive = 1',
            [name.trim()]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'A finance company with this name already exists' });
        }

        const contacts =
            Array.isArray(contactPersons) && contactPersons.length > 0
                ? contactPersons
                : [{ name: contactPersonName, mobile, email, panNumber }];

        const [result] = await db.query(
            `INSERT INTO finance_companies (name, address, city, pinCode, gstNumber)
       VALUES (?, ?, ?, ?, ?)`,
            [
                name.trim(),
                address?.trim() || null,
                city?.trim() || null,
                pinCode?.trim() || null,
                gstNumber?.trim().toUpperCase() || null,
            ]
        );

        const insertedId = result.insertId;
        await syncContacts(insertedId, contacts);

        const [newRow] = await db.query(
            'SELECT * FROM finance_companies WHERE id = ?',
            [insertedId]
        );
        const record = await withContacts(newRow[0]);

        return res.status(201).json({
            success: true,
            message: 'Finance company registered successfully',
            data: record,
        });
    } catch (error) {
        console.error('Register finance company error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to register finance company',
            error: error.message,
        });
    }
};

// Get all finance companies
export const getAllFinanceCompanies = async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        const { search, page, limit, sortKey, sortDirection } = req.query;

        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.max(1, parseInt(limit, 10) || 25);
        const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

        // Primary contact = lowest-id active contact for each finance company.
        // Used so contact/mobile/pan can participate in search + sort at the DB level.
        const primaryContactJoin = `
            LEFT JOIN finance_company_contacts pc
              ON pc.financeCompanyId = fc.id
              AND pc.isActive = 1
              AND pc.id = (
                SELECT MIN(c2.id) FROM finance_company_contacts c2
                WHERE c2.financeCompanyId = fc.id AND c2.isActive = 1
              )
        `;
        const baseFrom = ` FROM finance_companies fc ${primaryContactJoin} `;

        const sortFieldMap = {
            name: 'fc.name',
            city: 'fc.city',
            contact: 'pc.name',
            mobile: 'pc.mobile',
            pan: 'pc.panNumber',
            gst: 'fc.gstNumber',
        };
        const resolvedSortField = sortFieldMap[sortKey] || null;
        const requestedDir = String(sortDirection || '').toLowerCase();
        const resolvedSortDirection = requestedDir === 'desc' ? 'DESC' : requestedDir === 'asc' ? 'ASC' : 'ASC';

        const whereClauses = ['fc.isActive = 1'];
        const params = [];

        if (search) {
            const term = `%${search}%`;
            whereClauses.push(`(
                fc.name LIKE ?
                OR COALESCE(fc.city, '') LIKE ?
                OR COALESCE(fc.gstNumber, '') LIKE ?
                OR COALESCE(pc.name, '') LIKE ?
                OR COALESCE(pc.mobile, '') LIKE ?
            )`);
            params.push(term, term, term, term, term);
        }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
        // Default order preserves existing behaviour (newest first); explicit sortKey overrides.
        const orderSql = resolvedSortField
            ? `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`
            : 'ORDER BY fc.createdAt DESC';

        let query = `SELECT fc.* ${baseFrom} ${whereSql} ${orderSql}`;

        let totalItems = null;
        if (paginationEnabled) {
            const [countRows] = await db.query(`SELECT COUNT(*) AS total ${baseFrom} ${whereSql}`, params);
            totalItems = Number(countRows?.[0]?.total || 0);
            query += ' LIMIT ? OFFSET ?';
            params.push(pageSize, (pageNumber - 1) * pageSize);
        }

        const [rows] = await db.query(query, params);

        if (rows.length === 0) {
            const emptyPayload = { success: true, data: [] };
            if (paginationEnabled) {
                emptyPayload.pagination = {
                    page: pageNumber,
                    limit: pageSize,
                    totalItems: totalItems ?? 0,
                    totalPages: Math.max(1, Math.ceil((totalItems ?? 0) / pageSize)),
                };
            }
            return res.status(200).json(emptyPayload);
        }

        // ✅ Batch fetch all contacts in one query instead of N queries via Promise.all
        const ids = rows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const [allContacts] = await db.query(
            `SELECT id, financeCompanyId, name, mobile, email, panNumber
             FROM finance_company_contacts
             WHERE financeCompanyId IN (${placeholders}) AND isActive = 1
             ORDER BY financeCompanyId, id ASC`,
            ids
        );

        // Group contacts by financeCompanyId
        const contactsMap = {};
        for (const c of allContacts) {
            if (!contactsMap[c.financeCompanyId]) contactsMap[c.financeCompanyId] = [];
            contactsMap[c.financeCompanyId].push(c);
        }

        const data = rows.map(fc => ({
            ...fc,
            contactPersons: contactsMap[fc.id] || [],
        }));

        const payload = { success: true, data };
        if (paginationEnabled) {
            payload.pagination = {
                page: pageNumber,
                limit: pageSize,
                totalItems,
                totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
            };
        }
        return res.status(200).json(payload);
    } catch (error) {
        console.error('Get finance companies error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch finance companies',
            error: error.message,
        });
    }
};

// Get finance company by ID
export const getFinanceCompanyById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(
            'SELECT * FROM finance_companies WHERE id = ?',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Finance company not found' });
        }
        const record = await withContacts(rows[0]);
        return res.status(200).json({ success: true, data: record });
    } catch (error) {
        console.error('Get finance company error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch finance company',
            error: error.message,
        });
    }
};

// Update finance company
export const updateFinanceCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const { contactPersons, name, address, city, pinCode, gstNumber } = req.body;

        const [existing] = await db.query(
            'SELECT id FROM finance_companies WHERE id = ?',
            [id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Finance company not found' });
        }

        const allowedFields = { name, address, city, pinCode, gstNumber };
        const updates = [];
        const values = [];

        Object.entries(allowedFields).forEach(([field, value]) => {
            if (value !== undefined) {
                updates.push(`\`${field}\` = ?`);
                values.push(
                    value === '' ? null : (typeof value === 'string' ? value.trim() : value)
                );
            }
        });

        if (updates.length > 0) {
            values.push(id);
            await db.query(
                `UPDATE finance_companies SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                values
            );
        }

        if (Array.isArray(contactPersons) && contactPersons.length > 0) {
            await syncContacts(id, contactPersons);
        }

        const [updated] = await db.query(
            'SELECT * FROM finance_companies WHERE id = ?',
            [id]
        );
        const record = await withContacts(updated[0]);

        return res.status(200).json({
            success: true,
            message: 'Finance company updated successfully',
            data: record,
        });
    } catch (error) {
        console.error('Update finance company error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update finance company',
            error: error.message,
        });
    }
};

// Delete (soft delete)
export const deleteFinanceCompany = async (req, res) => {
    try {
        const { id } = req.params;
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');

        const [existing] = await db.query(
            'SELECT id FROM finance_companies WHERE id = ?',
            [id]
        );
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Finance company not found' });
        }

        await db.query(
            'UPDATE finance_companies SET isActive = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );

        return res.status(200).json({ success: true, message: 'Finance company deleted successfully' });
    } catch (error) {
        console.error('Delete finance company error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete finance company',
            error: error.message,
        });
    }
};

// Get by company - kept for route compatibility, now returns all active records
export const getFinanceCompaniesByCompany = async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');

        const [rows] = await db.query(
            'SELECT * FROM finance_companies WHERE isActive = 1 ORDER BY createdAt DESC'
        );

        if (rows.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const ids = rows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const [allContacts] = await db.query(
            `SELECT id, financeCompanyId, name, mobile, email, panNumber
             FROM finance_company_contacts
             WHERE financeCompanyId IN (${placeholders}) AND isActive = 1
             ORDER BY financeCompanyId, id ASC`,
            ids
        );

        const contactsMap = {};
        for (const c of allContacts) {
            if (!contactsMap[c.financeCompanyId]) contactsMap[c.financeCompanyId] = [];
            contactsMap[c.financeCompanyId].push(c);
        }

        const data = rows.map(fc => ({
            ...fc,
            contactPersons: contactsMap[fc.id] || [],
        }));

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get finance companies by company error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch finance companies',
            error: error.message,
        });
    }
};
