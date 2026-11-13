import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { tailoringSfifaFixture } from './helpers/tailoringSfifaFixture.js';
import { workerMaterialsFixture } from './helpers/workerMaterialsFixture.js';
import { owner, otherOwner, employee, garment, orderInput } from './helpers/djellabaCostsFixture.js';
import { emptySfifaStyles, normalizeSfifaStyles, sfifaStyleSummary } from '../shared/sfifaStyleBalances.js';
import { employeeCanRequest } from '../shared/employeePermissions.js';
const secret = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = 'isolated-sfifa-type-balances'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret; });
const admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe' };
async function request(url, body, method = body === undefined ? 'GET' : 'POST', actor = admin) {
  const r = await fetch(base + url, { method, headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, data: await r.json() };
}
const detailsPath = f => `/sfifa-stock/${f.sfifa._id}/variants/${f.sfifa.variants[0]._id}/details`;
const input = (f, patch = {}) => orderInput({ deductFabricStock: true, salePricingVersion: 3, paidAmount: 0, items: [garment({ fabricSource: 'shop', fabricId: String(f.fabric._id), colorId: String(f.fabric.colors[0]._id), fabricPieceId: String(f.fabric.colors[0].pieces[0]._id), fabricUnitPrice: 30, fabricMeters: 3, sfifa: { width: 'thin', style: 'fabric', stock: f.selection() } })], ...patch });
const create = async (f, patch) => { const r = await request('/tailoring-orders', input(f, patch)); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data; };
async function detail(f) { const r = await request(detailsPath(f)); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.item; }
const assertBalance = (row, quantity, styles, unclassified = 0) => {
  assert.equal(row.quantity, quantity); assert.deepEqual(row.styleMeters, styles); assert.equal(row.unclassifiedMeters, unclassified);
  assert.equal(Math.round((Object.values(row.styleMeters).reduce((a, b) => a + b, 0) + row.unclassifiedMeters) * 1000), Math.round(quantity * 1000));
};
test('fractional style balances reconcile exactly and unknown history never invents a color type', () => {
  assert.deepEqual(emptySfifaStyles(), { single: 0, double: 0, gradient: 0 });
  assert.deepEqual(sfifaStyleSummary({ single: .1, double: .2, gradient: .125 }, .5), { styleMeters: { single: .1, double: .2, gradient: .125 }, unclassifiedMeters: .075 });
  assert.deepEqual(normalizeSfifaStyles({ single: 10, double: 10, gradient: 0 }, 17), { single: 7, double: 7, gradient: 0 });
  assert.deepEqual(sfifaStyleSummary(undefined, 20), { styleMeters: emptySfifaStyles(), unclassifiedMeters: 20 });
});
test('details require their own current permission and never expose another shop or worker payroll', async t => {
  const f = tailoringSfifaFixture(t); f.staff.moduleAccess.push('sfifa'); f.staff.operationPermissions.sfifa = ['history'];
  assert.equal((await request(detailsPath(f), undefined, 'GET', staff)).status, 403);
  assert.equal(employeeCanRequest(f.staff, 'GET', detailsPath(f)), false);
  f.staff.operationPermissions.sfifa = ['details'];
  let r = await request(detailsPath(f), undefined, 'GET', staff); assert.equal(r.status, 200);
  assertBalance(r.data.item, 20, { single: 10, double: 6, gradient: 4 });
  for (const key of ['receipts', 'production', 'workerMaterialDebits', 'tailoringStockOperations', 'idAdmin']) assert.equal(r.data.item[key], undefined);
  assert.equal((await request(detailsPath(f), undefined, 'GET', { id: otherOwner, role: 'admin' })).status, 404);
  f.staff.operationPermissions.sfifa = []; assert.equal((await request(detailsPath(f), undefined, 'GET', staff)).status, 403);
});
for (const standalone of [false, true]) {
  const mode = standalone ? 'standalone' : 'transaction';
  test(`${mode}: saving deducts only the chosen type; pending cancellation restores it once`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone;
    const body = input(f); body.items[0].sfifa.stock.meters = 2.125;
    const r = await request('/tailoring-orders', body); assert.equal(r.status, 201);
    assertBalance(await detail(f), 17.875, { single: 7.875, double: 6, gradient: 4 });
    assert.equal((await request('/tailoring-orders', body)).status, 200); assertBalance(await detail(f), 17.875, { single: 7.875, double: 6, gradient: 4 });
    const order = r.data;
    for (let i = 0; i < 2; i++) { const cancelled = await request(`/tailoring-orders/${order._id}/cancel`, { version: order.__v }); assert.equal(cancelled.status, 200); assertBalance(await detail(f), 20, { single: 10, double: 6, gradient: 4 }); }
  });
  test(`${mode}: switching color type with the same total adjusts both type balances`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone;
    const order = await create(f);
    const body = { ...order, automaticCosting: true, deductFabricStock: true, salePricingVersion: 3, costSettingsVersion: order.costing.settingsVersion, version: order.__v, items: order.items.map(row => ({ ...row, fabricUnitPrice: row.costs.fabricUnitPrice, sfifa: { ...row.sfifa, style: 'twoTone', stock: { ...row.sfifa.stock, meterType: 'double' } } })) };
    const r = await request('/tailoring-orders/' + order._id, body, 'PUT'); assert.equal(r.status, 200, JSON.stringify(r.data));
    assertBalance(await detail(f), 17, { single: 10, double: 3, gradient: 4 });
    assert.equal(f.meters(), 32);
  });
  test(`${mode}: a delivered cancellation keeps the chosen subtype consumed`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone; const order = await create(f);
    let r = await request(`/tailoring-orders/${order._id}/deliver`, { version: order.__v }); assert.equal(r.status, 200);
    r = await request(`/tailoring-orders/${order._id}/cancel`, { version: r.data.__v }); assert.equal(r.status, 200);
    assertBalance(await detail(f), 17, { single: 7, double: 6, gradient: 4 }); assert.equal(f.meters(), 32);
  });
  test(`${mode}: a color type cannot consume another type's meters`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone;
    const body = input(f); body.items[0].sfifa = { width: 'thin', style: 'gradient', stock: f.selection(undefined, { meterType: 'gradient', meters: 5 }) };
    const r = await request('/tailoring-orders', body); assert.equal(r.status, 409); assert.equal(r.data.message, 'insufficientSfifaStock');
    assertBalance(await detail(f), 20, { single: 10, double: 6, gradient: 4 }); assert.equal(f.meters(), 35); assert.equal(f.orders.size, 0);
  });
}
test('older aggregate-only deductions are reconstructed before the next subtype debit', async t => {
  const f = tailoringSfifaFixture(t); f.controls.standalone = true;
  await create(f); f.stocks.get(String(f.sfifa._id)).variants[0].styleMeters = undefined;
  assertBalance(await detail(f), 17, { single: 7, double: 6, gradient: 4 });
  await create(f); assertBalance(await detail(f), 14, { single: 4, double: 6, gradient: 4 });
});
test('a lost stock acknowledgement and cancellation retry cannot duplicate a type debit or return', async t => {
  const f = tailoringSfifaFixture(t); f.controls.standalone = true; f.controls.failSfifaAfter = true; const body = input(f);
  let r = await request('/tailoring-orders', body); assert.equal(r.status, 503); assertBalance(await detail(f), 17, { single: 7, double: 6, gradient: 4 });
  r = await request('/tailoring-orders', body); assert.equal(r.status, 200);
  f.controls.failSfifaAfter = true;
  r = await request(`/tailoring-orders/${r.data._id}/cancel`, { version: r.data.__v }); assert.equal(r.status, 503);
  await request('/tailoring-orders'); assertBalance(await detail(f), 20, { single: 10, double: 6, gradient: 4 });
});
test('untyped restocks are separate from existing typed balances', async t => {
  const f = tailoringSfifaFixture(t); await create(f);
  const r = await request(`/sfifa-stock/${f.sfifa._id}/variants/${f.sfifa.variants[0]._id}/restock`, { quantity: 2.5, requestId: crypto.randomUUID() }); assert.equal(r.status, 201, JSON.stringify(r.data));
  assertBalance(await detail(f), 19.5, { single: 7, double: 6, gradient: 4 }, 2.5);
});
test('worker shop material reservations and returns update the same per-type balances', async t => {
  const f = workerMaterialsFixture(t);
  f.sfifa.receipts.push({ requestId: crypto.randomUUID(), code: 12, quantity: 20, styleMeters: { single: 6, double: 0, gradient: 14 }, createdBy: owner, date: new Date() });
  const rows = ['single', 'gradient'].map(sfifaStyle => ({ ...f.selection(crypto.randomUUID().replaceAll('-', '').slice(0, 24)), sfifaStyle }));
  const path = '/tailoring-workers/' + f.worker._id + '/work';
  const r = await request(path, { category: 'machine', workType: 'shop', garmentType: 'djellaba', productName: 'الجلابيب', quantity: 2, materials: rows, requestId: crypto.randomUUID() }); assert.equal(r.status, 201, JSON.stringify(r.data));
  assertBalance(await detail(f), 14, { single: 3, double: 0, gradient: 11 });
  const cancelled = await request(path + '/' + r.data._id + '/cancel', { version: r.data.__v, requestId: crypto.randomUUID() }); assert.equal(cancelled.status, 200);
  assertBalance(await detail(f), 20, { single: 6, double: 0, gradient: 14 });
});
test('a fully reserved type remains editable without a second debit and returns on cancellation', async t => {
  const f = tailoringSfifaFixture(t); const body = input(f); body.items[0].sfifa.stock.meters = 10;
  const created = await request('/tailoring-orders', body); assert.equal(created.status, 201); const order = created.data;
  assertBalance(await detail(f), 10, { single: 0, double: 6, gradient: 4 });
  const changed = { ...order, automaticCosting: true, deductFabricStock: true, salePricingVersion: 3, costSettingsVersion: order.costing.settingsVersion, version: order.__v, items: order.items.map(row => ({ ...row, fabricUnitPrice: row.costs.fabricUnitPrice })) };
  const edited = await request('/tailoring-orders/' + order._id, changed, 'PUT'); assert.equal(edited.status, 200, JSON.stringify(edited.data));
  assertBalance(await detail(f), 10, { single: 0, double: 6, gradient: 4 });
  const cancelled = await request('/tailoring-orders/' + order._id + '/cancel', { version: edited.data.__v }); assert.equal(cancelled.status, 200);
  assertBalance(await detail(f), 20, { single: 10, double: 6, gradient: 4 });
});
