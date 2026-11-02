import multer from "multer";

export const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE, files: 1, fields: 16, parts: 17, fieldSize: 16 * 1024 },
  fileFilter(_req, file, callback) {
    callback(imageTypes.has(file.mimetype) ? null : new Error("imageTypeInvalid"), imageTypes.has(file.mimetype));
  },
}).single("image");

export function uploadProductImage(req, res, next) {
  upload(req, res, (error) => {
    if (error) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      return res.status(tooLarge ? 413 : 400).json({
        message: tooLarge ? "imageTooLarge" : error.message === "imageTypeInvalid" ? "imageTypeInvalid" : "imageUploadInvalid",
      });
    }
    if (req.file) {
      const bytes = req.file.buffer;
      const valid = (req.file.mimetype === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        || (req.file.mimetype === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        || (req.file.mimetype === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
      if (!valid) return res.status(400).json({ message: "imageTypeInvalid" });
    }
    next();
  });
}
