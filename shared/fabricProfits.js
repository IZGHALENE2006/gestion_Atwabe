import { searchMatches } from './globalSearch.js';

export const FABRIC_PROFIT_PERIODS = ['day', 'month', 'year', 'all'];
const fail = () => Object.assign(new Error('invalidProfitQuery'), { status: 400 });
const cents = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000000000 ? Math.round(value * 100) : null;
const amount = value => value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value) / 100;
const calendarFormatters = new Map();

// Snapshot the purchase cost in the same document write as the sale and stock debit.
// Missing historical purchase prices remain unknown; they are never treated as zero.
export function createFabricSaleFinancials(meters, purchaseUnitPrice, total) {
  if (!Number.isFinite(meters) || meters <= 0 || meters > 1000000 || Math.abs(meters * 1000 - Math.round(meters * 1000)) > 0.000001) return {};
  if (typeof purchaseUnitPrice !== 'number' || !Number.isFinite(purchaseUnitPrice) || purchaseUnitPrice < 0 || purchaseUnitPrice > 1000000 || Math.abs(purchaseUnitPrice * 100 - Math.round(purchaseUnitPrice * 100)) > 0.000001 || cents(total) === null) return {};
  const costCents = Number((BigInt(Math.round(meters * 1000)) * BigInt(Math.round(purchaseUnitPrice * 100)) + 500n) / 1000n);
  return { purchaseUnitPrice, costAmount: costCents / 100, profitAmount: (cents(total) - costCents) / 100 };
}

export function fabricProfitPeriodKey(value = new Date(), mode = 'day', timeZone) {
  if (value === null || value === '') return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!calendarFormatters.has(zone)) {
    if (calendarFormatters.size >= 32) calendarFormatters.clear();
    calendarFormatters.set(zone, new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: zone }));
  }
  const parts = Object.fromEntries(calendarFormatters.get(zone).formatToParts(date).map(part => [part.type, part.value]));
  return mode === 'year' ? parts.year : mode === 'month' ? parts.year + '-' + parts.month : parts.year + '-' + parts.month + '-' + parts.day;
}

export function validateFabricProfitQuery(query = {}) {
  const { mode = 'all', period = '', search = '', seller = '', timeZone = 'UTC', offset = '0', source = 'all' } = query;
  if (!['all', 'direct', 'tailoring'].includes(source) || !FABRIC_PROFIT_PERIODS.includes(mode) || typeof period !== 'string' || typeof search !== 'string' || search.length > 120 || [...search].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || typeof seller !== 'string' || seller && !/^[a-f\d]{24}$/i.test(seller) || typeof timeZone !== 'string' || timeZone.length > 80 || !timeZone || typeof offset !== 'string' || !/^\d{1,7}$/.test(offset) || Number(offset) > 1000000) throw fail();
  try { new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()); } catch { throw fail(); }
  if (mode !== 'all') {
    const year = Number(period.slice(0, 4));
    if (year < 1900 || year > 9999) throw fail();
    if (mode === 'year' && !/^\d{4}$/.test(period)) throw fail();
    if (mode === 'month' && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))) throw fail();
    if (mode === 'day' && (!/^\d{4}-\d{2}-\d{2}$/.test(period) || Number.isNaN(new Date(period + 'T12:00:00Z').getTime()) || new Date(period + 'T12:00:00Z').toISOString().slice(0, 10) !== period)) throw fail();
  }
  return { mode, source, period: mode === 'all' ? '' : period, search: search.trim(), seller: seller.toLowerCase(), timeZone, offset: Number(offset) };
}

export function fabricProfitEntries(movements) {
  const unique = new Map(movements.filter(row => row.sale && row.occurredAt !== null && row.occurredAt !== '' && Number.isFinite(new Date(row.occurredAt).getTime())).map(row => [String(row._id), row]));
  return [...unique.values()].map(row => {
    const sale = row.sale, revenueCents = cents(sale.total);
    const knownCost = cents(sale.costAmount) !== null && typeof sale.purchaseUnitPrice === 'number' && Number.isFinite(sale.purchaseUnitPrice) && sale.purchaseUnitPrice >= 0 && sale.purchaseUnitPrice <= 1000000;
    const costCents = knownCost ? cents(sale.costAmount) : null;
    return {
      id: String(row._id), reference: row.source === 'tailoring' ? row.sourceOrderBarcode : 'FB-' + String(row._id), occurredAt: row.occurredAt,
      source: row.source === 'tailoring' ? 'tailoring' : 'direct', ...(row.source === 'tailoring' ? { sourceOrderId: row.sourceOrderId, sourceOrderBarcode: row.sourceOrderBarcode, sourceLineId: row.sourceLineId, sourceLineNumber: row.sourceLineNumber, sourceGarmentType: row.sourceGarmentType } : {}), ...(row.cancelledAt ? { cancelledAt: row.cancelledAt } : {}),
      type: row.type, fabricReference: row.reference || '', color: row.color, colorNumber: row.colorNumber || '', barcode: row.barcode,
      meters: row.meters, beforeMeters: row.beforeMeters, remainingMeters: row.remainingMeters,
      sellerId: String(row.createdBy), sellerName: sale.createdByName || '', sellerRole: sale.createdByRole || '', clientName: sale.clientName || '',
      pricingMode: sale.pricingMode, unitPrice: sale.unitPrice, subtotal: sale.subtotal, discountType: sale.discountType,
      discountValue: sale.discountValue, discountAmount: sale.discountAmount,
      revenueAmount: revenueCents === null ? null : revenueCents / 100,
      purchaseUnitPrice: knownCost ? sale.purchaseUnitPrice : null, costAmount: costCents === null ? null : costCents / 100,
      profitAmount: revenueCents === null || costCents === null ? null : (revenueCents - costCents) / 100,
    };
  }).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || b.id.localeCompare(a.id));
}

export function filterFabricProfits(entries, { mode, period, search, seller, timeZone, source }) {
  return entries.filter(row => (!source || source === 'all' || row.source === source) && (!seller || row.sellerId === seller) && (mode === 'all' || fabricProfitPeriodKey(row.occurredAt, mode, timeZone) === period)
    && searchMatches([row.reference, row.sourceOrderBarcode, row.type, row.fabricReference, row.color, row.colorNumber, row.barcode, row.clientName, row.sellerName].join(' '), search));
}

export function summarizeFabricProfits(entries) {
  const cancelledCount = entries.filter(row => row.cancelledAt).length;
  entries = entries.filter(row => !row.cancelledAt);
  let revenue = 0n, cost = 0n, profit = 0n, discount = 0n, meters = 0n, unknownCount = 0;
  for (const row of entries) {
    const received = cents(row.revenueAmount), spent = cents(row.costAmount), reduction = cents(row.discountAmount);
    if (received !== null) revenue += BigInt(received);
    if (spent !== null) cost += BigInt(spent);
    if (received !== null && spent !== null) profit += BigInt(received) - BigInt(spent);
    else unknownCount += 1;
    if (reduction !== null) discount += BigInt(reduction);
    if (Number.isFinite(row.meters)) meters += BigInt(Math.round(row.meters * 1000));
  }
  const allUnknown = entries.length > 0 && unknownCount === entries.length;
  return { saleCount: entries.length, cancelledCount, totalMeters: meters > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(meters) / 1000,
    revenueAmount: amount(revenue), costAmount: allUnknown ? null : amount(cost), profitAmount: allUnknown ? null : amount(profit),
    discountAmount: amount(discount), unknownCount, knownCount: entries.length - unknownCount };
}

export function groupFabricProfits(entries, mode, timeZone) {
  const unit = mode === 'all' ? 'year' : mode === 'year' ? 'month' : 'day', groups = new Map();
  for (const row of entries) {
    const key = fabricProfitPeriodKey(row.occurredAt, unit, timeZone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, rows]) => ({ key, unit, ...summarizeFabricProfits(rows) }));
}

// Reuse the sale receipt, keeping internal costs and profits outside the document.
export function fabricProfitReceiptMovement(entry) {
  return { _id: entry.id, source: entry.source, sourceOrderBarcode: entry.sourceOrderBarcode, sourceLineNumber: entry.sourceLineNumber, type: entry.type, reference: entry.fabricReference, color: entry.color, colorNumber: entry.colorNumber,
    barcode: entry.barcode, meters: entry.meters, occurredAt: entry.occurredAt,
    sale: { pricingMode: entry.pricingMode, unitPrice: entry.unitPrice, subtotal: entry.subtotal, discountType: entry.discountType,
      discountValue: entry.discountValue, discountAmount: entry.discountAmount, total: entry.revenueAmount, clientName: entry.clientName, createdByName: entry.sellerName } };
}
