    import multer from "multer";
    import path from "path";
    import fs from "fs";

    const uploadDir = "uploads/brands";
    if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    }

    const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = `brand-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, uniqueName + path.extname(file.originalname));
    },
    });

    const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Only image files are allowed"), false);
    }
    };

    export const uploadBrandIcon = multer({
    storage,
    fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
    });