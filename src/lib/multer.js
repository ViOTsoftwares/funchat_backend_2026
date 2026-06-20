import multer from "multer";
import path from "path";

// Storage config
const LogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "src/uploads/logos");
  },
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

// Image-only filter
const fileFilter = (_req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

  if (!allowedTypes.includes(file.mimetype)) {
    cb(new Error("Only image files (PNG, JPG, WEBP) are allowed"));
  } else {
    cb(null, true);
  }
};

// Multer instance
export const uploadLogo = multer({
  storage:LogoStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter,
});
