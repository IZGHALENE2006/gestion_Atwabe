import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const invoiceLogosDirectory = fileURLToPath(new URL("../uploads/invoice-logos/", import.meta.url));

export async function saveInvoiceLogo(file) {
  const extension = { "image/png": "png", "image/jpeg": "jpg" }[file.mimetype];
  if (!extension) throw new Error("logoTypeInvalid");
  await mkdir(invoiceLogosDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(invoiceLogosDirectory, filename), file.buffer, { flag: "wx" });
  return `/uploads/invoice-logos/${filename}`;
}

export async function deleteInvoiceLogo(logo) {
  if (typeof logo !== "string" || !/^\/uploads\/invoice-logos\/[a-f0-9-]{36}\.(jpg|png)$/.test(logo)) return;
  try {
    await unlink(path.join(invoiceLogosDirectory, path.basename(logo)));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Unable to remove invoice logo:", error.code);
  }
}
