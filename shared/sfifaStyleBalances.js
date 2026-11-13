import { SFIFA_METER_TYPES } from './sfifaStock.js';

export const emptySfifaStyles = () => Object.fromEntries(SFIFA_METER_TYPES.map(key => [key, 0]));
const units = value => Math.round((value || 0) * 1000);
// If older stock was reduced without a color type, retain only amounts that are
// certain; the unresolved remainder stays explicitly unclassified.
export function normalizeSfifaStyles(styles, quantity) {
  const values = SFIFA_METER_TYPES.map(key => Math.max(0, units(styles?.[key])));
  const excess = Math.max(0, values.reduce((a, b) => a + b, 0) - units(quantity));
  return Object.fromEntries(SFIFA_METER_TYPES.map((key, index) => [key, Math.max(0, values[index] - excess) / 1000]));
}
export function sfifaStyleSummary(styles, quantity) {
  const styleMeters = normalizeSfifaStyles(styles, quantity);
  return { styleMeters, unclassifiedMeters: Math.max(0, units(quantity) - Object.values(styleMeters).reduce((sum, value) => sum + units(value), 0)) / 1000 };
}
