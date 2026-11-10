import { SFIFA_METER_TYPES, sfifaQuantityUnits } from './sfifaStock.js';
import { tailoringMoneyCents } from './tailoring.js';

export const WORKER_SFIFA_METERS = 3;
export const WORKER_MATERIAL_PIECE_LIMIT = 50;
export const WORKER_GARMENT_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
const identity = value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value);
export const supportsWorkerMaterialHistory = (category, workType, garmentType) => category === 'machine' && ['shop', 'client'].includes(workType) && ['djellaba', 'jabador', 'malakiya'].includes(garmentType);
export const usesWorkerMaterials = (category, workType, garmentType) => workType === 'shop' && supportsWorkerMaterialHistory(category, workType, garmentType);
export const workerMaterialPending = work => ['pending', 'returning'].includes(work.materialStatus);
export const workerMaterialRows = work => work.materialOperations ? work.materialOperations.filter(operation => operation.state !== 'failed').flatMap(operation => operation.rows) : work.materials || [];
export const workerHasPieceWages = work => work.category === 'machine' && work.workType === 'shop' && workerMaterialRows(work).some(row => row.unitWage !== undefined);
export const workerMaterialInputKey = rows => JSON.stringify((rows || []).map(row => ({ ...Object.fromEntries(['lineId', 'fabricId', 'colorId', 'pieceId', 'sfifaId', 'variantId', 'meters'].map(key => [key, key === 'meters' ? Number(row[key]) : String(row[key])])), ...(row.sfifaStyle !== undefined ? { sfifaStyle: row.sfifaStyle } : {}), ...(row.size !== undefined ? { size: row.size } : {}), ...(row.unitWage !== undefined ? { unitWage: Number(row.unitWage) } : {}) })).sort((a, b) => a.lineId.localeCompare(b.lineId)));
export const workerPieceSelectionKey = lineIds => JSON.stringify(Array.isArray(lineIds) ? lineIds.map(id => String(id).toLowerCase()).sort() : []);
export function workerPieceWageCents(rows) {
  let total = 0n;
  for (const row of rows) { const cents = tailoringMoneyCents(row.unitWage); if (cents === null) return null; total += BigInt(cents); }
  return total <= 99999999999n ? Number(total) : null;
}
export function workerAvailablePieces(work) {
  const completed = new Set((work.completions || []).flatMap(event => event.lineIds || []));
  return workerMaterialRows(work).filter(row => !completed.has(row.lineId));
}
export function validateWorkerPieceCompletion(work, quantity, selection) {
  const lineIds = Array.isArray(selection) ? selection.map(id => typeof id === 'string' ? id.toLowerCase() : '') : [];
  const available = new Set(workerAvailablePieces(work).map(row => row.lineId));
  if (!lineIds.length || lineIds.length !== Number(quantity) || new Set(lineIds).size !== lineIds.length || lineIds.some(id => !identity(id) || !available.has(id))) throw Object.assign(new Error('invalidWork'), { fields: { lineIds: 'chooseCompletedPieces' } });
  return lineIds.sort();
}

export function resizeWorkerMaterialLines(previous, rawQuantity, createId) {
  const text = String(rawQuantity).trim(), quantity = Number(text);
  if (!/^[0-9]+$/.test(text) || !Number.isInteger(quantity) || quantity < 1 || quantity > WORKER_MATERIAL_PIECE_LIMIT) return previous;
  return Array.from({ length: quantity }, (_, index) => previous[index] || createId());
}

export function validateShopWorkerMaterials(rows, quantity) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > WORKER_MATERIAL_PIECE_LIMIT) throw Object.assign(new Error('invalidWork'), { fields: { quantity: 'tooManyGarments' } });
  if (!Array.isArray(rows) || rows.length !== quantity) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'chooseMaterials' } });
  const validated = validateWorkerMaterialSelection(rows, rows.map(row => row?.lineId));
  if (validated.some(row => row.unitWage !== undefined)) {
    const fields = Object.fromEntries(validated.flatMap((row, index) => row.unitWage === undefined ? [[`materials.${rows.findIndex(input => input.lineId === row.lineId) ?? index}.unitWage`, 'invalidWage']] : []));
    if (Object.keys(fields).length) throw Object.assign(new Error('invalidWork'), { fields });
    if (workerPieceWageCents(validated) === null) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'invalidWage' } });
  }
  const byId = new Map(validated.map(row => [row.lineId, row]));
  return rows.map(row => byId.get(row.lineId));
}

export function validateWorkerMaterialSelection(rows, lineIds) {
  const fields = {};
  if (!Array.isArray(rows) || rows.length !== lineIds.length || !rows.length || rows.length > 50) throw Object.assign(new Error('invalidWork'), { fields: { materials: 'chooseMaterials' } });
  const seen = new Set();
  const result = rows.map((row, index) => {
    const prefix = `materials.${index}`;
    if (!identity(row?.lineId) || !lineIds.includes(row.lineId) || seen.has(row.lineId)) fields.materials = 'chooseMaterials';
    seen.add(row?.lineId);
    for (const key of ['fabricId', 'colorId', 'pieceId', 'sfifaId', 'variantId']) if (!identity(row?.[key])) fields[`${prefix}.${key}`] = key.startsWith('sfifa') || key === 'variantId' ? 'chooseStockSfifa' : 'chooseStockFabric';
    const units = sfifaQuantityUnits(row?.meters);
    if (units === null || units <= 0) fields[`${prefix}.meters`] = 'invalidMeters';
    const wage = row?.unitWage === undefined ? undefined : tailoringMoneyCents(row.unitWage);
    if (wage === null) fields[`${prefix}.unitWage`] = 'invalidWage';
    const size = typeof row?.size === 'string' ? row.size.trim().toUpperCase() : row?.size;
    if (size !== undefined && size !== '' && !WORKER_GARMENT_SIZES.includes(size)) fields[`${prefix}.size`] = 'invalidSize';
    const sfifaStyle = row?.sfifaStyle;
    if (sfifaStyle !== undefined && !SFIFA_METER_TYPES.includes(sfifaStyle)) fields[`${prefix}.sfifaStyle`] = 'chooseSfifaStyle';
    return { lineId: row?.lineId, ...Object.fromEntries(['fabricId', 'colorId', 'pieceId', 'sfifaId', 'variantId'].map(key => [key, String(row?.[key] || '').toLowerCase()])), meters: units === null ? 0 : units / 1000, ...(sfifaStyle !== undefined && SFIFA_METER_TYPES.includes(sfifaStyle) ? { sfifaStyle } : {}), ...(size && WORKER_GARMENT_SIZES.includes(size) ? { size } : {}), ...(wage !== undefined && wage !== null ? { unitWage: wage / 100 } : {}) };
  });
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidWork'), { fields });
  return result.sort((a, b) => a.lineId.localeCompare(b.lineId));
}
