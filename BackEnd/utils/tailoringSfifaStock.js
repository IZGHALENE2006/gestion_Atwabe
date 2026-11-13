import { ensureSfifaStyleBalances, changeSfifaTypeBalance } from './sfifaStyleBalances.js';
import SfifaStock from '../models/SfifaStock.js';
import TailoringOrder from '../models/TailoringOrder.js';
import { SFIFA_STOCK_LIMIT, SFIFA_STOCK_GROUP_LIMIT, sfifaQuantityUnits, sfifaStockStyles } from '../../shared/sfifaStock.js';
import { tailoringSfifaStyle } from '../../shared/tailoringSfifa.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const same = (a, b) => String(a) === String(b);
const plain = value => value.toObject ? value.toObject() : value;
const units = value => Math.round(value * 1000);
export const hasTailoringSfifa = order => Boolean(order.sfifaStock || order.items?.some(item => item.sfifa?.stock));
export const shouldReturnTailoringStock = order => Boolean(order.cancelledAt && !order.deliveredAt);
export function tailoringStockSnapshot(order, beforeRows, rows) {
  return { version: 1, rows: order.cancelledAt ? beforeRows : rows, ...(shouldReturnTailoringStock(order) ? { returnedAt: order.cancelledAt } : {}) };
}
export async function resolveTailoringSfifaRows(order, session) {
  const rows = [], stocks = new Map();
  for (const [index, item] of (order.items || []).entries()) {
    const input = item.sfifa?.stock;
    if (!input) continue;
    const key = String(input.stockId);
    if (!stocks.has(key)) {
      let query = SfifaStock.findOne({ _id: input.stockId, idAdmin: order.idAdmin });
      if (session) query = query.session(session);
      stocks.set(key, await query);
    }
    const stock = stocks.get(key), variant = stock?.variants?.find(row => same(row._id, input.variantId));
    if (!stock || (!variant && !same(stock._id, input.variantId))) throw fail('sfifaStockUnavailable');
    const fields = {}, styles = sfifaStockStyles(stock, variant?.code, { includeExhausted: true });
    if (stock.width !== item.sfifa.width) fields['items.' + index + '.sfifa.width'] = 'sfifaWidthMismatch';
    if (styles.length ? !styles.includes(input.meterType) : input.meterType !== undefined) fields['items.' + index + '.sfifa.stock.meterType'] = 'chooseSfifaMeterType';
    if (input.meterType && tailoringSfifaStyle(input.meterType) !== item.sfifa.style) fields['items.' + index + '.sfifa.stock.meterType'] = 'chooseSfifaMeterType';
    if (sfifaQuantityUnits(input.meters) === null || input.meters <= 0) fields['items.' + index + '.sfifa.stock.meters'] = 'invalidSfifaMeters';
    if (Object.keys(fields).length) throw Object.assign(fail('invalidOrder', 400), { fields });
    input.family = stock.family; input.code = variant?.code;
    rows.push({ lineId: item.lineId, stockId: stock._id, variantId: variant?._id || stock._id, meters: input.meters, width: stock.width, family: stock.family, ...(variant ? { code: variant.code } : {}), ...(input.meterType ? { meterType: input.meterType } : {}) });
  }
  return { rows, stocks };
}
export function tailoringSfifaGroups(before, after) {
  const groups = new Map();
  for (const [rows, sign] of [[before || [], 1], [after || [], -1]]) for (const row of rows) {
    const id = String(row.stockId);
    if (!groups.has(id)) groups.set(id, new Map());
    const key = String(row.variantId) + ":" + (row.meterType || "unclassified"), entry = groups.get(id).get(key) || { ...plain(row), delta: 0 };
    entry.delta += sign * units(row.meters); groups.get(id).set(key, entry);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, entries]) => ({ kind: 'sfifa', id, rows: [...entries.values()].filter(row => row.delta) })).filter(group => group.rows.length);
}
export function changeTailoringSfifa(stock, group, reverse = false) {
  let delta = 0;
  for (const row of group.rows) {
    const unassigned = same(row.variantId, stock._id), target = unassigned ? stock : stock.variants?.find(entry => same(entry._id, row.variantId));
    if (!target || row.width !== stock.width || row.family !== stock.family || !unassigned && target.code !== row.code) throw fail('sfifaStockUnavailable');
    const key = unassigned ? 'unassignedQuantity' : 'quantity', amount = row.delta * (reverse ? -1 : 1);
    const after = units(target[key] ?? (unassigned ? stock.quantity : 0)) + amount;
    if (after < 0) throw fail('insufficientSfifaStock');
    if (after > units(SFIFA_STOCK_LIMIT)) throw fail('sfifaStockReturnLimit');
    changeSfifaTypeBalance(stock, row.variantId, amount, row.meterType);
    target[key] = after / 1000; delta += amount;
  }
  const after = units(stock.quantity) + delta;
  if (after < 0 || after > units(SFIFA_STOCK_GROUP_LIMIT)) throw fail('sfifaStockReturnLimit');
  stock.quantity = after / 1000;
}
export async function applyStandaloneSfifaGroup(order, operation, group, reverse) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const stock = await SfifaStock.findOne({ _id: group.id, idAdmin: order.idAdmin });
      if (!stock) { if (reverse) return; throw fail('sfifaStockUnavailable'); }
      const marker = stock.tailoringStockOperations?.find(row => row.operationId === operation.id);
      if (reverse && (!marker || marker.returnedAt)) return;
      if (!reverse && marker) { if (marker.returnedAt) throw fail('conflict'); return; }
      await ensureSfifaStyleBalances(stock);
      changeTailoringSfifa(stock, group, reverse);
      if (reverse) marker.returnedAt = new Date();
      else { stock.tailoringStockOperations ||= []; stock.tailoringStockOperations.push({ operationId: operation.id, orderId: order._id, date: new Date() }); }
      if (!(stock.tailoringOrderIds || []).some(id => same(id, order._id))) { stock.tailoringOrderIds ||= []; stock.tailoringOrderIds.push(order._id); }
      await stock.save(); return;
    } catch (error) { if (error.name !== 'VersionError') throw error; }
  }
  throw fail('sfifaStockUnavailable', 503);
}
export async function protectTailoringSfifaDeletion(stock, removedIds) {
  if (!stock.tailoringOrderIds?.length) return;
  const orders = await TailoringOrder.find({ idAdmin: stock.idAdmin, _id: { $in: stock.tailoringOrderIds } }).lean();
  if (orders.some(order => !order.cancelledAt && [...(order.sfifaStock?.returnedAt ? [] : order.sfifaStock?.rows || []), ...(order.stockOperation?.sfifaRows || []), ...(order.stockOperation?.beforeSfifaRows || [])].some(row => same(row.stockId, stock._id) && (!removedIds || removedIds.has(String(row.variantId)))))) throw fail('tailoringSfifaInUse');
}
