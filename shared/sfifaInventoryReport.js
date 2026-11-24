import { SFIFA_METER_TYPES, SFIFA_STOCK_FAMILIES, SFIFA_STOCK_WIDTHS, SFIFA_STOCK_GROUP_LIMIT, sfifaQuantityUnits } from './sfifaStock.js';
import { sfifaStyleSummary } from './sfifaStyleBalances.js';

export function buildSfifaInventoryReport(items, { includeUnavailable = false } = {}) {
  if (!Array.isArray(items) || typeof includeUnavailable !== 'boolean') throw new Error('invalidInventoryReport');
  const rows = items.map(item => {
    const quantity = sfifaQuantityUnits(item.quantity, { max: SFIFA_STOCK_GROUP_LIMIT });
    if (quantity === null || !SFIFA_STOCK_WIDTHS.includes(item.width) || !SFIFA_STOCK_FAMILIES.some(row => row.value === item.family)) throw new Error('invalidInventoryReport');
    return { id: String(item._id), width: item.width, family: item.family, code: item.code ?? null, isUnassigned: item.isUnassigned === true, quantity: quantity / 1000, ...sfifaStyleSummary(item.styleMeters, quantity / 1000) };
  }).filter(row => includeUnavailable || row.quantity > 0).sort((a, b) => SFIFA_STOCK_WIDTHS.indexOf(a.width) - SFIFA_STOCK_WIDTHS.indexOf(b.width) || SFIFA_STOCK_FAMILIES.findIndex(row => row.value === a.family) - SFIFA_STOCK_FAMILIES.findIndex(row => row.value === b.family) || (a.code ?? Infinity) - (b.code ?? Infinity) || a.id.localeCompare(b.id));
  const keys = ['quantity', 'thin', 'thick', ...SFIFA_METER_TYPES, 'unclassifiedMeters'], units = Object.fromEntries(keys.map(key => [key, 0]));
  for (const row of rows) {
    const value = Math.round(row.quantity * 1000); units.quantity += value; units[row.width] += value;
    for (const style of SFIFA_METER_TYPES) units[style] += Math.round(row.styleMeters[style] * 1000);
    units.unclassifiedMeters += Math.round(row.unclassifiedMeters * 1000);
  }
  return { includeUnavailable, rows, totals: Object.fromEntries(keys.map(key => [key, units[key] / 1000])), count: rows.length, availableCount: rows.filter(row => row.quantity > 0).length, unavailableCount: rows.filter(row => row.quantity === 0).length, hasUnclassified: units.unclassifiedMeters > 0 };
}
