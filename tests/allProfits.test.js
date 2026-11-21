import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import { buildAllProfits, validateAllProfitQuery } from '../shared/allProfits.js';
import { buildAdminSalesProfit, summarizeAdminSalesProfit } from '../shared/adminSalesProfit.js';
import { canOpenEmployeePage } from '../shared/employeePermissions.js';
import Payroll from '../BackEnd/models/EmployeePayroll.js';
import FabricMovement from '../BackEnd/models/FabricMovement.js';
import Admin from '../BackEnd/models/AdminModel.js';
import { allProfitsFixture, profitSale, profitOrder, profitMovement, owner, foreignOwner, employeeId } from './helpers/allProfitsFixture.js';

const filters = validateAllProfitQuery({ timeZone: 'Europe/Paris' });
const report = data => buildAllProfits(data, filters);
test('sums all five tailoring sections, all fabric sellers, and only the owner share of product sales', t => {
  const f = allProfitsFixture(t), { sales } = buildAdminSalesProfit(f.admin, f.employees.filter(row => row.idAdmin === owner), []);
  const result = report({ sales, orders: f.orders, fabricMovements: f.movements });
  assert.deepEqual(result.summary, { totalProfit: 1310, tailoringProfit: 500, fabricProfit: 70, salesProfit: 740, salesGrossProfit: 1040, employeeShares: 300, tailoringOrderCount: 5, fabricSaleCount: 2, productSaleCount: 3, unknownCount: 0 });
  assert.deepEqual(result.sections.map(row => [row.profitAmount, row.orderCount]), Array(5).fill([100, 1]));
  assert.equal(result.summary.salesProfit, summarizeAdminSalesProfit(sales).ownerProfit);
});
test('pending and archived copies of a fabric sale count once, including credit invoices', () => {
  const sale = profitMovement(); sale.sale.invoiceId = owner; sale.sale.saleType = 'credit';
  const result = report({ fabricMovements: [structuredClone(sale), sale] });
  assert.equal(result.summary.fabricProfit, 50); assert.equal(result.summary.fabricSaleCount, 1);
});
test('the fabric margin of a delivered order is added once alongside its separate tailoring margin', () => {
  const order = profitOrder({ items: [{ lineId: 'cloth', fabricSource: 'shop', fabricMeters: 2, costs: { fabricAmount: 60, fabricUnitPrice: 30 }, fabricSale: { occurredAt: '2026-11-03T12:00:00Z', createdBy: owner, purchaseUnitPrice: 20, costAmount: 40 } }] });
  assert.equal(report({ orders: [order] }).summary.totalProfit, 120);
  order.deliveryFabricItems = order.items; order.items = [];
  assert.equal(report({ orders: [order] }).summary.totalProfit, 120);
});
test('unsubmitted stock operations, undelivered orders and cancelled orders do not add tailoring profit', () => {
  const orders = [profitOrder({ stockOperation: { state: 'pending' } }), profitOrder({ deliveredAt: null }), profitOrder({ cancelledAt: '2026-11-06T12:00:00Z' })];
  assert.equal(report({ orders }).summary.totalProfit, 0);
});
test('cancelled cloth sales are removed while cloth from active undelivered orders remains recognized', t => {
  const f = allProfitsFixture(t), order = f.orders[0]; order.deliveredAt = null;
  assert.equal(report({ orders: [order] }).summary.totalProfit, 20);
  order.cancelledAt = '2026-11-06T12:00:00Z';
  assert.equal(report({ orders: [order], fabricMovements: [profitMovement({ cancelledAt: order.cancelledAt })] }).summary.totalProfit, 0);
});
test('saved delivery amounts, discount totals and purchase costs are used regardless of later prices or payments', () => {
  const order = profitOrder({ totalPrice: 999, expenseAmount: 1, paidAmount: 0, creditDelivery: { state: 'complete' } });
  const sale = profitMovement(); sale.sale.total = 25; sale.sale.discountAmount = 55;
  assert.equal(report({ orders: [order], fabricMovements: [sale] }).summary.totalProfit, 95);
  order.paidAmount = 200;
  assert.equal(report({ orders: [order], fabricMovements: [sale] }).summary.totalProfit, 95);
});
test('unknown amounts never silently become zero or present a partial sum as a complete total', () => {
  const unknown = profitMovement(); delete unknown.sale.purchaseUnitPrice;
  const result = report({ orders: [profitOrder()], fabricMovements: [unknown] });
  assert.equal(result.summary.tailoringProfit, 100); assert.equal(result.summary.fabricProfit, null); assert.equal(result.summary.totalProfit, null); assert.equal(result.summary.unknownCount, 1);
  assert.equal(result.groups[0].totalProfit, null);
  assert.equal(report({ sales: [profitSale(20, { employeeShareAmount: null })] }).summary.totalProfit, null);
  assert.equal(report({ orders: [profitOrder({ deliveryFinancials: { revenueAmount: 200, expenseAmount: null, garmentCount: 1 } })] }).summary.totalProfit, null);
});
test('empty reports return zero, losses remain negative and money adds in integer centimes', () => {
  assert.equal(report({}).summary.totalProfit, 0);
  const sales = [profitSale(-10, { employeeShareAmount: 0 }), profitSale(0.1, { employeeShareAmount: 0 }), profitSale(0.2, { employeeShareAmount: 0 })];
  assert.equal(report({ sales }).summary.totalProfit, -9.7);
});
test('monthly commissions are allocated before filtering individual days', () => {
  const { sales } = buildAdminSalesProfit({}, [{ _id: employeeId, compensation: { type: 'profitShare', effectiveMonth: '2026-01' }, ventes: [profitSale(600), profitSale(300, { DateVante: '2026-11-06T12:00:00Z' }), profitSale(-150)] }], [], '2026-11');
  const all = report({ sales });
  const first = buildAllProfits({ sales }, { ...filters, mode: 'day', period: '2026-11-05' });
  const second = buildAllProfits({ sales }, { ...filters, mode: 'day', period: '2026-11-06' });
  assert.equal(all.summary.salesProfit, 500); assert.equal(first.summary.employeeShares, 166.67); assert.equal(first.summary.salesProfit, 283.33);
  assert.equal(Math.round((first.summary.salesProfit + second.summary.salesProfit) * 100), 50000);
});
test('all sources share the same time zone and day/month/year filters; history drills down correctly', () => {
  const data = { orders: [profitOrder({ deliveredAt: '2026-10-31T23:30:00Z' })], fabricMovements: [profitMovement({ occurredAt: '2026-10-31T23:30:00Z' })], sales: [profitSale(30, { employeeShareAmount: 10, DateVante: '2026-10-31T23:30:00Z' })] };
  for (const [mode, period, unit, key] of [['all', '', 'year', '2026'], ['year', '2026', 'month', '2026-11'], ['month', '2026-11', 'day', '2026-11-01'], ['day', '2026-11-01', 'day', '2026-11-01']]) {
    const result = buildAllProfits(data, { ...filters, mode, period });
    assert.equal(result.summary.totalProfit, 170); assert.equal(result.groups[0].unit, unit); assert.equal(result.groups[0].key, key);
  }
  assert.equal(buildAllProfits(data, { ...filters, mode: 'month', period: '2026-10' }).summary.totalProfit, 0);
  assert.equal(buildAllProfits(data, { ...filters, timeZone: 'UTC', mode: 'day', period: '2026-10-31' }).summary.totalProfit, 170);
});
test('invalid periods and time zones are rejected', () => {
  for (const query of [{ mode: 'week' }, { mode: 'day', period: '2026-02-30' }, { mode: 'month', period: '2026-13' }, { mode: 'year', period: '18' }, { timeZone: 'bad/zone' }, { mode: ['all'] }]) assert.throws(() => validateAllProfitQuery(query), /invalidProfitQuery/);
});
test('all-profit navigation remains private to the admin even if an employee can view every source', () => {
  const staff = { moduleAccess: ['profits', 'fabrics', 'tailoring'], operationPermissions: { profits: ['history', 'details', 'download'], fabrics: ['profits'], tailoring: ['profits'] } };
  assert.equal(canOpenEmployeePage('Employe', staff, '/Home/Profit/Ventes'), true);
  assert.equal(canOpenEmployeePage('admin', {}, '/Home/Profit/All'), true);
  assert.equal(canOpenEmployeePage('Employe', staff, '/Home/Profit/All'), false);
});

process.env.JWT_SECRET = 'isolated-all-profits';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
async function request(query = '', actor = { id: owner, role: 'admin' }) {
  const response = await fetch(base + '/Employe/all-profits' + query, { headers: actor ? { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) } : {} });
  return { status: response.status, cache: response.headers.get('Cache-Control'), data: await response.json() };
}
test('API returns owned aggregates only, includes inactive staff, deduplicates pending/archive, and never writes payroll', async t => {
  const f = allProfitsFixture(t); t.mock.method(Payroll, 'create', () => { throw new Error('Reports must not write'); });
  f.orders.push(profitOrder({ idAdmin: foreignOwner })); f.movements.push(profitMovement({ _id: foreignOwner, idAdmin: foreignOwner }));
  const response = await request('?timeZone=Europe%2FParis');
  assert.equal(response.status, 200); assert.equal(response.cache, 'no-store'); assert.equal(response.data.summary.totalProfit, 1310);
  assert.equal(response.data.groups.length, 1); assert.equal(response.data.sections.length, 5);
  assert.doesNotMatch(JSON.stringify(response.data), /password|phone|clientName|nameEmp|employeeId|plans|ventes/);
  assert.equal((await request('', { id: foreignOwner, role: 'admin' })).data.summary.totalProfit, 100149);
});
test('API requires an admin token; employees and anonymous users cannot read the report', async t => {
  allProfitsFixture(t);
  assert.equal((await request('', null)).status, 401);
  assert.equal((await request('', { id: employeeId, role: 'Employe' })).status, 403);
});
test('API validates before database reads, reports read failures safely, and never falls back to gross sales', async t => {
  allProfitsFixture(t); t.mock.method(FabricMovement, 'find', () => { throw new Error('private storage details'); });
  assert.equal((await request('?mode=day&period=2026-02-30')).status, 400);
  const failure = await request(); assert.equal(failure.status, 500); assert.deepEqual(failure.data, { message: 'loadAllProfitsFailed' });
});
test('missing admin accounts cannot receive an empty success report', async t => {
  allProfitsFixture(t); t.mock.method(Admin, 'findById', () => ({ select() { return this; }, lean: async () => null }));
  assert.equal((await request()).status, 404);
});
