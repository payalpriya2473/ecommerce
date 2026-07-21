// middleware/uploadItemImages.js
import multer from "multer";
import path from "path";
import fs from "fs";

// ── Ensure upload directories exist ──────────────────────────
const itemsDir       = "uploads/items";
const variantImgsDir = "uploads/item-variant-images";

if (!fs.existsSync(itemsDir))       fs.mkdirSync(itemsDir,       { recursive: true });
if (!fs.existsSync(variantImgsDir)) fs.mkdirSync(variantImgsDir, { recursive: true });

// ── Dynamic destination ───────────────────────────────────────
// productColorImages_<ci>_<i>  → uploads/item-variant-images/
// itemImages (legacy)          → uploads/items/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname.startsWith("productColorImages_")) {
      cb(null, variantImgsDir);
    } else {
      cb(null, itemsDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and WebP images are allowed"), false);
  }
};

// .any() so multer accepts arbitrary field names
export const uploadItemImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});