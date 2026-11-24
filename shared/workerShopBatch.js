import { validateWorkerWork } from './workerWork.js';
import { tailoringMoneyCents } from './tailoring.js';
import { SHOP_FLOW_GARMENTS } from './workerShopFlow.js';
import { WORKER_CLIENT_BATCH_LIMIT, workerBatchLocked, submitWorkerClientBatch } from './workerClientBatch.js';

export const WORKER_SHOP_BATCH_LIMIT = WORKER_CLIENT_BATCH_LIMIT;

export function validateWorkerShopBatch(data, category, garmentType, ledger = new Map()) {
  const selections = data.shopSelections;
  if (!['finishing', 'mesbanto'].includes(category) || !SHOP_FLOW_GARMENTS.includes(garmentType) || !Array.isArray(selections) || !selections.length || selections.length > WORKER_SHOP_BATCH_LIMIT || new Set(selections.map(row => row?.shopOriginId)).size !== selections.length) {
    throw Object.assign(new Error('invalidWork'), { fields: { shopSelections: 'chooseShopWork' } });
  }
  const fields = {}, inputs = [];
  selections.forEach((row, index) => {
    const previous = ledger.get(row?.shopOriginId);
    if (workerBatchLocked(previous)) { inputs.push(previous.input); return; }
    const unitWage = row?.unitWage === '' || row?.unitWage == null ? data.unitWage : row.unitWage;
    try {
      if (tailoringMoneyCents(unitWage) === null) throw Object.assign(new Error('invalidWork'), { fields: { unitWage: 'invalidWage' } });
      inputs.push(validateWorkerWork({ category, workType: 'shop', garmentType, shopOriginId: row?.shopOriginId, lineIds: row?.lineIds, unitWage }));
    } catch (error) {
      for (const [key, value] of Object.entries(error.fields || { shopOriginId: 'chooseShopWork' })) fields[`shopSelections.${index}.${key}`] = value;
    }
  });
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidWork'), { fields });
  return inputs;
}

export const submitWorkerShopBatch = (inputs, ledger, send, onProgress, makeRequestId) => submitWorkerClientBatch(inputs, ledger, send, onProgress, makeRequestId, input => input.shopOriginId);
