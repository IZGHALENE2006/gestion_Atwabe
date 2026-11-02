import { roundMoney } from './saleTotals.js';
import { resolveProductFees } from './productFees.js';

export const INITIAL_BATCH_ID = 'initial';
export const hasProductBatches = product => Array.isArray(product?.stockBatches) && product.stockBatches.length > 0;
export const batchRowKey = item => String(item.id || item._id) + ':' + (item.batchId || INITIAL_BATCH_ID) + ':' + (item.priceType || 'retail');
export const validBatchId = value => value === INITIAL_BATCH_ID || (typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value));
export const batchFail = (message, status = 400) => Object.assign(new Error(message), { status });

// Receipt data retains each batch's original purchase cost, fees and quantity.
export function receivedProductBatches(product) {
  if (hasProductBatches(product)) return product.stockBatches.map(batch => batch.toObject ? batch.toObject() : { ...batch });
  return [{ batchId: INITIAL_BATCH_ID, number: 1, initialQuantity: Number(product?.quantite || 0), quantite: Number(product?.quantite || 0),
    prix_achat: Number(product?.prix_achat || 0), prix_vente: Number(product?.prix_vente || 0), prix_gros: product?.prix_gros ?? null,
    frais_total: Number(product?.frais_total || 0), frais_quantite: Number(product?.frais_quantite || 0), frais_unitaire: Number(product?.frais_unitaire || 0),
    fournisseur: product?.fournisseur || '', receivedAt: product?.datecreate || null }];
}

// The latest receipt sets selling prices for all stock, even after it is sold out.
// Older multi-price products follow this rule without changing their receipts.
export function productBatches(product) {
  const batches = receivedProductBatches(product), latest = batches.at(-1);
  return batches.map(batch => ({ ...batch, prix_vente: Number(latest.prix_vente), prix_gros: latest.prix_gros ?? null }));
}

export function selectProductBatch(product, batchId) {
  if (batchId !== undefined && !validBatchId(batchId)) throw batchFail('productBatchInvalid');
  const batches = productBatches(product);
  if (batchId === undefined && batches.length > 1) throw batchFail('productBatchRequired', 409);
  const batch = batches.find(entry => entry.batchId === (batchId ?? batches[0].batchId));
  if (!batch) throw batchFail('productBatchUnavailable', 409);
  return batch;
}

export function stockRetailValue(product) {
  return roundMoney(productBatches(product).reduce((sum, batch) => sum + Number(batch.quantite) * Number(batch.prix_vente), 0));
}
export function stockPriceRange(product) {
  const batches = productBatches(product), available = batches.filter(batch => batch.quantite > 0);
  const prices = (available.length ? available : batches).map(batch => Number(batch.prix_vente));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function normalizeRestock(body = {}) {
  if (!validBatchId(body.requestId) || body.requestId === INITIAL_BATCH_ID) throw batchFail('productRestockInvalidRequest');
  if (!['number', 'string'].includes(typeof body.quantite) || String(body.quantite).trim() === '' || !Number.isSafeInteger(Number(body.quantite)) || Number(body.quantite) < 1 || Number(body.quantite) > 1e9) throw batchFail('productRestockInvalidQuantity');
  const money = value => {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9) throw batchFail('invalidPrice');
    return roundMoney(Number(value));
  };
  if (body.prix_vente_base === undefined && body.prix_vente === undefined) throw batchFail('invalidPrice');
  const quantite = Number(body.quantite), prix_achat = money(body.prix_achat);
  const pricing = resolveProductFees({ ...body, frais_quantite: quantite });
  if (pricing.prix_vente > 1e9 || pricing.prix_gros > 1e9 || pricing.frais_total > 1e9) throw batchFail('invalidPrice');
  const fournisseur = body.fournisseur ?? '', note = body.note ?? '';
  if (typeof fournisseur !== 'string' || fournisseur.trim().length > 160 || typeof note !== 'string' || note.trim().length > 500) throw batchFail('productRestockInvalidDetails');
  return { requestId: body.requestId.toLowerCase(), quantite, prix_achat, ...pricing, fournisseur: fournisseur.trim(), note: note.trim() };
}
