import multer from "multer";
import path from "path";
import fs from "fs";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use a temporary uploads folder first
    const uploadPath = path.join("uploads", "temp");
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const name = file.originalname.replace(/\s+/g, "-").toLowerCase();
    cb(null, name);
  }
});

export const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    fieldSize: 50 * 1024 * 1024,
    fields: 50,
    files: 20
  }
});