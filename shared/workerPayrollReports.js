import { validTailoringDate } from "./tailoring.js";
import { workerPayrollDay, workerPayrollMonthValid, workerPayrollSummary } from "./workerPayroll.js";

export function workerPayrollWeek(day) {
  if (!validTailoringDate(day)) throw new Error("invalidPayrollPeriod");
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  if (date.getUTCFullYear() > 9999) throw new Error("invalidPayrollPeriod");
  return { start, end: date.toISOString().slice(0, 10) };
}

export function workerPayrollPeriod(filter) {
  const mode = filter?.mode;
  if (mode === "all") return { mode };
  if (mode === "week") return { mode, ...workerPayrollWeek(filter.week) };
  if (mode === "month" && workerPayrollMonthValid(filter.month)) return { mode, month: filter.month };
  if (mode === "year" && typeof filter.year === "string" && /^(?:19|[2-9]\d)\d{2}$/.test(filter.year)) return { mode, year: filter.year };
  throw new Error("invalidPayrollPeriod");
}

export function buildWorkerPayrollReport(account, filter) {
  const period = workerPayrollPeriod(filter);
  const selectedEntries = (account.entries || []).filter(entry => {
    if (period.mode === "all") return true;
    if (period.mode === "month") return entry.month === period.month;
    if (period.mode === "year") return entry.month?.startsWith(period.year + "-");
    // A weekly cash movement uses the actual payment day, even for an old entitlement month.
    const day = entry.kind === "payment" ? entry.paidOn : workerPayrollDay(entry.date);
    return day >= period.start && day <= period.end;
  });
  const kind = ["earning", "payment"].includes(filter.kind) ? filter.kind : "all";
  const entries = selectedEntries.filter(entry => kind === "all" || (kind === "payment" ? entry.kind === "payment" : entry.kind !== "payment"));
  return { period, kind, entries, ...workerPayrollSummary(selectedEntries), accountTotals: account.totals };
}
