import { db } from '../config/db.js';
import fs from 'fs';

// ── helpers ──────────────────────────────────────────────────────────────────

const buildSlug = (name) =>
  String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};


export const registerCategory = async (req, res) => {
  try {
    const {
      name,
      marginPercent,
      description,
      displayOrder,
      showOnWebsite,
      metaTitle,
      metaDescription,
      seoHeading,
      parentCategoryId,
    } = req.body;


    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    if (marginPercent === undefined || marginPercent === null || Number(marginPercent) < 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid margin percentage is required (0 or above)',
      });
    }


    
    let slug = req.body.slug?.trim() || buildSlug(name);

    
    const [slugCheck] = await db.query(
      'SELECT id FROM categories WHERE slug = ?',
      [slug]
    );
    if (slugCheck.length > 0) slug = `${slug}-${Date.now()}`;

  
    const [existing] = await db.query(
      'SELECT id FROM categories WHERE name = ? AND isActive = 1',
      [name.trim()]
    );
    if (existing.length > 0)
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });

    // ── uploaded file paths ───────────────────────────────────────────────────
    const categoryImage = req.files?.categoryImage?.[0]?.path || null;

    // ── insert ────────────────────────────────────────────────────────────────
    const [result] = await db.query(
      `INSERT INTO categories
         (name, marginPercent, slug, description, category_image,
          display_order, show_on_website, meta_title, meta_description, seo_heading,
          parent_category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        parseFloat(marginPercent) || 0,
        slug,
        description?.trim() || null,
        categoryImage,
        displayOrder !== undefined ? parseInt(displayOrder, 10) : 0,
        showOnWebsite === 'true' || showOnWebsite === true ? 1 : 0,
        metaTitle?.trim()       || null,
        metaDescription?.trim() || null,
        seoHeading?.trim()      || null,
        parentCategoryId        || null,
      ]
    );

    const [newCategory] = await db.query(
      `SELECT c.*
       FROM categories c
       WHERE c.id = ?`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Category registered successfully',
      data: newCategory[0],
    });
  } catch (error) {
    console.error('Register category error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to register category', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get all categories
// ─────────────────────────────────────────────────────────────────────────────
export const getAllCategories = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const { search, page, limit, sortKey, sortDirection } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 25);
    const paginationEnabled = Number.isFinite(parseInt(page, 10)) && Number.isFinite(parseInt(limit, 10));

    const sortFieldMap = {
      name: 'c.name',
      marginPercent: 'c.marginPercent',
      displayOrder: 'c.display_order',
      createdAt: 'c.createdAt',
    };
    const resolvedSortField = sortFieldMap[sortKey] || null;
    const resolvedSortDirection = String(sortDirection || '').toLowerCase() === 'desc'
      ? 'DESC'
      : 'ASC';

    const baseFrom = `
      FROM categories c
    `;
    const whereClauses = ['c.isActive = 1'];
    const params = [];

    if (search) {
      const term = `%${search}%`;
      whereClauses.push('c.name LIKE ?');
      params.push(term);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    // Preserve the existing default ordering when no explicit sort is requested.
    const orderSql = resolvedSortField
      ? `ORDER BY ${resolvedSortField} ${resolvedSortDirection}`
      : 'ORDER BY c.display_order ASC, c.createdAt DESC';

    let query = `
      SELECT c.*
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

    const [categories] = await db.query(query, params);
    const payload = { success: true, data: categories };
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
    console.error('Get categories error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch categories', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get category by ID
// ─────────────────────────────────────────────────────────────────────────────
export const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const [category] = await db.query(
      `SELECT c.*
       FROM categories c
       WHERE c.id = ?`,
      [id]
    );
    if (category.length === 0)
      return res.status(404).json({ success: false, message: 'Category not found' });

    return res.status(200).json({ success: true, data: category[0] });
  } catch (error) {
    console.error('Get category error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch category', error: error.message });
  }
};


export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: 'Category not found' });

    const current = existing[0];

    const {
      name,
      marginPercent,
      description,
      displayOrder,
      showOnWebsite,
      metaTitle,
      metaDescription,
      seoHeading,
      parentCategoryId,
    } = req.body;

    const updates = [];
    const values  = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());

      // regenerate slug if name changes
      const newSlug = req.body.slug?.trim() || buildSlug(name);
      updates.push('slug = ?');
      values.push(newSlug);
    }
    if (marginPercent !== undefined)   { updates.push('marginPercent = ?');    values.push(parseFloat(marginPercent)); }
    if (description !== undefined)     { updates.push('description = ?');      values.push(description?.trim() || null); }
    if (displayOrder !== undefined)    { updates.push('display_order = ?');    values.push(parseInt(displayOrder, 10)); }
    if (showOnWebsite !== undefined)   { updates.push('show_on_website = ?');  values.push(showOnWebsite === 'true' || showOnWebsite === true ? 1 : 0); }
    if (metaTitle !== undefined)       { updates.push('meta_title = ?');       values.push(metaTitle?.trim() || null); }
    if (metaDescription !== undefined) { updates.push('meta_description = ?'); values.push(metaDescription?.trim() || null); }
    if (seoHeading !== undefined)      { updates.push('seo_heading = ?');      values.push(seoHeading?.trim() || null); }
    if (parentCategoryId !== undefined){ updates.push('parent_category_id = ?'); values.push(parentCategoryId || null); }

    // ── handle new image uploads & clean up old files ─────────────────────────
    if (req.files?.categoryImage?.[0]) {
      deleteFile(current.category_image);
      updates.push('category_image = ?');
      values.push(req.files.categoryImage[0].path);
    }

    if (updates.length === 0)
      return res.status(400).json({ success: false, message: 'No valid fields to update' });

    values.push(id);
    await db.query(
      `UPDATE categories SET ${updates.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    const [updated] = await db.query(
      `SELECT c.*
       FROM categories c
       WHERE c.id = ?`,
      [id]
    );
    return res.status(200).json({ success: true, message: 'Category updated successfully', data: updated[0] });
  } catch (error) {
    console.error('Update category error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to update category', error: error.message });
  }
};


export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');

    const [existing] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
    if (existing.length === 0)
      return res.status(404).json({ success: false, message: 'Category not found' });

    // clean up images
    deleteFile(existing[0].category_image);

    await db.query('DELETE FROM categories WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to delete category', error: error.message });
  }
};

