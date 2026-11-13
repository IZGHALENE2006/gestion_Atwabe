import { SFIFA_METER_TYPES, sfifaQuantityUnits } from './sfifaStock.js';

export const tailoringSfifaStyle = type => ({ single: 'fabric', double: 'twoTone', gradient: 'gradient' })[type];
export function validateTailoringSfifaSelection(raw) {
  if (raw === undefined) return undefined;
  const fields = {}, identity = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
  for (const key of ['stockId', 'variantId']) if (!identity(raw?.[key])) fields['sfifa.stock.' + key] = 'chooseStockSfifa';
  const units = sfifaQuantityUnits(raw?.meters);
  if (units === null || units <= 0) fields['sfifa.stock.meters'] = 'invalidSfifaMeters';
  if (raw?.meterType !== undefined && !SFIFA_METER_TYPES.includes(raw.meterType)) fields['sfifa.stock.meterType'] = 'chooseSfifaMeterType';
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidOrder'), { fields });
  return { stockId: raw.stockId.toLowerCase(), variantId: raw.variantId.toLowerCase(), meters: units / 1000, ...(raw.meterType === undefined ? {} : { meterType: raw.meterType }) };
}
