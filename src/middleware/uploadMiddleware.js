import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure folder exists
const uploadPath = "public/uploads/products";
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.originalname.replace(/\s+/g, "-").toLowerCase();
    cb(null, `${Date.now()}-${name}`);
  }
});

export const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    fieldSize: 10 * 1024 * 1024, // 10MB for text fields (increased!)
    fields: 50 // Allow up to 50 non-file fields
  }
});