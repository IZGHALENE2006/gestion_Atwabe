import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const fabricPhotosDirectory = path.resolve(process.env.FABRIC_PHOTOS_DIRECTORY || fileURLToPath(new URL("../uploads/fabrics/", import.meta.url)));
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export function fabricPhotoPath(filename) {
  return typeof filename === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(jpg|png|webp)$/.test(filename) ? path.join(fabricPhotosDirectory, filename) : null;
}
export async function saveFabricPhoto(file) {
  if (!file) return "";
  const extension = extensions[file.mimetype];
  if (!extension) throw new Error("imageTypeInvalid");
  await mkdir(fabricPhotosDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(fabricPhotoPath(filename), file.buffer, { flag: "wx" });
  return filename;
}
export async function deleteFabricPhoto(filename) {
  const destination = fabricPhotoPath(filename);
  if (!destination) return;
  try { await unlink(destination); }
  catch (error) { if (error.code !== "ENOENT") console.error("Unable to remove fabric photo:", error.code); }
}
