import multer from "multer";
import { Buffer } from "node:buffer";

export const MAX_INVOICE_LOGO_SIZE = 2 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INVOICE_LOGO_SIZE, files: 1, fields: 2, parts: 3, fieldSize: 16 * 1024 },
  fileFilter(_req, file, callback) {
    const valid = ["image/png", "image/jpeg"].includes(file.mimetype);
    callback(valid ? null : new Error("logoTypeInvalid"), valid);
  },
}).single("logo");

export function uploadInvoiceLogo(req, res, next) {
  upload(req, res, (error) => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      message: error.code === "LIMIT_FILE_SIZE" ? "logoTooLarge" : error.message === "logoTypeInvalid" ? "logoTypeInvalid" : "invalidSettings",
    });
    if (req.file) {
      const bytes = req.file.buffer;
      const valid = (req.file.mimetype === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        || (req.file.mimetype === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
      if (!valid) return res.status(400).json({ message: "logoTypeInvalid" });
    }
    next();
  });
}
