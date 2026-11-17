import { parseShopTrouserLength } from './workerShopTrousers.js';
import { isShopDjellabaBatch, validateShopDjellabaBatch } from './workerShopDjellaba.js';
import { trouserMeterUnits, validateTrouserColorCompletion } from './workerShopTrousers.js';
import { validateShopFlowSelection } from './workerShopFlow.js';
import { validateWorkerSfifa } from './workerSfifa.js';
import { TAILORING_GARMENT_TYPES, TAILORING_SFIFA_GARMENT_TYPES, tailoringGarmentType, tailoringMoneyCents } from "./tailoring.js";
import { WORKER_CATEGORIES } from "./workers.js";
import { usesWorkerMaterials, workerHasPieceWages, workerHasPieceSelection, workerMaterialRows, workerPieceWageCents, validateWorkerPieceCompletion, validateShopWorkerMaterials, validateWorkerMaterialSelection, WORKER_GARMENT_SIZES } from './workerMaterials.js';
import { SFIFA_STOCK_SCALE, sfifaQuantityUnits } from "./sfifaStock.js";

export const WORK_TRACKING_CATEGORIES = [...WORKER_CATEGORIES];
export const WORK_QUANTITY_LIMIT = 1000000;
export const WORK_TYPES = ["shop", "client"];
export const TROUSER_TYPES = ["regular", "qandrissi"];
export const SHOP_TROUSER_LENGTHS = [80, 85, 90, 95];
export const hasShopTrouserColors = work => work?.shopTrouser?.length !== undefined;
function shopTrouserColorSelection(input, excluded = []) {
  const colorIds = Array.isArray(input?.colorIds) ? input.colorIds.map(id => typeof id === 'string' ? id.toLowerCase() : '') : [];
  if (!colorIds.length || colorIds.length > WORK_QUANTITY_LIMIT || colorIds.some(id => !/^[a-f\d]{24}$/.test(id) || excluded.includes(id)) || new Set(colorIds).size !== colorIds.length) throw Object.assign(new Error('invalidWork'), { fields: { 'shopTrouser.colorIds': 'chooseTrouserColors' } });
  return colorIds.sort();
}
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

// Cumulative rounding keeps split metre completions equal to one full completion.
export function workerWageCents(unitWage, quantity, category) {
  const cents = tailoringMoneyCents(unitWage), units = workQuantityUnits(quantity, category);
  if (cents === null || units === null) return null;
  const scale = category === "sfifa" ? 1000n : 1n;
  const total = (BigInt(cents) * BigInt(units) + scale / 2n) / scale;
  return total <= 99999999999n ? Number(total) : null;
}

export function parseWorkQuantity(raw, category) {
  const units = workQuantityUnits(raw, category);
  return units !== null && units > 0 ? units / (category === "sfifa" ? SFIFA_STOCK_SCALE : 1) : null;
}

export function remainingWorkQuantity(work) {
  return (workQuantityUnits(work.quantity, work.category) - workQuantityUnits(work.completedQuantity, work.category)) / (work.category === "sfifa" ? SFIFA_STOCK_SCALE : 1);
}

export function workerWorkCompleted(work) {
  const quantity = workQuantityUnits(work.quantity, work.category), completed = workQuantityUnits(work.completedQuantity, work.category);
  return quantity !== null && quantity > 0 && completed !== null && completed >= quantity;
}

export const nextWorkSequence = work => (work.completions?.length || 0) + (work.additions?.length || 0) + (work.edits?.length || 0) + 1;

export function validateWorkerIncrease(input, work, { checkLimits = true } = {}) {
  if (work.shopFlow) throw Object.assign(new Error('invalidWork'), { fields: { quantity: 'shopFlowFixedQuantity' } });
  if (isShopDjellabaBatch(work)) {
    const inputBatch = input?.shopDjellaba;
    const previous = work.shopDjellaba.toObject ? work.shopDjellaba.toObject() : work.shopDjellaba;
    const selection = validateShopDjellabaBatch({ ...previous, ...Object.fromEntries(['fabricId', 'sfifaId', 'variantId'].map(key => [key, String(previous[key])])), colorIds: inputBatch?.colorIds, unitWage: inputBatch?.unitWage }, { excluded: checkLimits ? work.shopDjellaba.colorIds : [] });
    if (checkLimits && work.quantity + selection.quantity > 100) throw Object.assign(new Error('invalidWork'), { fields: { 'shopDjellaba.colorIds': 'chooseDjellabaColors' } });
    if (checkLimits && workerPieceWageCents([...workerMaterialRows(work), ...selection.materials]) === null) throw Object.assign(new Error('invalidWork'), { fields: { 'shopDjellaba.unitWage': 'invalidWage' } });
    return selection;
  }
  if (work.materialOperations?.length && workerWorkType(work) === 'shop' && input?.materials === undefined) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'chooseMaterials' } });
  let quantity, lineIds, shopTrouser;
  if (hasShopTrouserColors(work)) {
    const colorIds = shopTrouserColorSelection(input?.shopTrouser, checkLimits ? work.shopTrouser.colors.map(color => String(color.colorId)) : []);
    shopTrouser = { colorIds }; quantity = colorIds.length;
  } else if (work.tailoring && work.category !== "sfifa") {
    const selection = orderSelection({ orderId: String(work.tailoring.orderId), lineIds: input?.lineIds });
    lineIds = selection.lineIds;
    if (checkLimits && work.tailoring.lineIds.length + lineIds.length > 50) throw Object.assign(new Error("invalidWork"), { fields: { lineIds: "tooManyGarments" } });
    quantity = lineIds.length;
  } else quantity = parseWorkQuantity(input?.quantity, work.category);
  if (quantity === null) throw Object.assign(new Error("invalidWork"), { fields: { quantity: work.category === "sfifa" ? "invalidMeters" : "invalidQuantity" } });
  const total = workQuantityUnits(work.quantity, work.category) + workQuantityUnits(quantity, work.category);
  if (checkLimits && total > WORK_QUANTITY_LIMIT * (work.category === "sfifa" ? SFIFA_STOCK_SCALE : 1)) throw Object.assign(new Error("invalidWork"), { fields: { quantity: "increaseLimit" } });
  if (checkLimits && work.unitWage !== undefined && workerWageCents(work.unitWage, total / (work.category === "sfifa" ? SFIFA_STOCK_SCALE : 1), work.category) === null) throw Object.assign(new Error("invalidWork"), { fields: { quantity: "invalidWage" } });
  if (input?.materials !== undefined && !usesWorkerMaterials(work.category, workerWorkType(work), workerWorkGarmentType(work))) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'invalidMaterialSection' } });
  const materials = input?.materials === undefined ? undefined : lineIds ? validateWorkerMaterialSelection(input.materials, lineIds) : validateShopWorkerMaterials(input.materials, quantity);
  if (materials && materials.some(row => row.unitWage !== undefined) !== workerHasPieceWages(work)) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'invalidWage' } });
  if (checkLimits && materials && workerHasPieceWages(work) && workerPieceWageCents([...workerMaterialRows(work), ...materials]) === null) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'invalidWage' } });
  if (checkLimits && materials && materials.some(row => (work.materials || work.materialOperations?.filter(operation => operation.state !== 'failed').flatMap(operation => operation.rows) || []).some(previous => previous.lineId === row.lineId))) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'chooseMaterials' } });
  return { quantity, ...(lineIds ? { lineIds } : {}), ...(shopTrouser ? { shopTrouser } : {}), ...(materials ? { materials } : {}) };
}

export function applyWorkerIncrease(work, input, requestId, createdBy, date = new Date()) {
  const scale = work.category === "sfifa" ? SFIFA_STOCK_SCALE : 1;
  const before = remainingWorkQuantity(work), added = workQuantityUnits(input.quantity, work.category);
  if (work.initialQuantity === undefined) work.initialQuantity = work.quantity;
  if (!work.additions) work.additions = [];
  const sequence = nextWorkSequence(work);
  work.quantity = (workQuantityUnits(work.quantity, work.category) + added) / scale;
  work.additions.push({ requestId, quantity: input.quantity, before, after: (workQuantityUnits(before, work.category) + added) / scale, sequence, date, createdBy, ...(input.lineIds ? { lineIds: input.lineIds } : {}), ...(input.shopTrouser ? { shopTrouserColorIds: input.shopTrouser.colorIds } : {}) });
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
  if (input?.shopDjellaba !== undefined) {
    if (!isShopDjellabaBatch(input)) throw Object.assign(new Error('invalidWork'), { fields: { shopDjellaba: 'invalidMaterialSection' } });
    return { ...validateShopDjellabaBatch(input.shopDjellaba), productName: 'Djellaba', category: 'machine', workType: 'shop', garmentType: 'djellaba' };
  }
  if (input?.shopTrouser !== undefined && (input.category !== 'trousers' || input.workType !== 'shop')) throw Object.assign(new Error('invalidWork'), { fields: { shopTrouser: 'invalidShopTrouser' } });
  if (input?.materials !== undefined && (input.category !== 'machine' || input.workType !== 'shop')) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'invalidMaterialSection' } });
  if (input?.workType !== undefined && !WORK_TYPES.includes(input.workType)) throw Object.assign(new Error("invalidWork"), { fields: { workType: "invalidWorkType" } });
  const withWage = result => {
    if (workerHasPieceWages(result) && input?.unitWage !== undefined) throw Object.assign(new Error('invalidWork'), { fields: { unitWage: 'invalidWage' } });
    if (input?.unitWage === undefined) return result;
    const cents = tailoringMoneyCents(input.unitWage);
    if (cents === null || workerWageCents(input.unitWage, result.quantity, result.category) === null) throw Object.assign(new Error("invalidWork"), { fields: { unitWage: "invalidWage" } });
    return { ...result, unitWage: cents / 100 };
  };
  const type = input?.workType === undefined ? {} : { workType: input.workType };
  if (input?.shopOriginId !== undefined || input?.workType === 'shop' && ['finishing', 'mesbanto'].includes(input.category) && input.garmentType !== undefined) {
    const selection = validateShopFlowSelection(input), cents = tailoringMoneyCents(input.unitWage);
    if (cents === null) throw Object.assign(new Error('invalidWork'), { fields: { unitWage: 'invalidWage' } });
    return { ...selection, unitWage: cents / 100 };
  }
  if (input?.workType === "client" && input.category !== "sfifa" && (input.category !== "brim" || input.orderId) && !(input.category === "trousers" && allowLegacyTrouserClient)) {
    if (!WORK_TRACKING_CATEGORIES.includes(input.category)) throw Object.assign(new Error("invalidWork"), { fields: { category: "invalidWorkCategory" } });
    const selection = orderSelection(input);
    return withWage({ workType: "client", ...selection, quantity: selection.lineIds.length, category: input.category, ...(input.materials !== undefined ? { materials: validateWorkerMaterialSelection(input.materials, selection.lineIds) } : {}) });
  }
  if (input?.category === "sfifa") {
    try {
      const { quantity, ...sfifa } = validateWorkerSfifa({ ...input.sfifa, quantity: input.quantity });
      const selection = input.workType === "client" && (input.linkOrder === true || input.orderId || input.lineIds?.length) ? orderSelection(input) : {};
      return withWage({ productName: "Sfifa", quantity, category: "sfifa", sfifa, ...type, ...selection });
    } catch (error) {
      const fields = { ...error.fields };
      if (fields.quantity) fields.quantity = "invalidMeters";
      throw Object.assign(new Error("invalidWork"), { fields });
    }
  }
  const fields = {};
  const isTrouserClient = input?.category === "trousers" && input.workType === "client";
  const isShopTrouser = input?.category === "trousers" && input.workType === "shop" && input.shopTrouser !== undefined;
  let shopTrouser;
  if (isShopTrouser) {
    const fabricId = typeof input.shopTrouser?.fabricId === 'string' ? input.shopTrouser.fabricId.toLowerCase() : '';
    const size = typeof input.shopTrouser?.size === 'string' ? input.shopTrouser.size.trim().toUpperCase() : '';
    if (!/^[a-f\d]{24}$/.test(fabricId)) fields['shopTrouser.fabricId'] = 'chooseStockFabric';
    if (!WORKER_GARMENT_SIZES.includes(size)) fields['shopTrouser.size'] = 'invalidSize';
    if (!TROUSER_TYPES.includes(input.trouserType)) fields.trouserType = 'invalidTrouserType';
    shopTrouser = { fabricId, size };
    // Older assignments have neither field; keep their stored request fingerprints valid.
    if (input.shopTrouser?.length !== undefined || input.shopTrouser?.colorIds !== undefined || input.shopTrouser?.metersPerPiece !== undefined) {
      const rawLength = input.shopTrouser.length;
      const length = parseShopTrouserLength(rawLength);
      if (length === null) fields['shopTrouser.length'] = 'invalidTrouserLength';
      let colorIds;
      try { colorIds = shopTrouserColorSelection(input.shopTrouser); } catch (error) { Object.assign(fields, error.fields); }
      shopTrouser = { ...shopTrouser, length, colorIds: colorIds || [] };
      if (input.shopTrouser.metersPerPiece !== undefined) {
        const meters = trouserMeterUnits(input.shopTrouser.metersPerPiece);
        if (meters === null || meters <= 0) fields['shopTrouser.metersPerPiece'] = 'invalidMeters';
        else shopTrouser.metersPerPiece = meters / 1000;
      }
    }
  }
  if (isTrouserClient && !TROUSER_TYPES.includes(input.trouserType)) fields.trouserType = "invalidTrouserType";
  const suppliedName = typeof input?.productName === "string" ? input.productName.trim() : "";
  const productName = isShopTrouser ? 'Trousers' : suppliedName || (input?.category === "brim" ? "Brim" : "");
  if (!productName) fields.productName = "required";
  else if (productName.length > 160 || [...productName].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fields.productName = isTrouserClient ? "invalidClientName" : "invalidProductName";
  const quantity = shopTrouser?.colorIds ? shopTrouser.colorIds.length || null : parseWorkQuantity(input?.quantity);
  if (quantity === null) fields.quantity = "invalidQuantity";
  if (!WORK_TRACKING_CATEGORIES.includes(input?.category)) fields.category = "invalidWorkCategory";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidWork"), { fields });
  const garmentType = input.category === "machine" && input.garmentType !== undefined ? input.garmentType : undefined;
  if (garmentType !== undefined && !TAILORING_SFIFA_GARMENT_TYPES.includes(garmentType)) throw Object.assign(new Error("invalidWork"), { fields: { garmentType: "invalidGarmentType" } });
  if (input.materials !== undefined && !usesWorkerMaterials(input.category, input.workType, garmentType)) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'invalidMaterialSection' } });
  return withWage({ productName, quantity, category: input.category, ...type, ...(garmentType ? { garmentType } : {}), ...(isTrouserClient || isShopTrouser ? { trouserType: input.trouserType } : {}), ...(shopTrouser ? { shopTrouser } : {}), ...(input.materials !== undefined ? { materials: validateShopWorkerMaterials(input.materials, quantity) } : {}) });
}

export function validateWorkerCompletion(input, remaining, category, work) {
  const quantity = parseWorkQuantity(input?.quantity, category);
  const fields = {};
  if (quantity === null) fields.quantity = category === "sfifa" ? "invalidMeters" : "invalidQuantity";
  else if (remaining !== undefined && workQuantityUnits(quantity, category) > workQuantityUnits(remaining, category)) fields.quantity = category === "sfifa" ? "exceedsRemainingMeters" : "exceedsRemaining";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidWork"), { fields });
  return { quantity, ...(work && hasShopTrouserColors(work) ? { colorIds: validateTrouserColorCompletion(work, quantity, input?.colorIds) } : {}), ...(work && workerHasPieceSelection(work) ? { lineIds: validateWorkerPieceCompletion(work, quantity, input?.lineIds) } : {}) };
}
