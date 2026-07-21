import { db } from '../config/db.js';

// Register a new branch
export const registerBranch = async (req, res) => {
    try {
        const {
            companyId,
            name,
            type,
            operationModel,
            address,
            city,
            state,
            pinCode,
            gstNumber,
            panNumber,
            bankName,
            bankBranch,
            accountNumber,
            ifscCode,
            contactPhone,
            contactEmail,
        } = req.body;

        // Validation
        if (!companyId || !name || !type || !operationModel) {
            return res.status(400).json({
                success: false,
                message: 'Required fields are missing',
            });
        }

        // Check if company exists
        const [companyExists] = await db.query(
            'SELECT id FROM companies WHERE id = ?',
            [companyId]
        );

        if (companyExists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Company not found',
            });
        }

        // Insert branch
        const query = `
      INSERT INTO branches (
        companyId, name, type, operationModel, 
        address, city, state, pinCode, 
        gstNumber, panNumber, bankName, bankBranch, 
        accountNumber, ifscCode, contactPhone, contactEmail
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

        const [insertResult] = await db.query(query, [
            companyId,
            name,
            type,
            operationModel,
            address || null,
            city || null,
            state || null,
            pinCode || null,
            gstNumber || null,
            panNumber || null,
            bankName || null,
            bankBranch || null,
            accountNumber || null,
            ifscCode || null,
            contactPhone || null,
            contactEmail || null,
        ]);

        // Fetch the created branch
        const [newBranch] = await db.query(
            'SELECT * FROM branches WHERE id = ?',
            [insertResult.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Branch registered successfully',
            data: newBranch[0],
        });
    } catch (error) {
        console.error('Branch registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register branch',
            error: error.message,
        });
    }
};

// Get all branches (with optional company filter)
export const getAllBranches = async (req, res) => {
    try {
        const { companyId, search, page, limit, sortKey, sortDirection } = req.query;
        const userRole = req.user?.role;
        const userCompanyId = req.user?.companyId;

        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.max(1, parseInt(limit, 10) || 25);
        const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

        const sortFieldMap = {
            name: 'b.name',
            type: 'b.type',
            operationModel: 'b.operationModel',
            location: 'b.city',
            contact: 'b.contactPhone',
            createdAt: 'b.createdAt',
        };
        const resolvedSortField = sortFieldMap[sortKey] || 'b.createdAt';
        const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'asc'
            ? 'ASC'
            : String(sortDirection || '').toLowerCase() === 'desc'
                ? 'DESC'
                : 'DESC';

        const baseFrom = `
      FROM branches b
      LEFT JOIN companies c ON b.companyId = c.id
    `;
        const whereClauses = [];
        const params = [];

        // Role-based filtering (preserved)
        if (userRole === 'super_admin') {
            // Super admin can see all branches; optional companyId filter
            if (companyId) {
                whereClauses.push('b.companyId = ?');
                params.push(companyId);
            }
        } else {
            // company_admin and other roles - restrict to their own company
            whereClauses.push('b.companyId = ?');
            params.push(userCompanyId);
        }

        if (search) {
            const term = `%${search}%`;
            whereClauses.push(`(
                b.name LIKE ? OR
                COALESCE(b.city, '') LIKE ? OR
                COALESCE(b.type, '') LIKE ?
            )`);
            params.push(term, term, term);
        }

        const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`;

        let query = `
      SELECT b.*, c.name as companyName
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

        const [branches] = await db.query(query, params);

        const payload = { success: true, data: branches };
        if (paginationEnabled) {
            payload.pagination = {
                page: pageNumber,
                limit: pageSize,
                totalItems,
                totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
            };
        }

        res.json(payload);
    } catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch branches',
            error: error.message,
        });
    }
};

// Get branch by ID
export const getBranchById = async (req, res) => {
    try {
        const { id } = req.params;

        const [branch] = await db.query(
            `SELECT 
        b.*,
        c.name as companyName
      FROM branches b
      LEFT JOIN companies c ON b.companyId = c.id
      WHERE b.id = ?`,
            [id]
        );

        if (branch.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found',
            });
        }

        res.json({
            success: true,
            data: branch[0],
        });
    } catch (error) {
        console.error('Get branch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch branch',
            error: error.message,
        });
    }
};

// Update branch
export const updateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Check if branch exists
        const [branchExists] = await db.query(
            'SELECT id FROM branches WHERE id = ?',
            [id]
        );

        if (branchExists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found',
            });
        }

        // Build update query dynamically
        const allowedFields = [
            'name', 'type', 'operationModel', 'address', 'city', 'state',
            'pinCode', 'gstNumber', 'panNumber', 'bankName', 'bankBranch',
            'accountNumber', 'ifscCode', 'contactPhone', 'contactEmail'
        ];

        const updates = [];
        const values = [];

        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(updateData[field]);
            }
        });

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update',
            });
        }

        values.push(id);

        await db.query(
            `UPDATE branches SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
            values
        );

        // Fetch updated branch
        const [updatedBranch] = await db.query(
            'SELECT * FROM branches WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'Branch updated successfully',
            data: updatedBranch[0],
        });
    } catch (error) {
        console.error('Update branch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update branch',
            error: error.message,
        });
    }
};

// Delete branch
export const deleteBranch = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if branch exists
        const [branchExists] = await db.query(
            'SELECT id FROM branches WHERE id = ?',
            [id]
        );

        if (branchExists.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found',
            });
        }

        await db.query('DELETE FROM branches WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Branch deleted successfully',
        });
    } catch (error) {
        console.error('Delete branch error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete branch',
            error: error.message,
        });
    }
};

// Get branches by company ID
export const getBranchesByCompany = async (req, res) => {
    try {
        const { companyId } = req.params;

        const [branches] = await db.query(
            'SELECT * FROM branches WHERE companyId = ? ORDER BY createdAt DESC',
            [companyId]
        );

        res.json({
            success: true,
            data: branches,
        });
    } catch (error) {
        console.error('Get branches by company error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch branches',
            error: error.message,
        });
    }
};
