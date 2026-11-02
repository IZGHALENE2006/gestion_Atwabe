import Product from '../models/productModel.js';
import { hasProductBatches, productBatches, receivedProductBatches, INITIAL_BATCH_ID, batchFail } from '../../shared/productBatches.js';

export const productVersionScope = product => product.__v == null ? { $or: [{ __v: { $exists: false } }, { __v: 0 }] } : { __v: product.__v };
export function groupProductStock(lines) {
  const groups = new Map();
  for (const line of lines) {
    const id = String(line.product._id), batchId = line.batch.batchId;
    if (!groups.has(id)) groups.set(id, { id, qty: 0, batches: [] });
    const group = groups.get(id);
    group.qty += line.qty;
    const entry = group.batches.find(batch => batch.batchId === batchId);
    if (entry) entry.qty += line.qty; else group.batches.push({ batchId, qty: line.qty, pricing: Object.fromEntries(['prix_achat', 'prix_vente', 'prix_gros', 'frais_unitaire'].map(key => [key, line.batch[key] ?? null])) });
  }
  for (const group of groups.values()) if (!Number.isSafeInteger(group.qty)) throw batchFail('productRestockInvalidQuantity');
  return [...groups.values()];
}

// Each movement compares the product version, quantity and complete batch snapshot.
// Restocking, editing, cash sales, credit sales and stock notes use the same guard.
export async function changeProductStock(stock, owner, { operationId, release = false, add = false, session } = {}) {
  for (let attempt = 0; attempt < 12; attempt++) {
    let query = Product.findOne({ _id: stock.id, idAdmin: owner });
    if (session) query = query.session(session);
    const product = await query;
    if (!product) throw batchFail('productBatchUnavailable', 409);
    const applied = (product.creditStockDebits || []).some(id => String(id) === String(operationId));
    if (operationId && ((!release && applied) || (release && !applied))) return product;
    const direction = release || add ? 1 : -1;
    const batches = receivedProductBatches(product), pricedBatches = productBatches(product);
    for (const allocation of stock.batches || [{ batchId: INITIAL_BATCH_ID, qty: stock.qty }]) {
      const batch = batches.find(entry => entry.batchId === allocation.batchId);
      if (!batch || !Number.isSafeInteger(allocation.qty) || allocation.qty < 1 || !Number.isSafeInteger(batch.quantite + direction * allocation.qty) || batch.quantite + direction * allocation.qty < 0) throw batchFail('productBatchStockChanged', 409);
      const priced = pricedBatches.find(entry => entry.batchId === allocation.batchId);
      if (!release && !add && allocation.pricing && Object.entries(allocation.pricing).some(([key, value]) => (priced[key] ?? null) !== value)) throw batchFail('productBatchStockChanged', 409);
      batch.quantite += direction * allocation.qty;
    }
    const quantity = Number(product.quantite) + direction * stock.qty;
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw batchFail('productBatchStockChanged', 409);
    const scope = { _id: product._id, idAdmin: owner, ...productVersionScope(product), quantite: product.quantite,
      stockBatches: hasProductBatches(product) ? product.stockBatches : { $exists: false },
      ...(operationId ? { creditStockDebits: release ? operationId : { $ne: operationId } } : {}) };
    const update = { $inc: { quantite: direction * stock.qty, __v: 1 }, ...(hasProductBatches(product) ? { $set: { stockBatches: batches } } : {}),
      ...(operationId ? release ? { $pull: { creditStockDebits: operationId } } : { $addToSet: { creditStockDebits: operationId } } : {}) };
    const result = await Product.findOneAndUpdate(scope, update, { new: true, runValidators: true, ...(session ? { session } : {}) });
    if (result) return result;
  }
  throw batchFail('productBatchStockChanged', 409);
}
