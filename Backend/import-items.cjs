/**
 * ============================================================
 *  SAMSUNG EXCEL → motabhai_db IMPORTER  (FIXED)
 * ============================================================
 *
 *  DB Structure (from schema):
 *  ─────────────────────────────────────────────────────────
 *  categories   : id, name, isActive, ...
 *  brands       : id, name, isActive, ...
 *  item_groups  : id, categoryId, name, gst, isActive, ...
 *  items        : id, itemGroupId, brandId, itemName, variant, ...
 *                 ← NO categoryId on items table!
 *
 *  Excel column  →  DB destination
 *  ─────────────────────────────────────────────────────────
 *  HEAD          →  categories.name
 *  group1        →  item_groups.name  (item_groups.categoryId → category)
 *  brand         →  brands.name
 *  description   →  items.itemName
 *  Variant       →  items.variant
 *  opqty         →  items.openingStock
 *  minqty        →  items.minimumQty
 *  srate         →  items.offerPrice
 *  stkval        →  items.stockValue
 *  gst           →  items.gst  +  item_groups.gst
 *  uom           →  items.uom
 * ============================================================
 */

const XLSX  = require("xlsx");
const mysql = require("mysql2/promise");
const path  = require("path");

// ─── CONFIG — adjust if needed ─────────────────────────────────────────────
const DB_CONFIG = {
  host:     "localhost",
  user:     "root",
  password: "",
  database: "motabhai_db",
};

const EXCEL_FILE = path.join(__dirname, "samsung_ec_with_variant.xlsx");

// ─── DEMO DETECTION ────────────────────────────────────────────────────────
function isDemo(row) {
  const desc = String(row.description || "").trim();
  if (Number(row.demo) === 1) return true;
  if (/\s+D$/i.test(desc))    return true;   // ends with " D"
  if (/\s+DEMO$/i.test(desc)) return true;   // ends with " DEMO"
  if (/\bDEMO\b/i.test(desc)) return true;   // contains DEMO anywhere
  return false;
}

// ─── CACHE + DB HELPERS ────────────────────────────────────────────────────
const categoryCache  = {};  // name → id
const itemGroupCache = {};  // "groupName||categoryId" → id
const brandCache     = {};  // name → id

async function upsertCategory(conn, name) {
  if (!name) return null;
  const n = String(name).trim();
  if (!n) return null;
  if (categoryCache[n]) return categoryCache[n];

  const [rows] = await conn.execute(
    "SELECT id FROM categories WHERE name = ?", [n]
  );
  if (rows.length > 0) {
    categoryCache[n] = rows[0].id;
    return rows[0].id;
  }
  const [res] = await conn.execute(
    "INSERT INTO categories (name, isActive) VALUES (?, 1)", [n]
  );
  categoryCache[n] = res.insertId;
  return res.insertId;
}

async function upsertItemGroup(conn, groupName, categoryId, gst) {
  if (!groupName) return null;
  const n   = String(groupName).trim();
  if (!n) return null;
  const key = `${n}||${categoryId}`;
  if (itemGroupCache[key]) return itemGroupCache[key];

  const [rows] = await conn.execute(
    "SELECT id FROM item_groups WHERE name = ? AND (categoryId = ? OR (categoryId IS NULL AND ? IS NULL))",
    [n, categoryId, categoryId]
  );
  if (rows.length > 0) {
    itemGroupCache[key] = rows[0].id;
    return rows[0].id;
  }
  const [res] = await conn.execute(
    `INSERT INTO item_groups (categoryId, name, gst, hasDemoInstallation, maxQty, isActive)
     VALUES (?, ?, ?, 0, 0, 1)`,
    [categoryId || null, n, Number(gst) || 0]
  );
  itemGroupCache[key] = res.insertId;
  return res.insertId;
}

async function upsertBrand(conn, name) {
  if (!name) return null;
  const n = String(name).trim();
  if (!n) return null;
  if (brandCache[n]) return brandCache[n];

  const [rows] = await conn.execute(
    "SELECT id FROM brands WHERE name = ?", [n]
  );
  if (rows.length > 0) {
    brandCache[n] = rows[0].id;
    return rows[0].id;
  }
  const [res] = await conn.execute(
    "INSERT INTO brands (name, isActive) VALUES (?, 1)", [n]
  );
  brandCache[n] = res.insertId;
  return res.insertId;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function importExcel() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║    Samsung Excel → motabhai_db  (FIXED)     ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const conn = await mysql.createConnection(DB_CONFIG);

  try {

    // ── STEP 1 : CLEAR EXISTING DATA ───────────────────────────────
    console.log("🗑  Clearing existing data …");
    await conn.execute("SET FOREIGN_KEY_CHECKS = 0");

    await conn.execute("DELETE FROM item_variant_images");
    console.log("   ✓ item_variant_images cleared");

    await conn.execute("DELETE FROM item_variant_colors");
    console.log("   ✓ item_variant_colors cleared");

    await conn.execute("DELETE FROM item_images");
    console.log("   ✓ item_images cleared");

    await conn.execute("DELETE FROM items");
    console.log("   ✓ items cleared");

    await conn.execute("DELETE FROM item_groups");
    console.log("   ✓ item_groups cleared");

    await conn.execute("DELETE FROM categories");
    console.log("   ✓ categories cleared");

    await conn.execute("DELETE FROM brands");
    console.log("   ✓ brands cleared");

    await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
    console.log("");

    // ── STEP 2 : READ EXCEL ────────────────────────────────────────
    console.log("📂 Reading:", EXCEL_FILE);
    const workbook  = XLSX.readFile(EXCEL_FILE);
    const sheetName = workbook.SheetNames[0];
    console.log("   Sheet :", sheetName);
    const rawData   = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    console.log("   Rows  :", rawData.length, "\n");

    // ── STEP 3 : FILTER ────────────────────────────────────────────
    console.log("🔍 Filtering demo / empty rows …");
    const validRows  = [];
    let demoSkipped  = 0;
    let emptySkipped = 0;

    for (const row of rawData) {
      const desc = String(row.description || "").trim();
      if (!desc) { emptySkipped++; continue; }
      if (isDemo(row)) {
        console.log(`   ⏭  DEMO : ${desc}`);
        demoSkipped++;
        continue;
      }
      validRows.push({ ...row, description: desc });
    }

    console.log(`\n   Demo skipped  : ${demoSkipped}`);
    console.log(`   Empty skipped : ${emptySkipped}`);
    console.log(`   To import     : ${validRows.length}\n`);

    // ── STEP 4 : INSERT ────────────────────────────────────────────
    console.log("⬆️  Inserting …\n");
    let inserted = 0;

    for (const row of validRows) {

      // 1. Category  (HEAD column)
      const catId = await upsertCategory(conn, row.HEAD);

      // 2. Item Group  (group1 column) — linked to the category above
      const groupId = await upsertItemGroup(conn, row.group1, catId, row.gst);

      // 3. Brand  (brand column)
      const brandId = await upsertBrand(conn, row.brand);

      // 4. Variant from Excel "Variant" column
      const variant = String(row.Variant || row.variant || "").trim();

      // 5. Insert item  (NO categoryId column on items table!)
      await conn.execute(
        `INSERT INTO items (
          itemGroupId,
          brandId,
          itemName,
          variant,
          openingStock,
          minimumQty,
          maxMOPPercent,
          offerPrice,
          stockValue,
          margin,
          incentive,
          maxMOPAmount,
          nlc,
          sortOrder,
          uom,
          hsnCode,
          gst,
          hasDemoInstallation,
          freeService,
          billPrintNote,
          warranty,
          isActive
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 0, 0, 0, ?, '', ?, 0, '', '', '', 1)`,
        [
          groupId  || null,
          brandId  || null,
          row.description,
          variant,
          Number(row.opqty)  || 0,
          Number(row.minqty) || 0,
          Number(row.srate)  || 0,
          Number(row.stkval) || 0,
          row.uom || "PCS",
          Number(row.gst)    || 0,
        ]
      );

      inserted++;
      const v = variant ? `  [${variant}]` : "";
      const cat   = row.HEAD   ? ` | cat: ${row.HEAD}`   : "";
      const grp   = row.group1 ? ` | grp: ${row.group1}` : "";
      console.log(`   ✅ [${String(inserted).padStart(3)}] ${row.description}${v}${cat}${grp}`);
    }

    // ── DONE ────────────────────────────────────────────────────────
    console.log("");
    console.log("╔══════════════════════════════════════════════╗");
    console.log(`║   ✅  DONE  —  ${String(inserted).padEnd(4)} items imported         ║`);
    console.log("╚══════════════════════════════════════════════╝");

  } catch (err) {
    console.error("\n❌  ERROR:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

importExcel();
