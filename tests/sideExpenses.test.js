import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import app from '../BackEnd/app.js';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import SideExpense from '../BackEnd/models/SideExpense.js';
import { currentExpenseMonth, expenseAmountCents, expenseKind, expenseMonth, fixedExpenseAmount, monthlyExpenseTotals, validateSideExpense } from '../shared/sideExpenses.js';
import { expenseEmployee, expenseOtherOwner, expenseOwner, sideExpensesFixture } from './helpers/sideExpensesFixture.js';

let server, base;
const previousSecret = process.env.JWT_SECRET;
before(async () => {
  process.env.JWT_SECRET = 'isolated-side-expenses';
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/side-expenses`;
});
after(async () => {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
});
const owner = { id: expenseOwner, role: 'admin' };
const employee = { id: expenseEmployee, idAdmin: expenseOtherOwner, role: 'Employe' };
const payload = extra => ({ type: 'water', amount: '150.25', requestId: randomUUID(), ...extra });
const request = (method = 'GET', body, actor = owner) => fetch(base, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test('monthly expense validation and Paris month boundaries are explicit', () => {
  assert.equal(currentExpenseMonth(new Date('2026-10-31T23:30:00Z')), '2026-11');
  assert.equal(expenseMonth({ createdAt: '2026-09-30T22:30:00Z' }), '2026-10');
  assert.equal(expenseMonth({ month: '2026-08', createdAt: '2026-10-27' }), '2026-08');
  assert.equal(expenseMonth({ createdAt: 'invalid' }), null);
  for (const month of ['', null, '2026-13', '2026-00', '26-10', '2026-1', {}, '0000-01']) assert.throws(() => validateSideExpense(payload({ month })), error => error.fields.month === 'monthRequired');
  assert.equal(validateSideExpense(payload({ month: '2026-11' })).month, '2026-11');
  assert.equal(expenseKind('internet'), 'fixed'); assert.equal(expenseKind('rent'), 'fixed');
  assert.equal(expenseKind('electricity'), 'variable'); assert.equal(expenseKind('water'), 'variable');
});
test('fixed rates carry forward by expense month without borrowing future prices', () => {
  const items = [
    { _id: '1', type: 'internet', month: '2026-08', amountCents: 30000, createdAt: '2026-10-27' },
    { _id: '2', type: 'internet', month: '2026-10', amountCents: 35000, createdAt: '2026-10-26' },
    { _id: '3', type: 'rent', month: '2026-09', amountCents: 200000, createdAt: '2026-09-04' },
  ];
  assert.equal(fixedExpenseAmount(items, 'internet', '2026-07'), null);
  assert.equal(fixedExpenseAmount(items, 'internet', '2026-09'), 30000);
  assert.equal(fixedExpenseAmount(items, 'internet', '2026-11'), 35000);
  assert.equal(fixedExpenseAmount(items, 'rent', '2026-10'), 200000);
  assert.equal(fixedExpenseAmount(items, 'electricity', '2026-10'), null);
});
test('monthly fixed and variable totals add exact cents and exclude other months', () => {
  const items = [
    { type: 'internet', month: '2026-10', amountCents: 30010 },
    { type: 'rent', month: '2026-10', amountCents: 200000 },
    { type: 'electricity', month: '2026-10', amountCents: 15025 },
    { type: 'water', month: '2026-10', amountCents: 1015 },
    { type: 'electricity', month: '2026-09', amountCents: 9000 },
  ];
  assert.deepEqual(monthlyExpenseTotals(items, '2026-10'), { totalCents: 246050, fixedCents: 230010, variableCents: 16040, count: 4 });
  assert.equal(monthlyExpenseTotals(items).totalCents, 255050);
});
test('fixed expense snapshots retain earlier rates and bind retries to their original month', async t => {
  const f = sideExpensesFixture(t);
  const first = payload({ type: 'internet', amount: '300', month: '2026-09', kind: 'variable', monthlyKey: 'spoof' });
  const saved = await (await request('POST', first)).json();
  assert.equal(saved.kind, 'fixed'); assert.equal(saved.month, '2026-09'); assert.equal(saved.monthEstimated, false);
  assert.equal(f.records.get(saved._id).monthlyKey, 'internet:2026-09');
  assert.equal((await request('POST', payload({ type: 'internet', amount: '350', month: '2026-10' }))).status, 201);
  assert.equal(f.records.get(saved._id).amountCents, 30000);
  assert.deepEqual(await (await request('POST', first)).json(), saved);
  assert.equal((await request('POST', { ...first, month: '2026-10' })).status, 409);
});
test('a fixed monthly expense cannot be duplicated, including concurrent distinct request IDs', async t => {
  const f = sideExpensesFixture(t);
  const responses = await Promise.all([request('POST', payload({ type: 'rent', amount: '2000', month: '2026-10' })), request('POST', payload({ type: 'rent', amount: '2000', month: '2026-10' }))]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const duplicate = responses.find(response => response.status === 409);
  assert.equal((await duplicate.json()).message, 'fixedExpenseExists');
  assert.equal(f.records.size, 1);
  assert.equal((await request('POST', payload({ type: 'rent', month: '2026-11' }))).status, 201);
  assert.equal((await request('POST', payload({ type: 'rent', month: '2026-10' }), { id: expenseOtherOwner, role: 'admin' })).status, 201);
  assert.ok(SideExpense.schema.indexes().some(([keys, options]) => keys.monthlyKey === 1 && options.unique));
});
test('variable bills keep their own monthly amounts and may have multiple dated payments', async t => {
  const f = sideExpensesFixture(t);
  for (const [month, amount] of [['2026-09', '100'], ['2026-10', '170.25'], ['2026-10', '20']]) assert.equal((await request('POST', payload({ type: 'electricity', month, amount }))).status, 201);
  const items = (await (await request()).json()).items;
  assert.equal(monthlyExpenseTotals(items, '2026-09').variableCents, 10000);
  assert.equal(monthlyExpenseTotals(items, '2026-10').variableCents, 19025);
  assert.equal([...f.records.values()].every(row => row.monthlyKey === undefined), true);
});
test('legacy month labels come from registration dates without rewriting records or duplicating fixed bills', async t => {
  const f = sideExpensesFixture(t);
  const row = new SideExpense({ idAdmin: expenseOwner, createdBy: expenseOwner, requestId: randomUUID(), type: 'rent', amountCents: 200000, createdAt: new Date('2026-10-04T12:00:00Z') });
  await row.validate(); f.records.set(String(row._id), row);
  const before = JSON.stringify(row.toObject());
  const item = (await (await request()).json()).items[0];
  assert.equal(item.month, '2026-10'); assert.equal(item.monthEstimated, true); assert.equal(item.kind, 'fixed');
  assert.equal(JSON.stringify(row.toObject()), before);
  assert.equal((await request('POST', payload({ type: 'rent', month: '2026-10' }))).status, 409);
  assert.equal(f.records.size, 1);
});

test('amounts preserve cents and accept decimal commas and Arabic digits', () => {
  for (const [raw, expected] of [['0.01', 1], ['0,10', 10], ['150.25', 15025], [123.5, 12350], [' ٢٥٠٫٥٠ ', 25050], ['۳۰۰,۷۵', 30075], ['999999999.99', 99999999999]]) assert.equal(expenseAmountCents(raw), expected);
  assert.equal(expenseAmountCents('0.10') + expenseAmountCents('0.20'), 30);
});
test('invalid and excessive amounts and invalid expense names are rejected', () => {
  for (const amount of ['', ' ', 0, -1, '-20', '1.001', '1e3', 'Infinity', 'NaN', '1,000.00', '1000000000', true, null, [], {}, '١٢٫٣٤٥']) assert.throws(() => validateSideExpense({ type: 'rent', amount }), error => error.fields.amount === 'amountInvalid');
  for (const otherName of ['', ' ', 'a'.repeat(121), 'name\u0000', 42]) assert.throws(() => validateSideExpense({ type: 'other', otherName, amount: '10' }), error => error.fields.otherName === 'otherNameRequired');
  for (const type of ['unknown', {}, undefined]) assert.throws(() => validateSideExpense({ type, amount: '10' }), error => error.fields.type === 'typeRequired');
  assert.deepEqual(validateSideExpense({ type: 'other', otherName: '  الصيانة  ', amount: '25,50' }), { type: 'other', otherName: 'الصيانة', amountCents: 2550 });
});
test('expense persists with a server date and cannot accept client ownership or totals', async t => {
  const f = sideExpensesFixture(t);
  const body = payload({ idAdmin: expenseOtherOwner, createdBy: expenseEmployee, createdAt: '2000-01-01', amountCents: 1 });
  const response = await request('POST', body);
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.equal(saved.amountCents, 15025);
  assert.ok(new Date(saved.createdAt).getTime() > Date.now() - 60000);
  const record = f.records.get(saved._id);
  assert.equal(String(record.idAdmin), expenseOwner); assert.equal(String(record.createdBy), expenseOwner);
  const listed = await (await request()).json();
  assert.deepEqual(listed.items, [saved]); assert.equal(listed.permissions.add, true);
});
test('each shop sees only its own expenses and can use the same request ID', async t => {
  sideExpensesFixture(t);
  const body = payload();
  const own = await (await request('POST', body)).json();
  const foreign = await (await request('POST', body, { id: expenseOtherOwner, role: 'admin' })).json();
  assert.notEqual(own._id, foreign._id);
  assert.deepEqual((await (await request()).json()).items.map(row => row._id), [own._id]);
  assert.deepEqual((await (await request('GET', undefined, { id: expenseOtherOwner, role: 'admin' })).json()).items.map(row => row._id), [foreign._id]);
});
test('employee uses current shop membership and add permission', async t => {
  const f = sideExpensesFixture(t);
  const saved = await (await request('POST', payload({ type: 'internet', amount: '300' }), employee)).json();
  assert.equal(String(f.records.get(saved._id).idAdmin), expenseOwner);
  assert.equal(String(f.records.get(saved._id).createdBy), expenseEmployee);
  assert.equal((await (await request()).json()).items.length, 1);
  f.staff.action.add = false;
  assert.equal((await (await request('GET', undefined, employee)).json()).permissions.add, false);
  assert.equal((await request('POST', payload(), { ...employee, action: { add: true } })).status, 403);
  assert.equal(f.creates.mock.callCount(), 1);
});
test('inactive, removed, invalid and unauthenticated accounts cannot read or add', async t => {
  const f = sideExpensesFixture(t);
  assert.equal((await request('POST', payload(), null)).status, 401);
  assert.equal((await request('GET', undefined, null)).status, 401);
  assert.equal(f.accountReads.mock.callCount(), 0);
  f.staff.isActive = false;
  for (const actor of [employee, { id: expenseOwner, role: 'visitor' }, { id: 'invalid', role: 'admin' }]) {
    assert.equal((await request('GET', undefined, actor)).status, 403);
    assert.equal((await request('POST', payload(), actor)).status, 403);
  }
  f.staff.isActive = true; f.admins.delete(expenseOwner);
  assert.equal((await request()).status, 403);
  assert.equal((await request('POST', payload(), employee)).status, 403);
  assert.equal(f.creates.mock.callCount(), 0);
});
test('retry returns original record and timestamp without increasing expense total', async t => {
  const f = sideExpensesFixture(t), body = payload();
  const saved = await (await request('POST', body)).json();
  const response = await request('POST', { ...body, amount: '150,25' });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), saved);
  assert.equal(f.records.size, 1);
  assert.equal((await (await request()).json()).items.reduce((sum, row) => sum + row.amountCents, 0), 15025);
});
test('a request ID cannot be reused with different data or a different actor', async t => {
  sideExpensesFixture(t);
  const body = payload({ type: 'other', otherName: 'الصيانة' });
  assert.equal((await request('POST', body)).status, 201);
  for (const patch of [{ amount: '1' }, { otherName: 'التنظيف' }, { type: 'electricity' }]) assert.equal((await request('POST', { ...body, ...patch })).status, 409);
  assert.equal((await request('POST', body, employee)).status, 409);
});
test('simultaneous submissions create one record backed by a unique database index', async t => {
  const f = sideExpensesFixture(t), body = payload();
  const responses = await Promise.all([request('POST', body), request('POST', body)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.equal(f.records.size, 1);
  assert.ok(SideExpense.schema.indexes().some(([keys, options]) => keys.idAdmin === 1 && keys.requestId === 1 && options.unique));
});
test('a lost acknowledgement after writing can be retried without a second charge', async t => {
  const f = sideExpensesFixture(t), body = payload(); f.faults.afterSave = true;
  assert.equal((await request('POST', body)).status, 500);
  assert.equal(f.records.size, 1);
  const retry = await request('POST', body); assert.equal(retry.status, 200);
  assert.equal((await retry.json()).amountCents, 15025); assert.equal(f.records.size, 1);
});
test('bad input and request IDs are rejected without creating expenses', async t => {
  const f = sideExpensesFixture(t);
  for (const body of [payload({ amount: '-5' }), payload({ type: 'unknown' }), payload({ requestId: 'invalid' }), payload({ requestId: null }), payload({ type: 'other', otherName: '' })]) assert.equal((await request('POST', body)).status, 400);
  assert.equal(f.records.size, 0);
  assert.equal(f.creates.mock.callCount(), 0);
});
test('database failures return a stable error without leaking private details', async t => {
  const f = sideExpensesFixture(t); f.faults.read = true;
  const response = await request(); assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: 'loadFailed' });
});
