import { FABRIC_LIMITS } from './fabrics.js';
import { WORKER_GARMENT_SIZES, WORKER_DJELLABA_NUMBERS } from './workerMaterials.js';
import { sfifaQuantityUnits, SFIFA_METER_TYPES } from './sfifaStock.js';
import { tailoringMoneyCents } from './tailoring.js';
import { SHOP_FLOW_GARMENTS } from './workerShopFlow.js';

// Keep the stored shopDjellaba field compatible with existing assignments.
export const isShopGarmentBatch = work => work?.category === 'machine' && work.workType === 'shop' && SHOP_FLOW_GARMENTS.includes(work.garmentType) && Boolean(work.shopDjellaba);
export const isShopDjellabaBatch = isShopGarmentBatch;
export function validateShopDjellabaBatch(input, { excluded = [] } = {}) {
  const fields = {}, prefix = 'shopDjellaba.';
  const id = key => { const value = typeof input?.[key] === 'string' ? input[key].toLowerCase() : ''; if (!/^[a-f\d]{24}$/.test(value)) fields[prefix + key] = key === 'fabricId' ? 'chooseStockFabric' : 'chooseStockSfifa'; return value; };
  const fabricId = id('fabricId'), sfifaId = id('sfifaId'), variantId = id('variantId');
  const colorIds = Array.isArray(input?.colorIds) ? input.colorIds.map(value => typeof value === 'string' ? value.toLowerCase() : '') : [];
  if (!colorIds.length || colorIds.length > FABRIC_LIMITS.colors || new Set(colorIds).size !== colorIds.length || colorIds.some(value => !/^[a-f\d]{24}$/.test(value) || excluded.includes(value))) fields[prefix + 'colorIds'] = 'chooseDjellabaColors';
  const size = typeof input?.size === 'string' ? input.size.trim().toUpperCase() : '';
  if (size && !WORKER_GARMENT_SIZES.includes(size)) fields[prefix + 'size'] = 'invalidSize';
  const rawNumber = input?.modelNumber;
  const modelNumber = rawNumber === undefined || rawNumber === '' ? undefined : (typeof rawNumber === 'string' || typeof rawNumber === 'number') && /^[1-5]$/.test(String(rawNumber)) ? Number(rawNumber) : NaN;
  if (modelNumber !== undefined && !WORKER_DJELLABA_NUMBERS.includes(modelNumber)) fields[prefix + 'modelNumber'] = 'invalidDjellabaNumber';
  const rawMeters = input?.meters;
  const units = rawMeters === '' || rawMeters === undefined ? 0 : sfifaQuantityUnits(rawMeters, { max: FABRIC_LIMITS.meters });
  if (units === null) fields[prefix + 'meters'] = 'invalidMeters';
  const wage = tailoringMoneyCents(input?.unitWage);
  if (wage === null || wage * colorIds.length > 99999999999) fields[prefix + 'unitWage'] = 'invalidWage';
  const sfifaStyle = input?.sfifaStyle;
  if (sfifaStyle !== undefined && !SFIFA_METER_TYPES.includes(sfifaStyle)) fields[prefix + 'sfifaStyle'] = 'chooseSfifaStyle';
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidWork'), { fields });
  const shopDjellaba = { fabricId, colorIds: colorIds.sort(), sfifaId, variantId, meters: units / 1000, unitWage: wage / 100, ...(size ? { size } : {}), ...(modelNumber !== undefined ? { modelNumber } : {}), ...(sfifaStyle !== undefined ? { sfifaStyle } : {}) };
  const materials = shopDjellaba.colorIds.map(colorId => ({ lineId: colorId, fabricId, colorId, sfifaId, variantId, meters: shopDjellaba.meters, unitWage: shopDjellaba.unitWage, fabricStockDeducted: false, ...(size ? { size } : {}), ...(modelNumber !== undefined ? { modelNumber } : {}), ...(sfifaStyle !== undefined ? { sfifaStyle } : {}) }));
  return { shopDjellaba, materials, quantity: colorIds.length };
}
