import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const tailoringPhotosDirectory = path.resolve(process.env.TAILORING_PHOTOS_DIRECTORY || fileURLToPath(new URL("../uploads/tailoring/", import.meta.url)));
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export function tailoringPhotoPath(filename) {
  return typeof filename === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(jpg|png|webp)$/.test(filename) ? path.join(tailoringPhotosDirectory, filename) : null;
}
export async function saveTailoringPhoto(file) {
  if (!file) return "";
  const extension = extensions[file.mimetype];
  if (!extension) throw new Error("imageTypeInvalid");
  await mkdir(tailoringPhotosDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(tailoringPhotoPath(filename), file.buffer, { flag: "wx" });
  return filename;
}
export async function deleteTailoringPhoto(filename) {
  const destination = tailoringPhotoPath(filename);
  if (!destination) return;
  try { await unlink(destination); }
  catch (error) { if (error.code !== "ENOENT") console.error("Unable to remove tailoring photo:", error.code); }
}
