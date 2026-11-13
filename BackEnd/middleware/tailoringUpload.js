import multer from "multer";
import { MAX_TAILORING_ITEMS } from "../../shared/tailoring.js";

const types = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_TAILORING_ITEMS, fields: 32, parts: MAX_TAILORING_ITEMS + 32, fieldSize: 512 * 1024 },
  fileFilter(_req, file, callback) { callback(types.has(file.mimetype) ? null : new Error("imageTypeInvalid"), types.has(file.mimetype)); },
}).fields([{ name: "image", maxCount: 1 }, { name: "images", maxCount: MAX_TAILORING_ITEMS }]);
export function uploadTailoringImages(req, res, next) {
  upload(req, res, error => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: error.code === "LIMIT_FILE_SIZE" ? "imageTooLarge" : error.message === "imageTypeInvalid" ? "imageTypeInvalid" : "imageUploadInvalid" });
    const files = Object.values(req.files || {}).flat();
    if (files.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024) return res.status(413).json({ message: "imagesTotalTooLarge" });
    for (const file of files) {
      const bytes = file.buffer;
      const valid = (file.mimetype === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        || (file.mimetype === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        || (file.mimetype === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
      if (!valid) return res.status(400).json({ message: "imageTypeInvalid" });
    }
    req.file = req.files?.image?.[0];
    next();
  });
}
