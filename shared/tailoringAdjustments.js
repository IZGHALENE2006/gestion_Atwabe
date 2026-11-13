import { MAX_TAILORING_ITEMS, tailoringMoneyCents } from './tailoring.js';

const limit = 99999999999;
const invalid = (key, code) => { throw Object.assign(new Error('invalidOrder'), { fields: { [key]: code } }); };
export const emptyTailoringDiscount = () => ({ type: 'amount', value: 0 });
export const tailoringAllowsFourFille = (garmentType = 'djellaba') => ['djellaba', 'jabador', 'malakiya', 'shirts'].includes(garmentType);

export function validateTailoringDiscount(raw, key = 'discount') {
  if (raw === undefined) return emptyTailoringDiscount();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['amount', 'percent'].includes(raw.type)) invalid(key, 'invalidDiscount');
  const cents = tailoringMoneyCents(raw.value === '' ? 0 : raw.value);
  if (cents === null || raw.type === 'percent' && cents > 10000) invalid(key, 'invalidDiscount');
  return { type: raw.type, value: cents / 100 };
}

function discounted(cents, discount, key) {
  const value = tailoringMoneyCents(discount.value);
  const amount = discount.type === 'percent' ? Number((BigInt(cents) * BigInt(value) + 5000n) / 10000n) : value;
  if (amount > cents) invalid(key, 'discountExceedsPrice');
  return { discountAmount: amount / 100, price: (cents - amount) / 100 };
}

// All percentage calculations round once, in integer centimes. The order discount
// is applied after the independent piece discounts and optional 4fille additions.
export function quoteTailoringAdjustments(items, fourFilleUnitPrice, rawDiscount) {
  if (!Array.isArray(items) || !items.length || items.length > MAX_TAILORING_ITEMS) invalid('items', 'invalidItems');
  const rate = tailoringMoneyCents(fourFilleUnitPrice);
  if (rate === null) invalid('adjustments', 'invalidMoney');
  const priced = items.map((item, index) => {
    const key = `items.${index}.discount`;
    const base = tailoringMoneyCents(item.price);
    if (base === null) invalid(`items.${index}.price`, 'invalidMoney');
    if (item.fourFille !== undefined && typeof item.fourFille !== 'boolean') invalid(`items.${index}.fourFille`, 'invalidFourFille');
    const fourFille = item.fourFille === true, fourFilleAmount = fourFille ? rate : 0;
    const gross = base + fourFilleAmount;
    if (gross > limit) invalid(`items.${index}.price`, 'costsTooLarge');
    const discount = validateTailoringDiscount(item.discount, key);
    const result = discounted(gross, discount, key);
    return { ...item, price: result.price, pricing: { basePrice: base / 100, fourFille, fourFilleAmount: fourFilleAmount / 100, grossPrice: gross / 100, discount, discountAmount: result.discountAmount } };
  });
  const subtotal = priced.reduce((sum, item) => sum + tailoringMoneyCents(item.price), 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > limit) invalid('totalPrice', 'costsTooLarge');
  const discount = validateTailoringDiscount(rawDiscount, 'adjustments.discount');
  const result = discounted(subtotal, discount, 'adjustments.discount');
  return { items: priced, totalPrice: result.price, adjustments: { version: 1, fourFilleUnitPrice: rate / 100, discount, subtotal: subtotal / 100, discountAmount: result.discountAmount } };
}

export function validateTailoringAdjustmentInput(raw, rawItems, garmentType) {
  if (raw === undefined) {
    if (rawItems.some(item => item?.fourFille !== undefined || item?.discount !== undefined)) invalid('adjustments', 'adjustmentsRequired');
    return undefined;
  }
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { invalid('adjustments', 'adjustmentsRequired'); } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) invalid('adjustments', 'adjustmentsRequired');
  const rate = tailoringMoneyCents(raw.fourFilleUnitPrice);
  const version = raw.settingsVersion;
  if (rate === null || !(version === null || Number.isSafeInteger(version) && version >= 0)) invalid('adjustments', 'costSettingsRequired');
  if (!tailoringAllowsFourFille(garmentType) && (rate !== 0 || rawItems.some(item => item?.fourFille === true))) invalid('adjustments', 'invalidFourFille');
  return { version: 1, fourFilleUnitPrice: rate / 100, settingsVersion: version, discount: validateTailoringDiscount(raw.discount, 'adjustments.discount') };
}

export function tailoringSuggestedDeposit(total) {
  const cents = tailoringMoneyCents(total);
  return cents === null ? null : Number((BigInt(cents) * 60n + 50n) / 100n) / 100;
}

export function publicTailoringItemPricing(pricing) {
  return { basePrice: pricing.basePrice, fourFille: pricing.fourFille, fourFilleAmount: pricing.fourFilleAmount, grossPrice: pricing.grossPrice, discount: { type: pricing.discount.type, value: pricing.discount.value }, discountAmount: pricing.discountAmount };
}
export function publicTailoringAdjustments(adjustments) {
  return { version: 1, fourFilleUnitPrice: adjustments.fourFilleUnitPrice, subtotal: adjustments.subtotal, discount: { type: adjustments.discount.type, value: adjustments.discount.value }, discountAmount: adjustments.discountAmount };
}
