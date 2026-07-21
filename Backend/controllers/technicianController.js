import { db } from "../config/db.js";

export const registerTechnician = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const photoUrl = req.file ? `/uploads/technicians/${req.file.filename}` : null;

    const {
      companyId, name, gender, mobile, email, gstNumber,
      address1, address2, address3, city, state, pinCode,
      panNo, uidNo, vehicleNumber, drivingLicense,
      specialization, experience, certifications, serviceAreas,
      joiningDate, resignDate, bankAccounts,
    } = req.body;

    // Auto-generate technicianNo
    const [[countRow]] = await connection.execute(`SELECT COUNT(*) as cnt FROM technicians`);
    const nextNum = String((countRow.cnt || 0) + 1).padStart(3, "0");
    const technicianNo = `TECH${nextNum}`;

    const certificationsJson = certifications
      ? JSON.stringify(typeof certifications === "string" ? JSON.parse(certifications) : certifications)
      : JSON.stringify([]);

    const serviceAreasJson = serviceAreas
      ? JSON.stringify(typeof serviceAreas === "string" ? JSON.parse(serviceAreas) : serviceAreas)
      : JSON.stringify([]);

  
    const [result] = await connection.execute(
      `INSERT INTO technicians
       (technicianNo, companyId, name, gender, mobile, email, gstNumber,
        address1, address2, address3, city, state, pinCode,
        panNo, uidNo, vehicleNumber, drivingLicense,
        specialization, experience, certifications, serviceAreas,
        joiningDate, resignDate, photoUrl, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        technicianNo, companyId || null, name,
        gender || "male", mobile, email || null, gstNumber || null,
        address1 || null, address2 || null, address3 || null,
        city || null, state || null, pinCode || null,
        panNo || null, uidNo || null, vehicleNumber || null, drivingLicense || null,
        specialization, parseInt(experience) || 0, certificationsJson, serviceAreasJson,
        joiningDate || null, resignDate || null, photoUrl,
      ]
    );

    const technicianId = result.insertId;

    
    if (bankAccounts) {
      const banks = typeof bankAccounts === "string" ? JSON.parse(bankAccounts) : bankAccounts;
      for (const bank of banks) {
        await connection.execute(
          `INSERT INTO technician_bank_accounts
           (technicianId, bankName, bankBranch, accountNo, ifscCode, accountHolderName, isPrimary)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            technicianId,
            bank.bankName || null, bank.bankBranch || null, bank.accountNo || null,
            bank.ifscCode || null, bank.accountHolderName || null, bank.isPrimary ? 1 : 0,
          ]
        );
      }
    }

    await connection.commit();
    res.status(201).json({
      success: true,
      data: { technicianId, technicianNo, photoUrl },
      message: "Technician registered successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Technician registration failed:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
};

export const uploadTechnicianDocument = async (req, res) => {
  try {
    const { technicianId } = req.params;
    const { documentType, documentName } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const fileUrl = `/uploads/technician-docs/${req.file.filename}`;

    
    const [result] = await db.execute(
      `INSERT INTO technician_documents (technicianId, documentType, documentName, fileUrl, fileSize, mimeType)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        technicianId, documentType || "Other",
        documentName || req.file.originalname,
        fileUrl, req.file.size, req.file.mimetype,
      ]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, fileUrl }, message: "Document uploaded" });
  } catch (err) {
    console.error("Document upload error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteTechnicianDocument = async (req, res) => {
  try {
    await db.execute(`DELETE FROM technician_documents WHERE id = ?`, [req.params.docId]);
    res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAllTechnicians = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const { search, status, page, limit, sortKey, sortDirection, companyId } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const normalizeCsv = (value) => String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const statuses = normalizeCsv(status).filter((entry) => entry === 'active' || entry === 'inactive');

    const sortFieldMap = {
      name: 't.name',
      specialization: 't.specialization',
      experience: 't.experience',
      mobile: 't.mobile',
      status: 't.isActive',
    };
    const resolvedSortField = sortFieldMap[sortKey] || 't.createdAt';
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : String(sortDirection || '').toLowerCase() === 'asc'
        ? 'ASC'
        : 'DESC';

    const baseFrom = `
      FROM technicians t
      LEFT JOIN companies c ON t.companyId = c.id
    `;
    const whereClauses = [];
    const params = [];

    // Preserve original behaviour: default to active-only unless caller asks otherwise.
    if (statuses.length === 1) {
      whereClauses.push('t.isActive = ?');
      params.push(statuses[0] === 'active' ? 1 : 0);
    } else if (statuses.length === 0) {
      whereClauses.push('t.isActive = 1');
    }

    if (companyId) {
      whereClauses.push('t.companyId = ?');
      params.push(companyId);
    }

    if (search) {
      const term = `%${search}%`;
      whereClauses.push(`(
        t.name LIKE ? OR
        COALESCE(t.specialization, '') LIKE ? OR
        COALESCE(t.mobile, '') LIKE ?
      )`);
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const orderSql = `ORDER BY ${resolvedSortField} ${resolvedSortDirection}, t.id DESC`;

    let query = `
      SELECT t.*, c.name as companyName
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

    const [rows] = await db.query(query, params);

    if (rows.length === 0) {
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


    const techIds = rows.map(t => t.id);
    const placeholders = techIds.map(() => '?').join(',');

    const [allBanks] = await db.execute(
      `SELECT * FROM technician_bank_accounts WHERE technicianId IN (${placeholders}) ORDER BY isPrimary DESC`,
      techIds
    );
    const [allDocs] = await db.execute(
      `SELECT * FROM technician_documents WHERE technicianId IN (${placeholders}) ORDER BY createdAt DESC`,
      techIds
    );

    // Group by technicianId
    const banksMap = {};
    const docsMap  = {};
    for (const b of allBanks) {
      if (!banksMap[b.technicianId]) banksMap[b.technicianId] = [];
      banksMap[b.technicianId].push(b);
    }
    for (const d of allDocs) {
      if (!docsMap[d.technicianId]) docsMap[d.technicianId] = [];
      docsMap[d.technicianId].push(d);
    }

    for (const t of rows) {
      t.bankAccounts = banksMap[t.id] || [];
      t.documents    = docsMap[t.id]  || [];
    }

    const payload = { success: true, data: rows };
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTechnicianById = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT t.*, c.name as companyName FROM technicians t
       LEFT JOIN companies c ON t.companyId = c.id WHERE t.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Technician not found" });

    const tech = rows[0];
    const [banks] = await db.execute(
      `SELECT * FROM technician_bank_accounts WHERE technicianId = ? ORDER BY isPrimary DESC`, [tech.id]
    );
    tech.bankAccounts = banks;
    const [docs] = await db.execute(
      `SELECT * FROM technician_documents WHERE technicianId = ? ORDER BY createdAt DESC`, [tech.id]
    );
    tech.documents = docs;
    res.json({ success: true, data: tech });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getTechniciansByCompany = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT t.* FROM technicians t WHERE t.companyId = ? AND t.isActive = 1 ORDER BY t.createdAt DESC`,
      [req.params.companyId]
    );

    if (rows.length > 0) {
   
      const techIds = rows.map(t => t.id);
      const placeholders = techIds.map(() => '?').join(',');
      const [allBanks] = await db.execute(
        `SELECT * FROM technician_bank_accounts WHERE technicianId IN (${placeholders}) ORDER BY isPrimary DESC`,
        techIds
      );
      const banksMap = {};
      for (const b of allBanks) {
        if (!banksMap[b.technicianId]) banksMap[b.technicianId] = [];
        banksMap[b.technicianId].push(b);
      }
      for (const t of rows) {
        t.bankAccounts = banksMap[t.id] || [];
      }
    }

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTechnician = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const photoUrl = req.file ? `/uploads/technicians/${req.file.filename}` : null;

    const ALLOWED = [
      "name", "gender", "mobile", "email", "gstNumber",
      "address1", "address2", "address3", "city", "state", "pinCode",
      "panNo", "uidNo", "vehicleNumber", "drivingLicense",
      "specialization", "experience", "certifications", "serviceAreas",
      "joiningDate", "resignDate", "salaryType", "fixedSalary", "commissionRate",
    ];

    const { bankAccounts, ...rest } = req.body;
    const updates = {};
    for (const key of ALLOWED) {
      if (rest[key] !== undefined) updates[key] = rest[key] === "" ? null : rest[key];
    }
    if (photoUrl) updates.photoUrl = photoUrl;

    if (updates.certifications && typeof updates.certifications === "string") {
      try { JSON.parse(updates.certifications); } catch { updates.certifications = "[]"; }
    }
    if (updates.serviceAreas && typeof updates.serviceAreas === "string") {
      try { JSON.parse(updates.serviceAreas); } catch { updates.serviceAreas = "[]"; }
    }

    if (Object.keys(updates).length > 0) {
      const fields = Object.keys(updates).map((k) => `\`${k}\` = ?`).join(", ");
      await connection.execute(`UPDATE technicians SET ${fields} WHERE id = ?`, [...Object.values(updates), req.params.id]);
    }

    if (bankAccounts) {
      const banks = typeof bankAccounts === "string" ? JSON.parse(bankAccounts) : bankAccounts;
      await connection.execute(`DELETE FROM technician_bank_accounts WHERE technicianId = ?`, [req.params.id]);
      for (const bank of banks) {
      
        await connection.execute(
          `INSERT INTO technician_bank_accounts
           (technicianId, bankName, bankBranch, accountNo, ifscCode, accountHolderName, isPrimary)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.id,
            bank.bankName || null, bank.bankBranch || null, bank.accountNo || null,
            bank.ifscCode || null, bank.accountHolderName || null, bank.isPrimary ? 1 : 0,
          ]
        );
      }
    }

    await connection.commit();
    res.json({ success: true, message: "Technician updated successfully" });
  } catch (err) {
    await connection.rollback();
    console.error("Technician update failed:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
};

export const deleteTechnician = async (req, res) => {
  try {
    await db.execute(`DELETE FROM technicians WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: "Technician deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};