import { FABRIC_LIMITS } from './fabrics.js';
import { sfifaQuantityUnits } from './sfifaStock.js';

export const trouserMeterUnits = raw => sfifaQuantityUnits(raw, { max: FABRIC_LIMITS.meters });
export const trouserConsumesStock = work => work?.category === 'trousers' && work.workType === 'shop' && work.shopTrouser?.metersPerPiece !== undefined;
export function activeTrouserStockOperations(work) {
  const operations = (work.trouserStockOperations || []).filter(operation => operation.state !== 'failed');
  const lastEdit = operations.findLastIndex(operation => operation.kind === 'edit');
  return operations.slice(Math.max(0, lastEdit));
}
export const trouserStockRows = work => activeTrouserStockOperations(work).flatMap(operation => operation.rows.map(row => ({ ...(row.toObject ? row.toObject() : row), fabricId: operation.fabricId || work.shopTrouser.fabricId })));
export const SHOP_TROUSER_LENGTH_MAX = 1000;
export function parseShopTrouserLength(raw) {
  const units = sfifaQuantityUnits(raw, { max: SHOP_TROUSER_LENGTH_MAX });
  return units !== null && units > 0 ? units / 1000 : null;
}
export const completedTrouserColorIds = work => (work.completions || []).flatMap(event => event.shopTrouserColorIds || []).map(String);
export const availableTrouserColors = work => {
  const completed = new Set(completedTrouserColorIds(work));
  return (work.shopTrouser?.colors || []).filter(color => !completed.has(String(color.colorId)));
};
export function validateTrouserColorCompletion(work, quantity, selection) {
  const ids = Array.isArray(selection) ? selection.map(id => typeof id === 'string' ? id.toLowerCase() : '') : [];
  const available = new Set(availableTrouserColors(work).map(color => String(color.colorId)));
  if (!ids.length || ids.length !== quantity || new Set(ids).size !== ids.length || ids.some(id => !/^[a-f\d]{24}$/.test(id) || !available.has(id))) throw Object.assign(new Error('invalidWork'), { fields: { colorIds: 'chooseCompletedTrouserColors' } });
  return ids.sort();
}
