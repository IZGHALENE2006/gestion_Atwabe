import { TAILORING_GARMENT_TYPES, TAILORING_SFIFA_GARMENT_TYPES, tailoringGarmentType } from "./tailoring.js";
import { WORKER_CATEGORIES } from "./workers.js";
import { SFIFA_STOCK_SCALE, sfifaQuantityUnits, validateSfifaStock } from "./sfifaStock.js";

export const WORK_TRACKING_CATEGORIES = [...WORKER_CATEGORIES];
export const WORK_QUANTITY_LIMIT = 1000000;
export const WORK_TYPES = ["shop", "client"];
export const TROUSER_TYPES = ["regular", "qandrissi"];
export const workerOrderGarmentTypes = category => category === "mesbanto" ? TAILORING_GARMENT_TYPES : category === "trousers" ? ["trousers"] : category === "shirts" ? ["shirts"] : TAILORING_SFIFA_GARMENT_TYPES;
export const workerWorkGarmentType = work => work.tailoring ? tailoringGarmentType(work.tailoring) : work.garmentType || null;
export const workerWorkType = work => work.workType || "shop";

export function workQuantityUnits(raw, category) {
  if (category === "sfifa") return sfifaQuantityUnits(raw);
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) && quantity <= WORK_QUANTITY_LIMIT ? quantity : null;
}

export function parseWorkQuantity(raw, category) {
  const units = workQuantityUnits(raw, category);
  return units !== null && units > 0 ? units / (category === "sfifa" ? SFIFA_STOCK_SCALE : 1) : null;
}

export function remainingWorkQuantity(work) {
  return (workQuantityUnits(work.quantity, work.category) - workQuantityUnits(work.completedQuantity, work.category)) / (work.category === "sfifa" ? SFIFA_STOCK_SCALE : 1);
}

export const nextWorkSequence = work => (work.completions?.length || 0) + (work.additions?.length || 0) + 1;

export function validateWorkerIncrease(input, work, { checkLimits = true } = {}) {
  let quantity, lineIds;
  if (work.tailoring && work.category !== "sfifa") {
    const selection = orderSelection({ orderId: String(work.tailoring.orderId), lineIds: input?.lineIds });
    lineIds = selection.lineIds;
    if (checkLimits && work.tailoring.lineIds.length + lineIds.length > 50) throw Object.assign(new Error("invalidWork"), { fields: { lineIds: "tooManyGarments" } });
    quantity = lineIds.length;
  } else quantity = parseWorkQuantity(input?.quantity, work.category);
  if (quantity === null) throw Object.assign(new Error("invalidWork"), { fields: { quantity: work.category === "sfifa" ? "invalidMeters" : "invalidQuantity" } });
  const total = workQuantityUnits(work.quantity, work.category) + workQuantityUnits(quantity, work.category);
  if (checkLimits && total > WORK_QUANTITY_LIMIT * (work.category === "sfifa" ? SFIFA_STOCK_SCALE : 1)) throw Object.assign(new Error("invalidWork"), { fields: { quantity: "increaseLimit" } });
  return { quantity, ...(lineIds ? { lineIds } : {}) };
}

export function applyWorkerIncrease(work, input, requestId, createdBy, date = new Date()) {
  const scale = work.category === "sfifa" ? SFIFA_STOCK_SCALE : 1;
  const before = remainingWorkQuantity(work), added = workQuantityUnits(input.quantity, work.category);
  if (work.initialQuantity === undefined) work.initialQuantity = work.quantity;
  if (!work.additions) work.additions = [];
  const sequence = nextWorkSequence(work);
  work.quantity = (workQuantityUnits(work.quantity, work.category) + added) / scale;
  work.additions.push({ requestId, quantity: input.quantity, before, after: (workQuantityUnits(before, work.category) + added) / scale, sequence, date, createdBy, ...(input.lineIds ? { lineIds: input.lineIds } : {}) });
}

export function workerWorkTotals(works, category) {
  const totals = { quantity: 0, completedQuantity: 0, remainingQuantity: 0 };
  for (const work of works) {
    const quantity = workQuantityUnits(work.quantity, category), completed = workQuantityUnits(work.completedQuantity, category);
    totals.quantity += quantity; totals.completedQuantity += completed; totals.remainingQuantity += quantity - completed;
  }
  const scale = category === "sfifa" ? SFIFA_STOCK_SCALE : 1;
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / scale]));
}

export function trouserWorkTotals(works) {
  return Object.fromEntries(TROUSER_TYPES.map(type => [type, workerWorkTotals(works.filter(work => work.category === "trousers" && workerWorkType(work) === "client" && work.trouserType === type), "trousers")]));
}

function orderSelection(input) {
  const fields = {};
  const orderId = typeof input.orderId === "string" ? input.orderId.toLowerCase() : "";
  const lineIds = Array.isArray(input.lineIds) ? input.lineIds.map(id => typeof id === "string" ? id.toLowerCase() : "") : [];
  if (!/^[a-f\d]{24}$/.test(orderId)) fields.orderId = "chooseOrder";
  if (!lineIds.length || lineIds.length > 50 || lineIds.some(id => !/^[a-f\d]{24}$/.test(id)) || new Set(lineIds).size !== lineIds.length) fields.lineIds = "chooseGarments";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidWork"), { fields });
  return { orderId, lineIds: lineIds.sort() };
}

export function validateWorkerWork(input, { allowLegacyTrouserClient = false } = {}) {
  if (input?.workType !== undefined && !WORK_TYPES.includes(input.workType)) throw Object.assign(new Error("invalidWork"), { fields: { workType: "invalidWorkType" } });
  const type = input?.workType === undefined ? {} : { workType: input.workType };
  if (input?.workType === "client" && input.category !== "sfifa" && !(input.category === "trousers" && allowLegacyTrouserClient)) {
    if (!WORK_TRACKING_CATEGORIES.includes(input.category)) throw Object.assign(new Error("invalidWork"), { fields: { category: "invalidWorkCategory" } });
    const selection = orderSelection(input);
    return { workType: "client", ...selection, quantity: selection.lineIds.length, category: input.category };
  }
  if (input?.category === "sfifa") {
    try {
      const { quantity, ...sfifa } = validateSfifaStock({ ...input.sfifa, quantity: input.quantity });
      const selection = input.workType === "client" && (input.linkOrder === true || input.orderId || input.lineIds?.length) ? orderSelection(input) : {};
      return { productName: "Sfifa", quantity, category: "sfifa", sfifa, ...type, ...selection };
    } catch (error) {
      const fields = { ...error.fields };
      if (fields.quantity) fields.quantity = "invalidMeters";
      throw Object.assign(new Error("invalidWork"), { fields });
    }
  }
  const fields = {};
  const isTrouserClient = input?.category === "trousers" && input.workType === "client";
  if (isTrouserClient && !TROUSER_TYPES.includes(input.trouserType)) fields.trouserType = "invalidTrouserType";
  const productName = typeof input?.productName === "string" ? input.productName.trim() : "";
  if (!productName) fields.productName = "required";
  else if (productName.length > 160 || [...productName].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fields.productName = isTrouserClient ? "invalidClientName" : "invalidProductName";
  const quantity = parseWorkQuantity(input?.quantity);
  if (quantity === null) fields.quantity = "invalidQuantity";
  if (!WORK_TRACKING_CATEGORIES.includes(input?.category)) fields.category = "invalidWorkCategory";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidWork"), { fields });
  const garmentType = input.category === "machine" && input.garmentType !== undefined ? input.garmentType : undefined;
  if (garmentType !== undefined && !TAILORING_SFIFA_GARMENT_TYPES.includes(garmentType)) throw Object.assign(new Error("invalidWork"), { fields: { garmentType: "invalidGarmentType" } });
  return { productName, quantity, category: input.category, ...type, ...(garmentType ? { garmentType } : {}), ...(isTrouserClient ? { trouserType: input.trouserType } : {}) };
}

export function validateWorkerCompletion(input, remaining, category) {
  const quantity = parseWorkQuantity(input?.quantity, category);
  const fields = {};
  if (quantity === null) fields.quantity = category === "sfifa" ? "invalidMeters" : "invalidQuantity";
  else if (remaining !== undefined && workQuantityUnits(quantity, category) > workQuantityUnits(remaining, category)) fields.quantity = category === "sfifa" ? "exceedsRemainingMeters" : "exceedsRemaining";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidWork"), { fields });
  return { quantity };
}
