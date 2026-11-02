// The complete order ID gives old and new orders a stable, unique CODE128 value.
// No backfill or stock barcode changes are needed.
export function tailoringOrderBarcode(order) {
  const id = String(order && typeof order === "object" && "_id" in order ? order._id : order ?? "");
  return /^[a-f\d]{24}$/i.test(id) ? `FS-${id.toUpperCase()}` : "";
}

export function normalizeTailoringBarcode(raw) {
  if (typeof raw !== "string") return "";
  const value = raw.trim().toUpperCase();
  return /^FS-[A-F\d]{24}$/.test(value) ? value : "";
}
