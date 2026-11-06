import { normalizedProductBarcode } from "./productBarcodes.js";
import { productBatches, batchRowKey, batchFail } from './productBatches.js';
import { getProductSalePrice, hasWholesalePrice } from './productPricing.js';

export const cashierRowKey = batchRowKey;
export function cashierBatchChoices(product, priceType = 'retail') {
  return productBatches(product)
    .filter(batch => batch.quantite > 0 && (priceType !== 'wholesale' || hasWholesalePrice(batch)))
    .map(batch => ({ id: String(product._id), batchId: batch.batchId, batchNumber: batch.number, barcode: batch.barcode, receivedAt: batch.receivedAt,
      price: getProductSalePrice(batch, priceType), priceType, quantite: batch.quantite,
      retailPrice: Number(batch.prix_vente), wholesalePrice: hasWholesalePrice(batch) ? Number(batch.prix_gros) : null,
      key: batchRowKey({ id: product._id, batchId: batch.batchId, priceType }) }));
}

export function cashierAvailableQuantity(product, choice, cart, replacingKey) {
  const batch = cashierBatchChoices(product, choice.priceType).find(entry => entry.batchId === choice.batchId && entry.price === Number(choice.price));
  if (!batch) return 0;
  const used = cart.filter(item => String(item.id) === String(product._id) && (item.batchId || 'initial') === batch.batchId && cashierRowKey(item) !== replacingKey)
    .reduce((sum, item) => sum + item.qty, 0);
  return Math.max(0, batch.quantite - used);
}

// Each row keeps the chosen batch. Quantity changes never use another batch,
// including when the selling prices match.
export function cashierCartRows(cart, products = []) {
  const rows = new Map();
  for (const item of cart) {
    const key = cashierRowKey(item);
    if (!rows.has(key)) rows.set(key, { ...item, key, price: Number(item.price), priceType: item.priceType || 'retail', qty: 0 });
    rows.get(key).qty += item.qty;
  }
  return [...rows.values()].map(row => {
    const product = products.find(entry => String(entry._id) === String(row.id));
    const choice = product && cashierBatchChoices(product, row.priceType).find(entry => entry.batchId === row.batchId);
    return { ...row, stockMax: product ? cashierAvailableQuantity(product, row, cart, row.key) : row.stockMax ?? row.qty,
      wholesalePrice: choice ? choice.wholesalePrice : row.wholesalePrice ?? null };
  });
}

export function addCashierBatch(cart, product, choice, quantity = 1, replacingKey) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw batchFail('productRestockInvalidQuantity');
  const batch = cashierBatchChoices(product, choice?.priceType).find(entry => entry.batchId === choice?.batchId && entry.price === Number(choice?.price));
  if (!batch || cashierAvailableQuantity(product, batch, cart, replacingKey) < quantity) throw batchFail('productBatchStockChanged');
  const result = cart.filter(item => cashierRowKey(item) !== replacingKey).map(item => ({ ...item }));
  const line = { id: String(product._id), batchId: batch.batchId, batchNumber: batch.batchNumber, name: product.name,
    price: batch.price, expectedUnitPrice: batch.price, priceType: batch.priceType, retailPrice: batch.retailPrice, wholesalePrice: batch.wholesalePrice, stockMax: batch.quantite, qty: quantity };
  const existing = result.find(item => cashierRowKey(item) === cashierRowKey(line));
  if (existing) Object.assign(existing, line, { qty: existing.qty + quantity }); else result.push(line);
  return result;
}

export function setCashierRowQuantity(cart, product, key, quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw batchFail('productRestockInvalidQuantity');
  const row = cashierCartRows(cart).find(entry => entry.key === key);
  if (!row) return cart;
  if (quantity > row.qty) return addCashierBatch(cart, product, row, quantity - row.qty);
  return cart.flatMap(item => cashierRowKey(item) === key ? quantity ? [{ ...item, qty: quantity }] : [] : [{ ...item }]);
}

// Include exhausted lots so a scanned code can never silently use another lot.
export function cashierBarcodeMatches(products, code) {
  const value = normalizedProductBarcode(code);
  if (!value) return [];
  return (products || []).flatMap(product => productBatches(product)
    .filter(batch => normalizedProductBarcode(batch.barcode) === value)
    .map(batch => ({ product, batch })));
}
