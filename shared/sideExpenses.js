export const SIDE_EXPENSE_TYPES = ['water', 'electricity', 'internet', 'rent', 'other'];
export const MAX_EXPENSE_CENTS = 99_999_999_999;
export const EXPENSE_REQUEST_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
export const FIXED_EXPENSE_TYPES = ['internet', 'rent'];
export const expenseKind = type => FIXED_EXPENSE_TYPES.includes(type) ? 'fixed' : 'variable';
export const validExpenseMonth = value => typeof value === 'string' && /^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value);

export function currentExpenseMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return parts.find(part => part.type === 'year').value + '-' + parts.find(part => part.type === 'month').value;
}

export function expenseMonth(expense) {
  if (validExpenseMonth(expense.month)) return expense.month;
  if (!expense.createdAt) return null;
  const date = new Date(expense.createdAt);
  return Number.isNaN(date.getTime()) ? null : currentExpenseMonth(date);
}

export function fixedExpenseAmount(items, type, month) {
  if (expenseKind(type) !== 'fixed' || !validExpenseMonth(month)) return null;
  const previous = items.filter(item => item.type === type && expenseMonth(item) && expenseMonth(item) <= month)
    .sort((a, b) => expenseMonth(b).localeCompare(expenseMonth(a)) || new Date(b.createdAt) - new Date(a.createdAt) || String(b._id).localeCompare(String(a._id)))[0];
  return previous?.amountCents ?? null;
}

export function monthlyExpenseTotals(items, month = '') {
  return items.filter(item => !month || expenseMonth(item) === month).reduce((total, item) => {
    total.totalCents += item.amountCents;
    total[expenseKind(item.type) === 'fixed' ? 'fixedCents' : 'variableCents'] += item.amountCents;
    total.count += 1;
    return total;
  }, { totalCents: 0, fixedCents: 0, variableCents: 0, count: 0 });
}

export function expenseAmountCents(value) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const text = String(value).trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[,٫]/g, '.');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_EXPENSE_CENTS ? cents : null;
}

export function validateSideExpense(data) {
  const input = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const fields = {};
  if (!SIDE_EXPENSE_TYPES.includes(input.type)) fields.type = 'typeRequired';
  const otherName = input.type === 'other' && typeof input.otherName === 'string' ? input.otherName.trim() : '';
  const invalidName = [...otherName].some(character => { const code = character.charCodeAt(0); return code < 32 || (code >= 127 && code <= 159); });
  if (input.type === 'other' && (!otherName || otherName.length > 120 || invalidName)) fields.otherName = 'otherNameRequired';
  const amountCents = expenseAmountCents(input.amount);
  if (amountCents === null) fields.amount = 'amountInvalid';
  if (input.month !== undefined && !validExpenseMonth(input.month)) fields.month = 'monthRequired';
  if (Object.keys(fields).length) throw Object.assign(new Error('invalidExpense'), { status: 400, fields });
  return { type: input.type, otherName, amountCents, ...(input.month !== undefined ? { month: input.month } : {}) };
}
