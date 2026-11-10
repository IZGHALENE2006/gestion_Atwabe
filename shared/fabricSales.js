import { calculateFabricReduction } from './fabrics.js';

const fail = message => Object.assign(new Error(message), { status: 400 });
export const normalizeFabricNumber = value => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '')
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
  .replace(/٫/g, '.').replace(',', '.');

export function validateFabricSaleInput(input) {
  const meters = calculateFabricReduction(normalizeFabricNumber(input?.meters), 1000000).meters;
  const pricingMode = input?.pricingMode;
  if (!['retail', 'wholesale'].includes(pricingMode)) throw fail('invalidSalePrice');
  const discountType = input.discountType ?? 'percent';
  const raw = normalizeFabricNumber(input.discountValue ?? 0);
  const discountValue = /^\d+(?:\.\d{1,2})?$/.test(raw) ? Number(raw) : NaN;
  if (!['percent', 'amount'].includes(discountType) || !Number.isFinite(discountValue) || discountValue < 0 || discountValue > (discountType === 'percent' ? 100 : 1000000000000)) throw fail('invalidSaleDiscount');
  if (input.clientName !== undefined && typeof input.clientName !== 'string') throw fail('invalidSaleClient');
  const clientName = (input.clientName || '').trim();
  if (clientName.length > 160 || [...clientName].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw fail('invalidSaleClient');
  const clientId = input.clientId === undefined || input.clientId === null || input.clientId === '' ? '' : input.clientId;
  if (typeof clientId !== 'string' || (clientId && !/^[a-f\d]{24}$/i.test(clientId))) throw fail('invalidSaleClient');
  return { meters, pricingMode, discountType, discountValue, clientId: clientId.toLowerCase(), clientName: clientId ? '' : clientName };
}

export const fabricSaleFingerprint = input => JSON.stringify([
  input.meters, input.pricingMode, input.discountType, input.discountValue, input.clientId, input.clientName,
]);

export function calculateFabricSale(input, fabric) {
  const value = validateFabricSaleInput(input);
  const price = fabric[value.pricingMode === 'wholesale' ? 'wholesalePricePerMeter' : 'salePricePerMeter'];
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > 1000000 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) throw fail('salePriceUnavailable');
  // Round once to centimes, including fractional metres, without floating point drift.
  const subtotalCents = Number((BigInt(Math.round(value.meters * 1000)) * BigInt(Math.round(price * 100)) + 500n) / 1000n);
  const discountCents = value.discountType === 'percent'
    ? Number((BigInt(subtotalCents) * BigInt(Math.round(value.discountValue * 100)) + 5000n) / 10000n)
    : Math.round(value.discountValue * 100);
  if (discountCents > subtotalCents) throw fail('invalidSaleDiscount');
  return { pricingMode: value.pricingMode, unitPrice: price, subtotal: subtotalCents / 100, discountType: value.discountType,
    discountValue: value.discountValue, discountAmount: discountCents / 100, total: (subtotalCents - discountCents) / 100 };
}

// An explicit allowlist also protects printed receipts from future internal fields.
export function publicFabricSaleReceipt(movement) {
  if (!movement?.sale) throw fail('invalidFabricSale');
  const sale = movement.sale;
  return {
    reference: movement.source === 'tailoring' ? movement.sourceOrderBarcode : 'FB-' + String(movement._id), source: movement.source === 'tailoring' ? 'tailoring' : 'direct', ...(movement.source === 'tailoring' ? { sourceOrderBarcode: movement.sourceOrderBarcode, sourceLineNumber: movement.sourceLineNumber } : {}), occurredAt: movement.occurredAt,
    type: movement.type, fabricReference: movement.reference || '', color: movement.color, colorNumber: movement.colorNumber || '',
    barcode: movement.barcode, meters: movement.meters, pricingMode: sale.pricingMode, unitPrice: sale.unitPrice,
    subtotal: sale.subtotal, discountType: sale.discountType, discountValue: sale.discountValue,
    discountAmount: sale.discountAmount, total: sale.total, clientName: sale.clientName || '', createdByName: sale.createdByName || '',
  };
}
