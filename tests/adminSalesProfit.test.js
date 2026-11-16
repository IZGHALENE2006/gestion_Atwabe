import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import Employee from '../BackEnd/models/EmployeModele.js';
import Admin from '../BackEnd/models/AdminModel.js';
import Payroll from '../BackEnd/models/EmployeePayroll.js';
import { employeeSaleShares, buildAdminSalesProfit, summarizeAdminSalesProfit } from '../shared/adminSalesProfit.js';
import { buildEmployeePayroll, payrollMonth, payrollDay } from '../shared/employeePayroll.js';
import { employeePayrollFixture, owner, otherOwner, employeeId } from './helpers/employeePayrollFixture.js';
import { memoryQuery, matches } from './helpers/modelMemory.js';

process.env.JWT_SECRET = 'isolated-admin-sales-profit';
const { default: app } = await import('../BackEnd/app.js');

const sale = (profit, month = '2026-11', patch = {}) => ({ _id: randomUUID().replaceAll('-', '').slice(0, 24), name: 'منتج', profite: profit, price: 50, quantite: 1, saleAmount: 50, DateVante: month + '-05T12:00:00Z', ...patch });
const sharePlan = month => ({ type: 'profitShare', monthlyAmount: 0, effectiveMonth: month });
const fixedPlan = month => ({ type: 'monthly', monthlyAmount: 3000, effectiveMonth: month });
const sumCents = rows => rows.reduce((sum, value) => sum + Math.round(value * 100), 0);

test('each employee share equals monthly payroll, including losses and once-only rounding', () => {
  const sales = [sale(600), sale(300, '2026-11', { saleType: 'credit' }), sale(-150), sale(0.01), sale(0.01), sale(3, '2026-10')];
  const plans = [sharePlan('2026-10')], shares = employeeSaleShares(plans, sales, '2026-11');
  assert.equal(sumCents(shares.slice(0, 5)), 25001); assert.equal(shares[2], 0); assert.equal(shares[5], 1);
  const payroll = buildEmployeePayroll(plans, sales, [], '2026-11');
  assert.equal(sumCents(shares), Math.round(payroll.totals.earned * 100));
  assert.deepEqual(employeeSaleShares([sharePlan('2026-11')], [sale(0.01), sale(0.01), sale(0.01)], '2026-11'), [0.01, 0, 0]);
});

test('compensation changes, pre-agreement sales, loss months and fixed salaries do not invent commissions', () => {
  const plans = [fixedPlan('2026-01'), sharePlan('2026-02'), fixedPlan('2026-03')];
  const sales = [sale(900, '2025-12'), sale(900, '2026-01'), sale(900, '2026-02'), sale(900, '2026-03'), sale(900, '2026-04')];
  assert.deepEqual(employeeSaleShares(plans, sales, '2026-03'), [0, 0, 300, 0, 0]);
  assert.deepEqual(employeeSaleShares([sharePlan('2026-01')], [sale(-10, '2026-01'), sale(5, '2026-01')], '2026-01'), [0, 0]);
});

test('filtered sales retain their allocated shares and the complete month reconciles to the employee ledger', () => {
  const report = buildAdminSalesProfit({ name: 'المدير', ventes: [sale(40)] }, [
    { _id: 'share', name: 'بالثلث', compensation: sharePlan('2026-11'), ventes: [sale(600, '2026-11', { name: 'قطعة أ' }), sale(300, '2026-11', { name: 'قطعة ب' })] },
    { _id: 'fixed', name: 'شهري', compensation: fixedPlan('2026-11'), ventes: [sale(100)] },
  ], [], '2026-11');
  assert.deepEqual(summarizeAdminSalesProfit(report.sales), { employeeShares: 300, ownerProfit: 740 });
  assert.deepEqual(summarizeAdminSalesProfit(report.sales.filter(row => row.name === 'قطعة أ')), { employeeShares: 200, ownerProfit: 400 });
  assert.deepEqual(summarizeAdminSalesProfit(report.sales.filter(row => row.empId === 'admin')), { employeeShares: 0, ownerProfit: 40 });
  assert.deepEqual(summarizeAdminSalesProfit([]), { employeeShares: 0, ownerProfit: 0 });
});

test('saved payroll plans override current employee configuration, including an explicitly empty account', () => {
  const employee = { _id: 'worker', name: 'موظف', compensation: fixedPlan('2026-01'), ventes: [sale(300, '2026-01'), sale(600, '2026-02')] };
  const accounts = [{ employeeId: employee._id, plans: [sharePlan('2026-01'), fixedPlan('2026-02')], payments: [{ amount: 99 }] }];
  const report = buildAdminSalesProfit({}, [employee], accounts, '2026-02'); assert.deepEqual(report.sales.map(row => row.employeeShareAmount), [100, 0]);
  employee.compensation = sharePlan('2026-01'); accounts[0].plans = [];
  assert.ok(buildAdminSalesProfit({}, [employee], accounts, '2026-02').sales.every(row => row.employeeShareAmount === 0));
});

test('unknown profits make the affected monthly commission and filtered net profit unavailable', () => {
  const report = buildAdminSalesProfit({}, [{ _id: 'worker', compensation: sharePlan('2026-11'), ventes: [sale(300), sale(undefined)] }], [], '2026-11');
  assert.deepEqual(report.sales.map(row => row.employeeShareAmount), [null, null]);
  assert.deepEqual(summarizeAdminSalesProfit(report.sales.slice(0, 1)), { employeeShares: null, ownerProfit: null });
});

let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
async function request(path = '/Employe/profit-summary', actor = { id: owner, role: 'admin' }, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
function fixture(t) {
  const f = employeePayrollFixture(t);
  for (const Model of [Employee, Payroll]) t.mock.method(Model, 'find', scope => memoryQuery(() => f.rows(Model).filter(row => matches(row, scope)).map(row => row.toObject())));
  return f;
}

test('admin report is owner-scoped, includes inactive employees and never creates payroll accounts or exposes private fields', async t => {
  const f = fixture(t), month = payrollMonth();
  f.employee.compensation = sharePlan(month); f.employee.ventes.push(sale(900, month));
  f.foreign.compensation = sharePlan(month); f.foreign.ventes.push(sale(9000, month));
  f.seed(Employee, { idAdmin: owner, name: 'موظف سابق', isActive: false, compensation: sharePlan(month), ventes: [sale(300, month)] });
  f.rows(Admin)[0].ventes.push(sale(40, month));
  const result = await request(); assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.data.sales.length, 3); assert.equal(result.data.employees.length, 2);
  assert.deepEqual(summarizeAdminSalesProfit(result.data.sales), { employeeShares: 400, ownerProfit: 840 });
  assert.equal(f.rows(Payroll).length, 0); assert.doesNotMatch(JSON.stringify(result.data), /password|email|cin|phone|monthlyAmount|payments|createdBy/);
  assert.equal((await request()).status, 200); assert.equal(f.rows(Payroll).length, 0);
});

test('the report uses agreement history and earned shares regardless of salary payments', async t => {
  const f = fixture(t), month = payrollMonth(); f.employee.compensation = fixedPlan(month); f.employee.ventes.push(sale(900, month, { saleType: 'credit' }));
  const ledger = f.seed(Payroll, { idAdmin: owner, employeeId, plans: [{ ...sharePlan(month), createdAt: new Date() }] });
  const before = await request(); assert.equal(before.status, 200); assert.deepEqual(summarizeAdminSalesProfit(before.data.sales), { employeeShares: 300, ownerProfit: 600 });
  const paid = await request('/Employe/' + employeeId + '/payments', { id: owner, role: 'admin' }, { amount: 100, month, paidOn: payrollDay(), note: '', requestId: randomUUID() });
  assert.equal(paid.status, 201, JSON.stringify(paid)); assert.equal(f.rows(Payroll).find(row => String(row._id) === String(ledger._id)).payments.length, 1);
  const after = await request(); assert.deepEqual(after.data.sales, before.data.sales);
});

test('employees cannot request the admin profit report and another shop cannot see its data', async t => {
  const f = fixture(t); f.employee.compensation = sharePlan(payrollMonth()); f.employee.ventes.push(sale(300, payrollMonth()));
  assert.equal((await request('/Employe/profit-summary', null)).status, 401);
  assert.equal((await request('/Employe/profit-summary', { id: employeeId, role: 'Employe' })).status, 403);
  f.seed(Admin, { _id: otherOwner, name: 'المدير الآخر' });
  const other = await request('/Employe/profit-summary', { id: otherOwner, role: 'admin' }); assert.equal(other.status, 200); assert.ok(other.data.sales.every(row => row.empId !== employeeId));
});

test('report failures return a safe error instead of a gross-profit fallback', async t => {
  fixture(t); t.mock.method(Payroll, 'find', () => { throw new Error('private payroll storage'); });
  const result = await request(); assert.equal(result.status, 500); assert.equal(result.data.message, 'employeePayrollFailed'); assert.doesNotMatch(JSON.stringify(result.data), /private/);
});
