import { buildEmployeePayroll, payrollCents, payrollMonth } from './employeePayroll.js';
import { salesWithRevenue, summarizeSales } from './salesRevenue.js';

// Match payroll exactly: one third of each employee's monthly net profit,
// rounded once, under the agreement effective for that month. Payments do not
// change the expense. Allocate that expense over positive-profit sales so any
// report subset (day, year, seller or search) retains its share of the same total.
export function employeeSaleShares(plans, sales, current = payrollMonth()) {
  const result = sales.map(() => 0), groups = new Map();
  sales.forEach((sale, index) => {
    const month = sale.DateVante == null ? null : payrollMonth(sale.DateVante);
    if (!month) return;
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push({ index, profit: payrollCents(sale.profite, true) });
  });
  for (const row of buildEmployeePayroll(plans, sales, [], current).months) {
    if (row.type !== 'profitShare') continue;
    const group = groups.get(row.month) || [];
    if (row.unpriced) { for (const sale of group) result[sale.index] = null; continue; }
    const earned = Math.round(row.earned * 100), positive = group.filter(sale => sale.profit > 0);
    const weights = positive.reduce((sum, sale) => sum + BigInt(sale.profit), 0n);
    if (!earned || !weights) continue;
    const shares = positive.map(sale => {
      const amount = BigInt(sale.profit) * BigInt(earned);
      return { index: sale.index, cents: Number(amount / weights), remainder: amount % weights };
    });
    let remaining = earned - shares.reduce((sum, sale) => sum + sale.cents, 0);
    const sorted = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    for (const sale of sorted) { if (!remaining) break; sale.cents++; remaining--; }
    for (const sale of shares) result[sale.index] = sale.cents / 100;
  }
  return result;
}

const saleFields = ['_id', 'idProduct', 'name', 'price', 'priceType', 'quantite', 'DateVante', 'profite', 'saleAmount', 'saleAmountSource', 'invoiceId', 'saleType', 'batchId', 'batchNumber'];
const publicSale = sale => Object.fromEntries(saleFields.filter(key => sale[key] !== undefined).map(key => [key, sale[key]]));
export function buildAdminSalesProfit(admin, employees, accounts, current = payrollMonth()) {
  const byEmployee = new Map(accounts.map(account => [String(account.employeeId), account]));
  const sales = salesWithRevenue(admin).map(sale => ({ ...publicSale(sale), empId: 'admin', nameEmp: admin.name, employeeShareAmount: 0 }));
  for (const employee of employees) {
    const account = byEmployee.get(String(employee._id));
    // An existing empty ledger is authoritative. Reading the report never
    // creates a payroll account or overwrites its agreement history.
    const plans = account ? account.plans : employee.compensation ? [employee.compensation] : [];
    const shares = employeeSaleShares(plans, employee.ventes || [], current);
    sales.push(...salesWithRevenue(employee).map((sale, index) => ({ ...publicSale(sale), empId: String(employee._id), nameEmp: employee.name, employeeShareAmount: shares[index] })));
  }
  return { sales, employees: employees.map(employee => ({ _id: String(employee._id), name: employee.name, isActive: employee.isActive })) };
}

export function summarizeAdminSalesProfit(sales) {
  const complete = sales.every(sale => payrollCents(sale.profite, true) !== null && payrollCents(sale.employeeShareAmount) !== null);
  if (!complete) return { employeeShares: null, ownerProfit: null };
  const cents = sales.reduce((sum, sale) => sum + Math.round(sale.employeeShareAmount * 100), 0);
  if (!Number.isSafeInteger(cents)) throw new Error('employeePayrollOverflow');
  return { employeeShares: cents / 100, ownerProfit: (Math.round(summarizeSales(sales).profit * 100) - cents) / 100 };
}
