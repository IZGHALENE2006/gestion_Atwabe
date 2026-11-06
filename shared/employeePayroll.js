// Monthly employee compensation uses saved sale profits, never current product prices.
export const EMPLOYEE_PAYROLL_TIMEZONE = 'Europe/Paris';
export const validPayrollMonth = value => typeof value === 'string' && /^(?:19|[2-9]\d)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
export function payrollDay(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: EMPLOYEE_PAYROLL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const payrollMonth = value => payrollDay(value)?.slice(0, 7) || null;
export function nextPayrollMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
}
const fail = (message, fields) => Object.assign(new Error(message), { status: 400, ...(fields ? { fields } : {}) });
export function payrollCents(value, signed = false) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) return null;
  const amount = Number(value), cents = Math.round(amount * 100);
  return (!signed && amount < 0) || Math.abs(amount) > 1e9 || !Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.0001 ? null : cents;
}
function safe(value) {
  if (!Number.isSafeInteger(value)) throw fail('employeePayrollOverflow');
  return value;
}
export function validateCompensation(input, current = payrollMonth()) {
  const fields = {};
  if (!['monthly', 'profitShare'].includes(input?.type)) fields.type = 'type';
  if (!validPayrollMonth(input?.effectiveMonth) || input.effectiveMonth > nextPayrollMonth(current)) fields.effectiveMonth = 'month';
  const cents = payrollCents(input?.monthlyAmount);
  if (input?.type === 'monthly' && (cents === null || cents <= 0)) fields.monthlyAmount = 'amount';
  if (Object.keys(fields).length) throw fail('employeeCompensationInvalid', fields);
  return { type: input.type, effectiveMonth: input.effectiveMonth, monthlyAmount: input.type === 'monthly' ? cents / 100 : 0 };
}
export function validateEmployeePayment(input, today = payrollDay()) {
  const fields = {}, cents = payrollCents(input?.amount);
  if (cents === null || cents <= 0) fields.amount = 'amount';
  if (!validPayrollMonth(input?.month) || input.month > today.slice(0, 7)) fields.month = 'month';
  const day = input?.paidOn, date = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || day > today || day < '1900-01-01') fields.paidOn = 'date';
  const note = typeof input?.note === 'string' ? input.note.trim() : '';
  if ((input?.note !== undefined && typeof input.note !== 'string') || note.length > 300 || [...note].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fields.note = 'note';
  if (Object.keys(fields).length) throw fail('employeePaymentInvalid', fields);
  return { month: input.month, amount: cents / 100, paidOn: day, note };
}
export function buildEmployeePayroll(plans = [], sales = [], payments = [], current = payrollMonth()) {
  const sorted = [...plans].sort((a, b) => a.effectiveMonth.localeCompare(b.effectiveMonth));
  const salesByMonth = new Map(), paidByMonth = new Map();
  for (const sale of sales) {
    const month = sale.DateVante == null ? null : payrollMonth(sale.DateVante);
    if (!month || month > current) continue;
    if (!salesByMonth.has(month)) salesByMonth.set(month, { profit: 0, count: 0, unpriced: 0 });
    const row = salesByMonth.get(month), cents = payrollCents(sale.profite, true);
    row.count++;
    if (cents === null) row.unpriced++;
    else row.profit = safe(row.profit + cents);
  }
  for (const payment of payments) paidByMonth.set(payment.month, safe((paidByMonth.get(payment.month) || 0) + payrollCents(payment.amount)));
  const months = [];
  for (let month = sorted[0]?.effectiveMonth; month && month <= current; month = nextPayrollMonth(month)) {
    const plan = sorted.findLast(item => item.effectiveMonth <= month);
    const sale = salesByMonth.get(month) || { profit: 0, count: 0, unpriced: 0 };
    const earned = plan.type === 'monthly' ? payrollCents(plan.monthlyAmount) : Math.round(Math.max(0, sale.profit) / 3);
    const paid = paidByMonth.get(month) || 0, remaining = safe(earned - paid);
    months.push({ month, type: plan.type, monthlyAmount: plan.monthlyAmount, profit: sale.profit / 100, salesCount: sale.count, unpriced: sale.unpriced, earned: earned / 100, paid: paid / 100, due: Math.max(0, remaining) / 100, overpaid: Math.max(0, -remaining) / 100, status: earned === 0 ? 'none' : remaining <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid', provisional: month === current && plan.type === 'profitShare' });
  }
  const totals = Object.fromEntries(['earned', 'paid', 'due', 'overpaid'].map(key => [key, safe(months.reduce((sum, row) => sum + Math.round(row[key] * 100), 0)) / 100]));
  return { months: months.reverse(), totals, currentMonth: current };
}
