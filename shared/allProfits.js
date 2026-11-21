import { fabricProfitEntries, fabricProfitPeriodKey, validateFabricProfitQuery } from './fabricProfits.js';
import { tailoringFabricProfitMovements } from './tailoringFabricSales.js';
import { tailoringProfitEntries } from './tailoringProfits.js';
import { TAILORING_GARMENT_TYPES, tailoringGarmentType } from './tailoring.js';
import { payrollCents } from './employeePayroll.js';

export function validateAllProfitQuery(query = {}) {
  const { mode, period, timeZone } = validateFabricProfitQuery(query);
  return { mode, period, timeZone };
}

const cents = value => typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;
function sum(rows, field) {
  let total = 0n;
  for (const row of rows) {
    const value = cents(row[field]);
    if (value === null) return null;
    total += BigInt(value);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) || total < -BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(total) / 100;
}
function summarize(rows) {
  const tailoring = rows.filter(row => row.source === 'tailoring'), fabrics = rows.filter(row => row.source === 'fabrics'), sales = rows.filter(row => row.source === 'sales');
  return {
    totalProfit: sum(rows, 'profitAmount'), tailoringProfit: sum(tailoring, 'profitAmount'), fabricProfit: sum(fabrics, 'profitAmount'), salesProfit: sum(sales, 'profitAmount'),
    salesGrossProfit: sum(sales, 'grossProfit'), employeeShares: sum(sales, 'employeeShare'),
    tailoringOrderCount: tailoring.length, fabricSaleCount: fabrics.length, productSaleCount: sales.length,
    unknownCount: rows.filter(row => cents(row.profitAmount) === null).length,
  };
}

// Orders already expense the cloth at its retail value. Its purchase-to-retail
// margin belongs to fabrics, once only, using the existing saved sale snapshot.
// Product commissions must be allocated over FULL months before period filtering.
export function buildAllProfits({ sales = [], orders = [], fabricMovements = [] }, filters) {
  const rows = [
    ...tailoringProfitEntries(orders, 'all').map(entry => ({ source: 'tailoring', occurredAt: entry.deliveredAt, garmentType: tailoringGarmentType(entry.order), profitAmount: entry.profitAmount })),
    ...fabricProfitEntries([...fabricMovements, ...tailoringFabricProfitMovements(orders)]).filter(entry => !entry.cancelledAt).map(entry => ({ source: 'fabrics', occurredAt: entry.occurredAt, profitAmount: entry.profitAmount })),
    ...sales.filter(sale => sale.DateVante != null && sale.DateVante !== '' && Number.isFinite(new Date(sale.DateVante).getTime())).map(sale => {
      const profit = payrollCents(sale.profite, true), share = payrollCents(sale.employeeShareAmount);
      return { source: 'sales', occurredAt: sale.DateVante, grossProfit: profit === null ? null : profit / 100, employeeShare: share === null ? null : share / 100, profitAmount: profit === null || share === null ? null : (profit - share) / 100 };
    }),
  ].filter(row => filters.mode === 'all' || fabricProfitPeriodKey(row.occurredAt, filters.mode, filters.timeZone) === filters.period);
  const unit = filters.mode === 'all' ? 'year' : filters.mode === 'year' ? 'month' : 'day', grouped = new Map();
  for (const row of rows) {
    const key = fabricProfitPeriodKey(row.occurredAt, unit, filters.timeZone);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return {
    summary: summarize(rows),
    sections: TAILORING_GARMENT_TYPES.map(garmentType => {
      const entries = rows.filter(row => row.source === 'tailoring' && row.garmentType === garmentType);
      return { garmentType, profitAmount: sum(entries, 'profitAmount'), orderCount: entries.length };
    }),
    groups: [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, entries]) => ({ key, unit, ...summarize(entries) })),
  };
}
