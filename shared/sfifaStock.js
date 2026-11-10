export const SFIFA_STOCK_WIDTHS = ["thin", "thick"];
export const SFIFA_STOCK_FAMILIES = [
  { value: "01-30", label: "01 -- 30", min: 1, max: 30 },
  { value: "1426-1432", label: "1426 -- 1432", min: 1426, max: 1432 },
  { value: "8080-8097", label: "8080 -- 8097", min: 8080, max: 8097 },
];
export const SFIFA_STOCK_LIMIT = 1000000;
export const SFIFA_STOCK_SCALE = 1000;
export const SFIFA_STOCK_GROUP_LIMIT = SFIFA_STOCK_LIMIT * 31;
export const SFIFA_METER_TYPES = ["single", "double", "gradient"];

export function sfifaStockStyles(stock, code) {
  const receipts = (stock?.receipts || []).filter(receipt => (receipt.code ?? null) === (code ?? null));
  return SFIFA_METER_TYPES.filter(style => receipts.some(receipt => (sfifaQuantityUnits(receipt.styleMeters?.[style]) ?? 0) > 0));
}

export function sfifaQuantityUnits(raw, { max = SFIFA_STOCK_LIMIT } = {}) {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const text = String(raw).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const units = Number(whole) * SFIFA_STOCK_SCALE + Number(fraction.padEnd(3, "0"));
  return Number.isSafeInteger(units) && units <= max * SFIFA_STOCK_SCALE ? units : null;
}
export function sfifaCodeNumber(raw, family) {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const text = String(raw).trim(), range = SFIFA_STOCK_FAMILIES.find(entry => entry.value === family);
  if (!range || !/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= range.min && value <= range.max ? value : null;
}
export function formatSfifaCode(code, family) {
  if (code === null || code === undefined) return "";
  return family === "01-30" ? String(code).padStart(2, "0") : String(code);
}
// An optional breakdown describes this addition, rather than current stock balances.
export function parseSfifaStyleMeters(raw) {
  if (raw === undefined) return undefined;
  const invalid = fields => Object.assign(new Error("invalidStock"), { fields });
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !SFIFA_METER_TYPES.includes(key))) throw invalid({ styleMeters: "invalidStyleMeters" });
  const blank = value => value === undefined || value === null || (typeof value === "string" && !value.trim());
  if (SFIFA_METER_TYPES.every(key => blank(raw[key]))) return undefined;
  const fields = {}, meters = {};
  let total = 0;
  for (const key of SFIFA_METER_TYPES) {
    const units = blank(raw[key]) ? 0 : sfifaQuantityUnits(raw[key]);
    if (units === null) fields[`styleMeters.${key}`] = "invalidBalance";
    else { meters[key] = units / SFIFA_STOCK_SCALE; total += units; }
  }
  if (total > SFIFA_STOCK_LIMIT * SFIFA_STOCK_SCALE) fields.quantity = "quantityLimit";
  if (Object.keys(fields).length) throw invalid(fields);
  return { meters, quantity: total / SFIFA_STOCK_SCALE };
}
export function validateSfifaStock(input, { allowZero = false } = {}) {
  const fields = {};
  if (!SFIFA_STOCK_WIDTHS.includes(input?.width)) fields.width = "invalidWidth";
  if (!SFIFA_STOCK_FAMILIES.some(family => family.value === input?.family)) fields.family = "invalidFamily";
  const code = sfifaCodeNumber(input?.code, input?.family);
  if (code === null) fields.code = "invalidCode";
  let styles;
  try { styles = parseSfifaStyleMeters(input?.styleMeters); }
  catch (error) { Object.assign(fields, error.fields); }
  const units = sfifaQuantityUnits(styles ? styles.quantity : input?.quantity);
  if (units === null || (!allowZero && units === 0)) fields.quantity ??= allowZero ? "invalidBalance" : "invalidQuantity";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidStock"), { fields });
  return { width: input.width, family: input.family, code, quantity: units / SFIFA_STOCK_SCALE, ...(styles ? { styleMeters: styles.meters } : {}) };
}

export function validateSfifaClassification(input, available) {
  const value = validateSfifaStock(input, { allowZero: available === 0 });
  if (sfifaQuantityUnits(value.quantity) > sfifaQuantityUnits(available)) throw Object.assign(new Error("invalidStock"), { fields: { quantity: "exceedsUnassigned" } });
  return value;
}
export function sfifaStockBarcode(stockOrId) {
  const id = String(stockOrId?._id ?? stockOrId ?? "");
  return /^[a-f\d]{24}$/i.test(id) ? "SF-" + id.toUpperCase() : "";
}
export function normalizeSfifaBarcode(raw) {
  const value = String(raw ?? "").trim().toUpperCase();
  return /^SF-[A-F\d]{24}$/.test(value) ? value : "";
}
export function filterSfifaStock(items, { width = "", family = "", code = "", barcode = "" } = {}) {
  const query = String(code).trim();
  const numeric = /^\d+$/.test(query) ? Number(query) : NaN;
  return items.filter(item => (!width || item.width === width) && (!family || item.family === family) && (!query || (!item.isUnassigned && item.code === numeric)) && (!String(barcode).trim() || (normalizeSfifaBarcode(barcode) && sfifaStockBarcode(item) === normalizeSfifaBarcode(barcode))));
}
export function sfifaStockTotals(items) {
  const units = items.reduce((sum, item) => {
    const value = sfifaQuantityUnits(item.quantity) ?? 0;
    sum.total += value;
    if (SFIFA_STOCK_WIDTHS.includes(item.width)) sum[item.width] += value;
    return sum;
  }, { total: 0, thick: 0, thin: 0 });
  return Object.fromEntries(Object.entries(units).map(([key, value]) => [key, value / SFIFA_STOCK_SCALE]));
}
