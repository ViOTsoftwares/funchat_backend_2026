import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure upload directories exist
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

ensureDir("src/uploads/logos");
ensureDir("src/uploads/community");

// Storage config for Logos / Thumbnails
const LogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir("src/uploads/logos");
    cb(null, "src/uploads/logos");
  },
  filename: (_req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

// Storage config for Community Chat Images
const CommunityImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir("src/uploads/community");
    cb(null, "src/uploads/community");
  },
  filename: (_req, file, cb) => {
    const uniqueName = "comm_" + Date.now() + "_" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

// Image-only filter
const fileFilter = (_req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg", "image/gif"];

  if (!allowedTypes.includes(file.mimetype)) {
    cb(new Error("Only image files (PNG, JPG, WEBP, GIF) are allowed"));
  } else {
    cb(null, true);
  }
};

// Multer instance for logos (2MB)
export const uploadLogo = multer({
  storage: LogoStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter,
});

// Multer instance for community chat images (5MB max)
export const uploadCommunityImage = multer({
  storage: CommunityImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter,
});

