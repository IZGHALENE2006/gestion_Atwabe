import { validateWorkerWork, nextWorkSequence } from './workerWork.js';
import { workerMaterialRows } from './workerMaterials.js';

export const supportsWorkerWorkEdit = work => work?.category === 'sfifa' || ['machine', 'trousers'].includes(work?.category) && (work.workType || 'shop') === 'shop';
export const workerWorkEditable = work => supportsWorkerWorkEdit(work) && !work.deletedAt && !work.cancelledAt && !work.completions?.length && work.completedQuantity === 0;
export function validateWorkerWorkEdit(input, work) {
  return validateWorkerWork({ ...Object.fromEntries(['productName', 'quantity', 'unitWage', 'sfifa', 'linkOrder', 'orderId', 'lineIds', 'materials', 'shopDjellaba', 'shopTrouser', 'trouserType'].filter(key => input[key] !== undefined).map(key => [key, input[key]])), category: work.category, workType: work.workType || 'shop', ...(work.garmentType ? { garmentType: work.garmentType } : {}) });
}
export function workerEditSnapshot(work) {
  const plain = value => value?.toObject ? value.toObject() : value;
  return { productName: work.productName, quantity: work.quantity, ...(work.unitWage !== undefined ? { unitWage: work.unitWage } : {}), ...(work.sfifa ? { sfifa: plain(work.sfifa) } : {}), ...(work.shopDjellaba ? { shopDjellaba: plain(work.shopDjellaba) } : {}), ...(work.shopTrouser ? { shopTrouser: plain(work.shopTrouser), trouserType: work.trouserType } : {}), ...(work.tailoring ? { tailoring: plain(work.tailoring) } : {}), ...(workerMaterialRows(work).length ? { materials: workerMaterialRows(work).map(plain) } : {}) };
}
export function applyWorkerWorkEdit(work, details, requestId, createdBy, fingerprint, actorName = '') {
  const before = workerEditSnapshot(work), sequence = nextWorkSequence(work);
  if (work.initialQuantity === undefined) work.initialQuantity = work.quantity;
  for (const key of ['productName', 'quantity', 'unitWage', 'sfifa', 'shopDjellaba', 'shopTrouser', 'trouserType', 'tailoring']) work[key] = details[key];
  work.edits ||= [];
  work.edits.push({ requestId, fingerprint, createdBy, actorName, date: new Date(), sequence, before: before.quantity, after: work.quantity, beforeSnapshot: before, afterSnapshot: workerEditSnapshot(work) });
}
