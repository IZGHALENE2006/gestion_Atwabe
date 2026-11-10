import { filterTailoringOrders, TAILORING_GARMENT_TYPES, tailoringGarmentType, tailoringMoneyCents, tailoringOrderItems, validTailoringDate } from "./tailoring.js";
import { tailoringOrderBarcode } from "./tailoringBarcode.js";

export const TAILORING_PROFIT_PERIODS = ["day", "month", "year", "all"];

// Persist these amounts in the same write as delivery. Payments do not affect profit.
export function createTailoringDeliveryFinancials(order) {
  const revenue = tailoringMoneyCents(order.totalPrice ?? 0), expense = tailoringMoneyCents(order.expenseAmount);
  return { revenueAmount: revenue === null ? null : revenue / 100, expenseAmount: expense === null ? null : expense / 100, garmentCount: tailoringOrderItems(order).length };
}
export function tailoringDeliveryAmounts(order) {
  if (!order?.deliveredAt || !Number.isFinite(new Date(order.deliveredAt).getTime())) return null;
  const snapshot = order.deliveryFinancials || createTailoringDeliveryFinancials(order);
  const revenue = tailoringMoneyCents(snapshot.revenueAmount), expense = tailoringMoneyCents(snapshot.expenseAmount);
  return { revenueAmount: revenue === null ? null : revenue / 100, expenseAmount: expense === null ? null : expense / 100, profitAmount: revenue === null || expense === null ? null : (revenue - expense) / 100, garmentCount: snapshot.garmentCount, legacy: !order.deliveryFinancials };
}
export function tailoringProfitEntries(orders, garmentType, { includeCancelled = false } = {}) {
  return orders.filter(order => !order.stockOperation).filter(order => garmentType === "all" ? TAILORING_GARMENT_TYPES.includes(tailoringGarmentType(order)) : tailoringGarmentType(order) === garmentType).flatMap(order => {
    const amounts = tailoringDeliveryAmounts(order);
    return amounts && (!order.cancelledAt || includeCancelled) ? [{ order, orderId: String(order._id), clientName: order.clientName, phone: order.phone, barcode: tailoringOrderBarcode(order), deliveredAt: order.deliveredAt, ...(order.cancelledAt ? { cancelledAt: order.cancelledAt, cancelledBy: order.cancelledBy } : {}), ...amounts }] : [];
  }).sort((a, b) => new Date(b.cancelledAt || b.deliveredAt) - new Date(a.cancelledAt || a.deliveredAt) || b.orderId.localeCompare(a.orderId));
}
const amountFromCents = value => value > BigInt(Number.MAX_SAFE_INTEGER) || value < -BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value) / 100;
export function summarizeTailoringProfits(entries) {
  // Cancelled rows remain available in history, but never contribute to totals.
  entries = entries.filter(entry => !entry.cancelledAt && !entry.order?.cancelledAt);
  let revenue = 0n, expense = 0n, profit = 0n, unknownCount = 0, garmentCount = 0;
  for (const entry of entries) {
    const earned = tailoringMoneyCents(entry.revenueAmount), spent = tailoringMoneyCents(entry.expenseAmount);
    if (earned !== null) revenue += BigInt(earned);
    if (spent !== null) expense += BigInt(spent);
    if (earned === null || spent === null) unknownCount += 1;
    else profit += BigInt(earned) - BigInt(spent);
    garmentCount += entry.garmentCount;
  }
  const allUnknown = entries.length > 0 && unknownCount === entries.length;
  return { revenueAmount: amountFromCents(revenue), expenseAmount: allUnknown ? null : amountFromCents(expense), profitAmount: allUnknown ? null : amountFromCents(profit), orderCount: entries.length, garmentCount, unknownCount };
}
// The browser's local calendar is also used when displaying the delivery date.
export function tailoringProfitPeriodKey(value = new Date(), period = "day", timeZone) {
  if (value === null || value === "") return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(timeZone ? { timeZone } : {}) }).formatToParts(date).map(part => [part.type, part.value]));
  return period === "year" ? parts.year : period === "month" ? parts.year + "-" + parts.month : parts.year + "-" + parts.month + "-" + parts.day;
}
export function filterTailoringProfits(entries, { mode = "day", period, search = "", timeZone } = {}) {
  if (!TAILORING_PROFIT_PERIODS.includes(mode)) return [];
  if (mode !== "all" && !(mode === "day" ? validTailoringDate(period) : mode === "month" ? /^\d{4}-\d{2}$/.test(period || "") && validTailoringDate(period + "-01") : /^\d{4}$/.test(period || "") && Number(period) >= 1900)) return [];
  const ids = new Set(filterTailoringOrders(entries.map(entry => entry.order), search).map(order => String(order._id)));
  return entries.filter(entry => ids.has(entry.orderId) && (mode === "all" || tailoringProfitPeriodKey(entry.cancelledAt || entry.deliveredAt, mode, timeZone) === period));
}
export function groupTailoringProfits(entries, mode, timeZone) {
  const unit = mode === "year" ? "month" : mode === "all" ? "year" : "day", groups = new Map();
  for (const entry of entries) {
    const key = tailoringProfitPeriodKey(entry.cancelledAt || entry.deliveredAt, unit, timeZone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, rows]) => ({ key, unit, ...summarizeTailoringProfits(rows) }));
}
