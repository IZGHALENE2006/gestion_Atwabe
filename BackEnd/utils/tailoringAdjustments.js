import { tailoringCostSettingsModel } from './tailoringCostSettings.js';
import { quoteTailoringAdjustments, validateTailoringDiscount, tailoringAllowsFourFille } from '../../shared/tailoringAdjustments.js';
import { tailoringMoneyCents } from '../../shared/tailoring.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const discountKey = discount => { const value = validateTailoringDiscount(discount); return value.value === 0 ? '0' : JSON.stringify(value); };
function discountsChanged(value, current) {
  if (discountKey(value.adjustments.discount) !== discountKey(current?.adjustments?.discount)) return true;
  return value.items.some(item => discountKey(item.discount) !== discountKey(current?.items?.find(old => old.lineId === item.lineId)?.pricing?.discount));
}
export async function applyTailoringAdjustments(value, idAdmin, current, permissions) {
  if (!value.adjustments) {
    if (current?.adjustments) throw Object.assign(fail('invalidOrder', 400), { fields: { adjustments: 'adjustmentsRequired' } });
    return value;
  }
  if (!permissions.discount && discountsChanged(value, current)) throw fail('forbidden', 403);
  let rate, settingsVersion;
  if (current?.adjustments) {
    rate = current.adjustments.fourFilleUnitPrice; settingsVersion = current.adjustments.settingsVersion;
  } else {
    const settings = await tailoringCostSettingsModel(value.garmentType).findOne({ idAdmin });
    rate = tailoringAllowsFourFille(value.garmentType) ? settings?.fourFillePrice ?? 0 : 0; settingsVersion = settings?.__v ?? null;
  }
  if (tailoringMoneyCents(rate) !== tailoringMoneyCents(value.adjustments.fourFilleUnitPrice) || settingsVersion !== value.adjustments.settingsVersion) throw fail('costSettingsChanged');
  const quote = quoteTailoringAdjustments(value.items, rate, value.adjustments.discount);
  if (tailoringMoneyCents(value.paidAmount) > tailoringMoneyCents(quote.totalPrice)) throw Object.assign(fail('invalidOrder', 400), { fields: { paidAmount: 'paidExceedsPrice' } });
  const items = quote.items.map(item => { const { fourFille: _fourFille, discount: _discount, ...stored } = item; return stored; });
  return { ...value, totalPrice: quote.totalPrice, items, adjustments: { ...quote.adjustments, settingsVersion } };
}
