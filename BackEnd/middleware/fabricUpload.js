import multer from "multer";

const types = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 512 * 1024 },
  fileFilter(_req, file, callback) { callback(types.has(file.mimetype) ? null : new Error("imageTypeInvalid"), types.has(file.mimetype)); },
}).single("image");

export function uploadFabricPhoto(req, res, next) {
  upload(req, res, error => {
    if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: error.code === "LIMIT_FILE_SIZE" ? "imageTooLarge" : error.message === "imageTypeInvalid" ? "imageTypeInvalid" : "imageUploadInvalid" });
    if (req.is("multipart/form-data")) {
      try {
        if (typeof req.body?.data !== "string" || Object.keys(req.body).length !== 1) throw new Error();
        const data = JSON.parse(req.body.data);
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
        req.body = data;
      } catch { return res.status(400).json({ message: "imageUploadInvalid" }); }
    }
    if (req.body?.removePhoto !== undefined && typeof req.body.removePhoto !== "boolean") return res.status(400).json({ message: "imageUploadInvalid" });
    if (req.file) {
      const { buffer: bytes, mimetype } = req.file;
      const valid = (mimetype === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        || (mimetype === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
        || (mimetype === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
      if (!valid) return res.status(400).json({ message: "imageTypeInvalid" });
    }
    next();
  });
}
