import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = "uploads/purchase-invoices";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName =
      `pi-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files allowed"), false);
  }
};

export const uploadPIImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});