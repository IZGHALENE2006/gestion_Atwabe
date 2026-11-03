import { tailoringMoneyCents } from "./tailoring.js";
import { workQuantityUnits, workerWageCents } from "./workerWork.js";

export const WORKER_PAYROLL_TIMEZONE = "Europe/Paris";
export const workerPayrollMonthValid = value => typeof value === "string" && /^(?:19|[2-9]\d)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
export function workerPayrollDay(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: WORKER_PAYROLL_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const workerPayrollMonth = value => workerPayrollDay(value)?.slice(0, 7) || null;

export function workerCompletionEarning(work, quantity, date = new Date()) {
  if (work.unitWage === undefined) return {};
  const scale = work.category === "sfifa" ? 1000 : 1;
  const after = (workQuantityUnits(work.completedQuantity, work.category) + workQuantityUnits(quantity, work.category)) / scale;
  const beforeCents = workerWageCents(work.unitWage, work.completedQuantity, work.category), afterCents = workerWageCents(work.unitWage, after, work.category);
  if (beforeCents === null || afterCents === null) throw new Error("invalidWage");
  return { earningAmount: (afterCents - beforeCents) / 100, earningMonth: workerPayrollMonth(date) };
}

export function validateWorkerPayment(input, today = workerPayrollDay()) {
  const fields = {};
  if (!["settlement", "advance"].includes(input?.type)) fields.type = "invalidType";
  const cents = tailoringMoneyCents(input?.amount);
  if (cents === null || cents <= 0) fields.amount = "invalidAmount";
  if (!workerPayrollMonthValid(input?.month)) fields.month = "invalidMonth";
  const paidOn = input?.paidOn;
  const date = typeof paidOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? new Date(`${paidOn}T12:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== paidOn || paidOn > today || paidOn < "1900-01-01") fields.paidOn = "invalidDate";
  const note = typeof input?.note === "string" ? input.note.trim() : "";
  if ((input?.note !== undefined && typeof input.note !== "string") || note.length > 300 || [...note].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fields.note = "invalidNote";
  if (Object.keys(fields).length) throw Object.assign(new Error("invalidPayment"), { fields });
  return { amount: cents / 100, month: input.month, paidOn, note, type: input.type };
}

export function buildWorkerPayroll(works, payments) {
  const entries = [];
  for (const work of works) {
    for (const event of work.completions || []) {
      const known = event.earningAmount !== undefined;
      entries.push({ id: `${work._id}:${event.requestId}`, kind: known ? "earning" : "unpriced", workId: String(work._id), category: work.category, workType: work.workType || "shop", productName: work.productName, ...(work.sfifa ? { sfifa: work.sfifa } : {}), barcode: (work.tailoring || work.archivedTailoring)?.barcode || "", quantity: event.quantity, unitWage: work.unitWage, amount: known ? event.earningAmount : null, month: event.earningMonth || workerPayrollMonth(event.date), date: event.date, deletedWork: Boolean(work.deletedAt) });
    }
  }
  for (const payment of payments) entries.push({ id: String(payment._id), kind: "payment", paymentType: payment.type, amount: payment.amount, month: payment.month, paidOn: payment.paidOn, date: payment.createdAt, note: payment.note || "", createdByName: payment.createdByName || "" });
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.month)) groups.set(entry.month, { month: entry.month, earnedCents: 0, paidCents: 0, unpriced: 0 });
    const row = groups.get(entry.month);
    if (entry.kind === "unpriced") row.unpriced++;
    else row[entry.kind === "earning" ? "earnedCents" : "paidCents"] += tailoringMoneyCents(entry.amount);
  }
  const months = [...groups.values()].map(row => {
    if (!Number.isSafeInteger(row.earnedCents) || !Number.isSafeInteger(row.paidCents)) throw new Error("payrollOverflow");
    return { month: row.month, earned: row.earnedCents / 100, paid: row.paidCents / 100, balance: (row.earnedCents - row.paidCents) / 100, due: Math.max(0, row.earnedCents - row.paidCents) / 100, advance: Math.max(0, row.paidCents - row.earnedCents) / 100, unpriced: row.unpriced };
  }).sort((a, b) => b.month.localeCompare(a.month));
  return { entries: entries.sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id)), months, totals: workerPayrollTotals(months) };
}
export function workerPayrollTotals(months) {
  return Object.fromEntries(["earned", "paid", "balance", "due", "advance", "unpriced"].map(key => {
    const value = months.reduce((sum, row) => sum + Math.round((row[key] || 0) * (key === "unpriced" ? 1 : 100)), 0);
    if (!Number.isSafeInteger(value)) throw new Error("payrollOverflow");
    return [key, value / (key === "unpriced" ? 1 : 100)];
  }));
}
