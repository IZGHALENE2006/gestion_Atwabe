import { normalizeTailoringBarcode, tailoringOrderBarcode } from "./tailoringBarcode.js";

export const TAILORING_SOURCES = ["shop", "client"];
export const SFIFA_WIDTHS = ["thin", "thick"];
export const SFIFA_STYLES = ["fabric", "twoTone", "gradient"];
export const MAX_TAILORING_ITEMS = 50;
export const TAILORING_GARMENT_TYPES = ["djellaba", "trousers", "shirts", "jabador", "malakiya"];
export const TAILORING_SFIFA_GARMENT_TYPES = ["djellaba", "jabador", "malakiya"];
export const TAILORING_TROUSER_TYPES = ["regular", "qandrissi"];

// Records created before the trousers section belong to the djellaba section.
export const tailoringGarmentType = order => order?.garmentType || "djellaba";
export const tailoringUsesSfifa = order => TAILORING_SFIFA_GARMENT_TYPES.includes(tailoringGarmentType(order));
export const tailoringHasExpenses = order => ["trousers", "shirts"].includes(tailoringGarmentType(order));
export function tailoringProfitAmount(totalPrice, expenseAmount) {
  const total = tailoringMoneyCents(totalPrice), expenses = tailoringMoneyCents(expenseAmount);
  return total === null || expenses === null ? null : (total - expenses) / 100;
}

// Parse decimal money into integer centimes before comparing or subtracting it.
export function tailoringMoneyCents(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 99999999999 ? cents : null;
}

export function tailoringFabricMeters(value) {
  const text = (typeof value === "number" || typeof value === "string" ? String(value).trim() : "")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace(/٫/g, ".").replace(",", ".");
  const meters = /^\d+(?:\.\d{1,3})?$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(meters) && meters > 0 && meters <= 1000000 ? meters : null;
}

export function tailoringRemainingAmount(totalPrice, paidAmount) {
  const total = tailoringMoneyCents(totalPrice), paid = tailoringMoneyCents(paidAmount);
  return total === null || paid === null || paid > total ? null : (total - paid) / 100;
}

export function validTailoringDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayTailoringDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validateSingleTailoringOrder(input) {
  const fields = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("invalidOrder"), { fields: { clientName: "required" } });
  const text = (raw, key, required = false, max = 120) => {
    if (raw !== undefined && typeof raw !== "string") { fields[key] = "invalidText"; return ""; }
    const value = (raw || "").trim();
    if (required && !value) fields[key] = "required";
    else if (value.length > max || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fields[key] = "invalidText";
    return value;
  };
  const garmentType = input.garmentType === undefined ? "djellaba" : input.garmentType;
  if (!TAILORING_GARMENT_TYPES.includes(garmentType)) fields.garmentType = "invalidGarmentType";
  const trousers = garmentType === "trousers";
  const withExpenses = tailoringHasExpenses({ garmentType });
  const shirtType = garmentType === "shirts" ? text(input.shirtType, "shirtType", true) : undefined;
  if (trousers && !TAILORING_TROUSER_TYPES.includes(input.trouserType)) fields.trouserType = "invalidTrouserType";
  const expenses = withExpenses ? tailoringMoneyCents(input.expenseAmount) : null;
  if (withExpenses && expenses === null) fields.expenseAmount = "invalidMoney";
  const clientName = text(input.clientName, "clientName", true, 160);
  const phone = text(input.phone, "phone", true, 40);
  if (phone && !fields.phone && (!/^[+\d\s()./-]+$/.test(phone) || !/^\d{6,20}$/.test(phone.replace(/\D/g, "")))) fields.phone = "invalidPhone";
  const orderDate = text(input.orderDate, "orderDate", true, 10);
  const readyDate = text(input.readyDate, "readyDate", true, 10);
  if (!fields.orderDate && !validTailoringDate(orderDate)) fields.orderDate = "invalidDate";
  if (!fields.readyDate && !validTailoringDate(readyDate)) fields.readyDate = "invalidDate";
  if (!fields.orderDate && !fields.readyDate && readyDate < orderDate) fields.readyDate = "readyBeforeOrder";
  const totalCents = tailoringMoneyCents(input.totalPrice);
  const paidCents = tailoringMoneyCents(input.paidAmount);
  if (totalCents === null) fields.totalPrice = input.totalPrice === undefined || input.totalPrice === "" ? "required" : "invalidMoney";
  if (paidCents === null) fields.paidAmount = input.paidAmount === undefined || input.paidAmount === "" ? "required" : "invalidMoney";
  if (totalCents !== null && paidCents !== null && paidCents > totalCents) fields.paidAmount = "paidExceedsPrice";
  const fabricSource = input.fabricSource;
  if (!TAILORING_SOURCES.includes(fabricSource)) fields.fabricSource = "invalidSource";
  const fabricType = text(input.fabricType, "fabricType", fabricSource === "client");
  const fabricColor = text(input.fabricColor, "fabricColor");
  const fabricId = fabricSource === "shop" ? input.fabricId : "";
  const colorId = fabricSource === "shop" ? input.colorId || "" : "";
  if (fabricSource === "shop" && (typeof fabricId !== "string" || !/^[a-f\d]{24}$/i.test(fabricId))) fields.fabricId = "chooseFabric";
  if (colorId && (typeof colorId !== "string" || !/^[a-f\d]{24}$/i.test(colorId))) fields.colorId = "chooseColor";
  let sfifa;
  if (!withExpenses) {
    let trim = input.sfifa;
    if (typeof trim === "string") {
      try { trim = JSON.parse(trim); } catch { trim = null; }
    }
    if (!trim || typeof trim !== "object" || Array.isArray(trim)) trim = {};
    const { width, style } = trim;
    if (!SFIFA_WIDTHS.includes(width)) fields["sfifa.width"] = "invalidWidth";
    if (!SFIFA_STYLES.includes(style)) fields["sfifa.style"] = "invalidStyle";
    const twoColors = ["twoTone", "gradient"].includes(style);
    const color1 = twoColors ? text(trim.color1, "sfifa.color1", true) : "";
    const color2 = twoColors ? text(trim.color2, "sfifa.color2", true) : "";
    sfifa = { width, style, color1, color2 };
  }
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidOrder"), { fields });
  return { clientName, phone, orderDate, readyDate, totalPrice: totalCents / 100, paidAmount: paidCents / 100, fabricSource, fabricType, fabricColor, fabricId, colorId, ...(input.garmentType === undefined ? {} : { garmentType }), ...(trousers ? { trouserType: input.trouserType, expenseAmount: expenses / 100 } : garmentType === "shirts" ? { shirtType, expenseAmount: expenses / 100 } : { sfifa }) };
}

export function tailoringOrderItems(order) {
  if (!order) return [];
  if (order.items?.length) return order.items;
  return [{ lineId: String(order._id), price: order.totalPrice ?? 0, fabricSource: order.fabricSource, fabricType: order.fabricType, fabricReference: order.fabricReference || "", fabricColor: order.fabricColor || "", fabricId: order.fabricId || null, colorId: order.colorId || null, sfifa: order.sfifa, ...(tailoringGarmentType(order) === "trousers" ? { trouserType: order.trouserType } : tailoringGarmentType(order) === "shirts" ? { shirtType: order.shirtType } : {}), photo: order.photo, hasPhoto: order.hasPhoto ?? Boolean(order.photo) }];
}
export function tailoringItemsTotal(items) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_TAILORING_ITEMS) return null;
  let total = 0;
  for (const item of items) {
    const cents = tailoringMoneyCents(item.price);
    if (cents === null) return null;
    total += cents;
  }
  return total <= 99999999999 ? total / 100 : null;
}
export function validateTailoringOrder(input) {
  const rawFabricMode = input?.fabricCosting;
  if (![undefined, true, false, "true", "false"].includes(rawFabricMode)) throw Object.assign(new Error("invalidOrder"), { fields: { fabricCosting: "costsRequired" } });
  const fabricCosting = rawFabricMode === true || rawFabricMode === "true";
  if (fabricCosting && (tailoringGarmentType(input) !== "trousers" || input?.items === undefined)) throw Object.assign(new Error("invalidOrder"), { fields: { items: "itemsRequired" } });
  if (![undefined, true, false, "true", "false"].includes(input?.laborCosting)) throw Object.assign(new Error("invalidOrder"), { fields: { laborCosting: "costsRequired" } });
  const laborCosting = input?.laborCosting === true || input?.laborCosting === "true";
  if (laborCosting && !fabricCosting) throw Object.assign(new Error("invalidOrder"), { fields: { laborCosting: "costsRequired" } });
  const rawMode = input?.automaticCosting;
  if (![undefined, true, false, "true", "false"].includes(rawMode)) throw Object.assign(new Error("invalidOrder"), { fields: { automaticCosting: "costsRequired" } });
  const automaticCosting = rawMode === true || rawMode === "true";
  if (automaticCosting && (!tailoringUsesSfifa(input) || input?.items === undefined)) throw Object.assign(new Error("invalidOrder"), { fields: { items: "itemsRequired" } });
  if (input?.items === undefined) return validateSingleTailoringOrder(input);
  const fields = {}, seen = new Set();
  let rawItems = input.items;
  if (typeof rawItems === "string") { try { rawItems = JSON.parse(rawItems); } catch { rawItems = null; } }
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > MAX_TAILORING_ITEMS) throw Object.assign(new Error("invalidOrder"), { fields: { items: "invalidItems" } });
  const items = rawItems.map((raw, index) => {
    const prefix = `items.${index}.`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { fields[`items.${index}`] = "invalidItem"; return {}; }
    const lineId = typeof raw.lineId === "string" ? raw.lineId.toLowerCase() : "";
    if (!/^[a-f\d]{24}$/.test(lineId) || seen.has(lineId)) fields[`${prefix}lineId`] = "invalidItem";
    seen.add(lineId);
    if (raw.imageIndex !== undefined && (!Number.isInteger(raw.imageIndex) || raw.imageIndex < 0 || raw.imageIndex >= MAX_TAILORING_ITEMS)) fields[`${prefix}photo`] = "imageUploadInvalid";
    if (raw.removeImage !== undefined && typeof raw.removeImage !== "boolean") fields[`${prefix}photo`] = "imageUploadInvalid";
    try {
      const value = validateSingleTailoringOrder({ clientName: input.clientName, phone: input.phone, orderDate: input.orderDate, readyDate: input.readyDate, fabricSource: raw.fabricSource, fabricType: raw.fabricType, fabricColor: raw.fabricColor, fabricId: raw.fabricId, colorId: raw.colorId, sfifa: raw.sfifa, garmentType: input.garmentType, trouserType: raw.trouserType, shirtType: raw.shirtType, expenseAmount: 0, totalPrice: raw.price, paidAmount: 0 });
      const { fabricSource, fabricType, fabricColor, fabricId, colorId } = value;
      return { lineId, price: value.totalPrice, fabricSource, fabricType, fabricColor, fabricId, colorId, ...(value.garmentType === "trousers" ? { trouserType: value.trouserType } : value.garmentType === "shirts" ? { shirtType: value.shirtType } : { sfifa: value.sfifa }), removeImage: raw.removeImage === true, ...(raw.imageIndex === undefined ? {} : { imageIndex: raw.imageIndex }) };
    } catch (error) {
      for (const [key, code] of Object.entries(error.fields || {})) fields[["clientName", "phone", "orderDate", "readyDate", "garmentType"].includes(key) ? key : prefix + (key === "totalPrice" ? "price" : key)] = code;
      return {};
    }
  });
  let costSettingsVersion;
  if (automaticCosting || laborCosting) {
    const rawVersion = input.costSettingsVersion;
    costSettingsVersion = laborCosting && (rawVersion === null || rawVersion === "") ? null : typeof rawVersion === "number" ? rawVersion : typeof rawVersion === "string" && /^\d+$/.test(rawVersion) ? Number(rawVersion) : NaN;
    if (!(laborCosting && costSettingsVersion === null) && (!Number.isSafeInteger(costSettingsVersion) || costSettingsVersion < 0)) fields.costSettingsVersion = "costSettingsRequired";
  }
  if (automaticCosting || fabricCosting) {
    items.forEach((item, index) => {
      const raw = rawItems[index];
      item.fabricMeters = tailoringFabricMeters(raw?.fabricMeters);
      item.fabricUnitPrice = item.fabricSource === "client" ? 0 : tailoringMoneyCents(raw?.fabricUnitPrice) === null ? null : tailoringMoneyCents(raw.fabricUnitPrice) / 100;
      if (item.fabricMeters === null) fields["items." + index + ".fabricMeters"] = "invalidFabricMeters";
      if (item.fabricSource === "shop" && (item.fabricUnitPrice === null || item.fabricUnitPrice <= 0)) fields["items." + index + ".fabricUnitPrice"] = "fabricPriceMissing";
    });
  }
  const totalPrice = tailoringItemsTotal(items), paid = tailoringMoneyCents(input.paidAmount);
  const trousers = input.garmentType === "trousers";
  const withExpenses = tailoringHasExpenses(input);
  const expenses = withExpenses ? tailoringMoneyCents(input.expenseAmount) : null;
  if (withExpenses && expenses === null) fields.expenseAmount = "invalidMoney";
  if (totalPrice === null && !Object.keys(fields).length) fields.totalPrice = "invalidMoney";
  if (paid === null) fields.paidAmount = input.paidAmount === undefined || input.paidAmount === "" ? "required" : "invalidMoney";
  else if (totalPrice !== null && paid > tailoringMoneyCents(totalPrice)) fields.paidAmount = "paidExceedsPrice";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidOrder"), { fields });
  const first = items[0];
  return { clientName: input.clientName.trim(), phone: input.phone.trim(), orderDate: input.orderDate.trim(), readyDate: input.readyDate.trim(), totalPrice, paidAmount: paid / 100, fabricSource: first.fabricSource, fabricType: first.fabricType, fabricColor: first.fabricColor, fabricId: first.fabricId, colorId: first.colorId, ...(input.garmentType === undefined ? {} : { garmentType: input.garmentType }), ...(trousers ? { trouserType: first.trouserType, expenseAmount: expenses / 100 } : input.garmentType === "shirts" ? { shirtType: first.shirtType, expenseAmount: expenses / 100 } : { sfifa: first.sfifa }), items, ...(automaticCosting ? { automaticCosting: true, costSettingsVersion } : {}), ...(fabricCosting ? { fabricCosting: true } : {}), ...(laborCosting ? { laborCosting: true, costSettingsVersion } : {}) };
}

const searchable = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export function filterTailoringOrders(orders, search = "", { barcodeOnly = false } = {}) {
  const barcode = normalizeTailoringBarcode(search);
  if (barcode || (barcodeOnly && search.trim())) return orders.filter(order => barcode && tailoringOrderBarcode(order) === barcode);
  const query = searchable(search.trim());
  const digits = query.replace(/[\s()+./-]/g, "");
  return orders.filter((order) => [order.clientName, order.phone, order.orderDate, order.readyDate, ...tailoringOrderItems(order).flatMap(item => [item.fabricType, item.fabricReference, item.fabricColor, item.shirtType])].some((value) => searchable(value).includes(query))
    || (/^\d+$/.test(digits) && order.phone.replace(/\D/g, "").includes(digits)));
}
