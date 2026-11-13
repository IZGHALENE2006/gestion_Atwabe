import TailoringOrder from '../models/TailoringOrder.js';
import WorkerWork from '../models/WorkerWork.js';
import { SFIFA_METER_TYPES } from '../../shared/sfifaStock.js';
import { emptySfifaStyles, normalizeSfifaStyles, sfifaStyleSummary } from '../../shared/sfifaStyleBalances.js';

const same = (a, b) => String(a) === String(b);
const units = value => Math.round((value || 0) * 1000);
export function sfifaStyleTarget(stock, variantId) {
  if (same(stock._id, variantId)) return { target: stock, quantity: stock.unassignedQuantity ?? stock.quantity, field: 'unassignedStyleMeters' };
  const target = stock.variants?.find(row => same(row._id, variantId));
  return target ? { target, quantity: target.quantity, field: 'styleMeters' } : null;
}
export function sfifaTargetSummary(stock, variantId) {
  const entry = sfifaStyleTarget(stock, variantId);
  return entry ? sfifaStyleSummary(entry.target[entry.field], entry.quantity) : null;
}
export async function ensureSfifaStyleBalances(stock, session) {
  const targets = [{ id: stock._id, code: undefined, target: stock, field: 'unassignedStyleMeters', quantity: stock.unassignedQuantity ?? (stock.variants === undefined ? stock.quantity : 0) }, ...(stock.variants || []).map(target => ({ id: target._id, code: target.code, target, field: 'styleMeters', quantity: target.quantity }))];
  const missing = targets.filter(row => row.target[row.field] === undefined);
  if (!missing.length) return stock;
  const read = async (Model, scope) => { let query = Model.find(scope); if (session) query = query.session(session); return query.lean(); };
  const debits = (stock.workerMaterialDebits || []).filter(row => !row.returnedAt);
  const [orders, works] = await Promise.all([
    stock.tailoringOrderIds?.length ? read(TailoringOrder, { idAdmin: stock.idAdmin, _id: { $in: stock.tailoringOrderIds } }) : [],
    debits.length ? read(WorkerWork, { idAdmin: stock.idAdmin, _id: { $in: debits.map(row => row.workId) } }) : [],
  ]);
  const consumption = [];
  for (const order of orders) {
    let rows = order.sfifaStock?.returnedAt ? [] : order.sfifaStock?.rows || [];
    const operation = order.stockOperation;
    if (operation?.trackSfifa) {
      const marker = stock.tailoringStockOperations?.find(row => row.operationId === operation.id);
      rows = marker && !marker.returnedAt ? operation.sfifaRows : operation.beforeSfifaRows;
    }
    for (const row of rows || []) if (same(row.stockId, stock._id)) consumption.push({ variantId: row.variantId, style: row.meterType, meters: row.meters });
  }
  for (const debit of debits) {
    const work = works.find(row => same(row._id, debit.workId));
    const operation = work?.materialOperations?.find(row => `${work._id}:${row.requestId}` === debit.operationId);
    for (const row of operation?.rows || []) if (same(row.sfifaId, stock._id)) consumption.push({ variantId: row.variantId, style: row.sfifaStyle, meters: row.sfifaMeters });
  }
  for (const row of missing) {
    const totals = emptySfifaStyles();
    for (const receipt of stock.receipts || []) if ((receipt.code ?? null) === (row.code ?? null)) for (const key of SFIFA_METER_TYPES) totals[key] += units(receipt.styleMeters?.[key]);
    for (const entry of consumption) if (same(entry.variantId, row.id) && SFIFA_METER_TYPES.includes(entry.style)) totals[entry.style] -= units(entry.meters);
    row.target[row.field] = normalizeSfifaStyles(Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / 1000])), row.quantity);
  }
  return stock;
}
// Quantity and its color-type balance are saved together in the same stock write.
export function changeSfifaTypeBalance(stock, variantId, delta, style, errorCode = 'insufficientSfifaStock') {
  const entry = sfifaStyleTarget(stock, variantId);
  if (!entry) throw Object.assign(new Error('sfifaStockUnavailable'), { status: 409 });
  const values = { ...emptySfifaStyles(), ...(entry.target[entry.field]?.toObject ? entry.target[entry.field].toObject() : entry.target[entry.field]) };
  if (style && SFIFA_METER_TYPES.includes(style)) {
    const remaining = units(values[style]) + delta;
    if (remaining < 0) throw Object.assign(new Error(errorCode), { status: 409 });
    values[style] = remaining / 1000;
  }
  entry.target[entry.field] = normalizeSfifaStyles(values, (units(entry.quantity) + delta) / 1000);
}
