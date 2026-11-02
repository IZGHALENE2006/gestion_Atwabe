import { changeProductStock } from './productStock.js';
import { batchFail } from '../../shared/productBatches.js';
const queues = new Map();
export async function withProductCheckoutLock(owner, action) {
  const key = String(owner), previous = queues.get(key);
  let release;
  const current = new Promise(resolve => { release = resolve; });
  queues.set(key, current);
  await previous;
  try { return await action(); } finally { release(); if (queues.get(key) === current) queues.delete(key); }
}
export async function reserveCheckoutStock(operation, owner, Model, errorCode) {
  const stock = operation.plan.stock.map(entry => ({ ...entry, id: entry.id || entry.productId }));
  const cancel = async () => {
    // Persist the rollback intention before releasing individual product debits.
    await Model.updateOne({ _id: operation._id, idAdmin: owner }, { $set: { status: 'cancelling' } });
    for (const previous of stock) await changeProductStock(previous, owner, { operationId: operation._id, release: true });
    await Model.updateOne({ _id: operation._id, idAdmin: owner }, { $set: { status: 'cancelled' } });
    throw batchFail(errorCode);
  };
  if (operation.status === 'cancelled') throw batchFail(errorCode);
  if (operation.status === 'cancelling') return cancel();
  for (const entry of stock) {
    try { await changeProductStock(entry, owner, { operationId: operation._id }); }
    catch (error) { if (error.message === 'productBatchStockChanged' || error.message === 'productBatchUnavailable') return cancel(); throw error; }
  }
}
