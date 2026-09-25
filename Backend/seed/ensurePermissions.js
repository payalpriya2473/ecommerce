import db from '../config/db.js';

// ============================================================================
//  Permission seeder — runs on server startup.
//  Guarantees every module below has its permission rows in the `permissions`
//  table, so the RBAC "Create / Edit Role" screen always lists every module.
//  Idempotent: only inserts (module, action) pairs that don't already exist,
//  and never duplicates existing rows.
// ============================================================================

const FULL = ['view', 'create', 'edit', 'delete'];

// Canonical module → actions map. Action names match what already exists in the
// DB so nothing is duplicated (note: `sales` uses `update`, others use `edit`).
const PERMISSION_DEFS = [
  ['dashboard',         ['view']],
  ['companies',         FULL],
  ['branches',          FULL],
  ['departments',       FULL],
  ['designations',      FULL],
  ['employees',         FULL],
  ['suppliers',         FULL],
  ['technicians',       FULL],
  ['categories',        FULL],
  ['brands',            FULL],
  ['item_groups',       FULL],
  ['items',             FULL],
  ['purchase_orders',   FULL],
  ['purchase_invoices', FULL],
  ['incentive_logs',    FULL],
  ['roles',             FULL],
  ['invoice_settings',  ['view', 'edit']],
  ['reports',           ['view']],
  // Temporarily disabled: Colour Master permissions.
  // ['colors',            FULL],
  ['sales',             ['view', 'create', 'update', 'delete']],
  // Temporarily disabled: Finance Companies permissions.
  // ['finance_companies', FULL],
  ['live_stock',        FULL],
  ['online_orders',     ['view', 'edit']],
  ['analytics',         ['view']],
];

const ACTION_LABEL = { view: 'View', create: 'Create', edit: 'Edit', update: 'Edit', delete: 'Delete' };

const prettyModule = (m) => m.replace(/_/g, ' ');

export async function ensurePermissions() {
  try {
    let added = 0;

    // 1) Insert any missing permission rows.
    for (const [module, actions] of PERMISSION_DEFS) {
      for (const action of actions) {
        const [rows] = await db.query(
          'SELECT id FROM permissions WHERE module = ? AND action = ? LIMIT 1',
          [module, action]
        );
        if (!rows.length) {
          await db.query(
            'INSERT INTO permissions (module, action, description) VALUES (?, ?, ?)',
            [module, action, `${ACTION_LABEL[action] || action} ${prettyModule(module)}`]
          );
          added++;
        }
      }
    }

    // 2) Make sure the Super Admin system role holds every permission.
    await db.query(`
      INSERT INTO role_permissions (roleId, permissionId)
      SELECT r.id, p.id
      FROM roles r
      JOIN permissions p
      WHERE r.name = 'Super Admin'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.roleId = r.id AND rp.permissionId = p.id
        )
    `);

    if (added > 0) {
      console.log(`[permissions] seeded ${added} new permission row(s)`);
    } else {
      console.log('[permissions] all module permissions present');
    }
  } catch (err) {
    console.error('[permissions] ensurePermissions failed:', err.message);
  }
}

export default ensurePermissions;
