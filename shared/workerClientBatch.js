import { validateWorkerWork, WORK_TRACKING_CATEGORIES } from './workerWork.js';
import { tailoringMoneyCents } from './tailoring.js';

export const WORKER_CLIENT_BATCH_LIMIT = 50;
export const workerBatchLocked = row => ['saved', 'uncertain', 'saving'].includes(row?.status);

export function validateWorkerClientBatch(data, category, ledger = new Map()) {
  const selections = data.orderSelections;
  if (!WORK_TRACKING_CATEGORIES.includes(category) || !Array.isArray(selections) || !selections.length || selections.length > WORKER_CLIENT_BATCH_LIMIT || new Set(selections.map(row => row?.orderId)).size !== selections.length) {
    throw Object.assign(new Error('invalidWork'), { fields: { orderSelections: 'chooseOrders' } });
  }
  const fields = {}, inputs = [];
  selections.forEach((row, index) => {
    const previous = ledger.get(row?.orderId);
    // A request whose response was lost must replay its ORIGINAL payload and ID.
    if (workerBatchLocked(previous)) { inputs.push(previous.input); return; }
    const unitWage = row?.unitWage === '' || row?.unitWage == null ? data.unitWage : row.unitWage;
    try {
      if (tailoringMoneyCents(unitWage) === null) throw Object.assign(new Error('invalidWork'), { fields: { unitWage: 'invalidWage' } });
      const quantity = row?.quantity === '' || row?.quantity == null ? data.quantity : row.quantity;
      inputs.push(validateWorkerWork({ category, workType: 'client', orderId: row?.orderId, lineIds: row?.lineIds, unitWage,
        ...(category === 'sfifa' ? { quantity, sfifa: { width: data.width, family: data.family, code: data.code } } : {}),
      }));
    } catch (error) {
      for (const [key, value] of Object.entries(error.fields || { orderId: 'chooseOrder' })) fields[`orderSelections.${index}.${key}`] = value;
    }
  });
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidWork'), { fields });
  return inputs;
}

export async function submitWorkerClientBatch(inputs, ledger, send, onProgress = () => {}, makeRequestId = () => crypto.randomUUID()) {
  for (const input of inputs) {
    let entry = ledger.get(input.orderId);
    if (entry?.status === 'saved') continue;
    const fingerprint = JSON.stringify(input);
    if (!entry || entry.fingerprint !== fingerprint) entry = { input, fingerprint, requestId: makeRequestId() };
    ledger.set(input.orderId, { ...entry, status: 'saving' }); onProgress();
    try {
      const work = await send(entry.input, entry.requestId);
      if (!work?._id) throw new Error('Invalid work response');
      ledger.set(input.orderId, { ...entry, status: 'saved', work });
    } catch (error) {
      const status = error.response?.status, code = error.response?.data?.message || 'saveWorkFailed';
      const uncertain = !status || status >= 500 || /pending/i.test(code);
      ledger.set(input.orderId, { ...entry, status: uncertain ? 'uncertain' : 'failed', code,
        fields: error.response?.data?.fields || {}, blockers: Array.isArray(error.response?.data?.blockers) ? error.response.data.blockers : [],
      });
    }
    onProgress();
  }
  const entries = inputs.map(input => ledger.get(input.orderId));
  return { complete: entries.every(row => row.status === 'saved'), works: entries.filter(row => row.status === 'saved').map(row => row.work) };
}
