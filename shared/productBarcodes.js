// Keep the full product identity and receipt number: no random collisions or
// barcode changes on retries. The numeric portion stays compact in CODE128.
export function generatedProductBatchBarcode(product, number) {
  const id = String(product?._id || "");
  if (!/^[a-f\d]{24}$/i.test(id) || !Number.isSafeInteger(number) || number < 1 || number > 9999) return "";
  return `B${BigInt(`0x${id}`).toString().padStart(29, "0")}${String(number).padStart(4, "0")}`;
}
export const isProductBatchBarcode = value => typeof value === "string" && /^B\d{33}$/i.test(value.trim());
export const normalizedProductBarcode = value => typeof value === "string" || typeof value === "number" ? String(value).trim().toUpperCase() : "";
export function productBatchBarcode(product, batch) {
  if (typeof batch.barcode === "string" && batch.barcode.trim()) return batch.barcode.trim();
  if (batch.batchId === "initial" && String(product?.barcode || "").trim()) return String(product.barcode).trim();
  return generatedProductBatchBarcode(product, batch.number);
}
