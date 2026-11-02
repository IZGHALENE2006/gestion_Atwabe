import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const productImagesDirectory = fileURLToPath(new URL("../uploads/products/", import.meta.url));
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function saveProductImage(file) {
  if (!file) return "";
  const extension = extensions[file.mimetype];
  if (!extension) throw new Error("imageTypeInvalid");
  await mkdir(productImagesDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(productImagesDirectory, filename), file.buffer, { flag: "wx" });
  return `/uploads/products/${filename}`;
}

export async function deleteProductImage(image) {
  // Only this application's generated filenames may be removed.
  if (typeof image !== "string" || !/^\/uploads\/products\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(image)) return;
  try {
    await unlink(path.join(productImagesDirectory, path.basename(image)));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Unable to remove product image:", error.code);
  }
}
