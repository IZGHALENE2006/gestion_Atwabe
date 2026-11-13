import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import app from '../BackEnd/app.js';
import { tailoringSfifaFixture } from './helpers/tailoringSfifaFixture.js';
import { owner, otherOwner, employee, garment, orderInput } from './helpers/djellabaCostsFixture.js';
import { protectTailoringSfifaDeletion } from '../BackEnd/utils/tailoringSfifaStock.js';
import { validateTailoringSfifaSelection } from '../shared/tailoringSfifa.js';
const previousSecret = process.env.JWT_SECRET;
let server, base;
before(async () => { process.env.JWT_SECRET = 'isolated-order-sfifa-stock'; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
async function request(url, body, method = body === undefined ? 'GET' : 'POST', actor = { id: owner, role: 'admin' }) {
  const r = await fetch(base + url, { method, headers: { Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: r.status, data: await r.json() };
}
const item = (f, patch = {}) => garment({ fabricSource: 'shop', fabricId: String(f.fabric._id), colorId: String(f.fabric.colors[0]._id), fabricPieceId: String(f.fabric.colors[0].pieces[0]._id), fabricUnitPrice: 30, fabricMeters: 3, sfifa: { width: 'thin', style: 'fabric', stock: f.selection() }, ...patch });
const input = (f, patch = {}) => orderInput({ deductFabricStock: true, salePricingVersion: 3, paidAmount: 0, items: [item(f)], ...patch });
async function create(f, patch) { const r = await request('/tailoring-orders', input(f, patch)); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data; }
const edit = order => ({ ...order, automaticCosting: true, deductFabricStock: Boolean(order.fabricStock), costSettingsVersion: order.costing.settingsVersion, salePricingVersion: order.costing.pricingVersion, version: order.__v, items: order.items.map(row => ({ ...row, fabricUnitPrice: row.costs.fabricUnitPrice })) });

test('stock sfifa selection validates IDs, subtype and positive fractional meters', () => {
  const valid = { stockId: 'a'.repeat(24), variantId: 'b'.repeat(24), meters: '2,125', meterType: 'double' };
  assert.equal(validateTailoringSfifaSelection(valid).meters, 2.125);
  for (const patch of [{ stockId: '' }, { variantId: {} }, { meters: 0 }, { meters: -1 }, { meters: '1.0001' }, { meterType: 'bad' }]) assert.throws(() => validateTailoringSfifaSelection({ ...valid, ...patch }), /invalidOrder/);
});
test('tailoring options expose the owner stock, available styles and quantities without worker data', async t => {
  const f = tailoringSfifaFixture(t); f.seedSfifa({ idAdmin: otherOwner });
  let r = await request('/tailoring-orders/sfifa-options', undefined, 'GET', { id: employee, role: 'Employe' }); assert.equal(r.status, 200); assert.equal(r.data.items.length, 1); assert.deepEqual(r.data.items[0].styles, ['single', 'double', 'gradient']); assert.equal(r.data.items[0].quantity, 20);
  f.staff.operationPermissions.tailoring = ['details']; r = await request('/tailoring-orders/sfifa-options', undefined, 'GET', { id: employee, role: 'Employe' }); assert.equal(r.status, 403);
});
for (const standalone of [false, true]) {
  const suffix = standalone ? 'standalone' : 'transaction';
  for (const garmentType of ['djellaba', 'jabador', 'malakiya']) test(`${suffix}: ${garmentType} deducts stock using the existing thin/wide sale prices`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone;
    const wide = f.seedSfifa({ width: 'thick' });
    const order = await create(f, { garmentType, items: [item(f), item(f, { sfifa: { width: 'thick', style: 'twoTone', stock: f.selection(wide, { meters: 4.125, meterType: 'double' }) } })] });
    assert.equal(order.items[0].price, 130); assert.equal(order.items[1].price, 160); assert.equal(order.totalPrice, 290);
    assert.equal(f.meters(), 29); assert.equal(f.sfifaMeters(), 17); assert.equal(f.sfifaMeters(wide), 15.875); assert.equal(order.sfifaStock.rows.length, 2); assert.equal(order.items[1].sfifa.stock.code, 12);
    const retry = await request('/tailoring-orders', input(f, { requestId: f.orders.get(order._id).requestId })); assert.equal(retry.status, 409); assert.equal(f.sfifaMeters(), 17);
  });
  test(`${suffix}: edits adjust differences, switching back returns sfifa, then cancellation restores pending materials once`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone;
    let order = await create(f), body = edit(order); body.items[0].sfifa.stock.meters = 5;
    let r = await request('/tailoring-orders/' + order._id, body, 'PUT'); assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(f.sfifaMeters(), 15); assert.equal(r.data.totalPrice, 130);
    order = r.data; body = edit(order); delete body.items[0].sfifa.stock;
    r = await request('/tailoring-orders/' + order._id, body, 'PUT'); assert.equal(r.status, 200); assert.equal(f.sfifaMeters(), 20); assert.equal(r.data.sfifaStock.rows.length, 0);
    order = r.data; body = edit(order); body.items[0].sfifa.stock = f.selection();
    r = await request('/tailoring-orders/' + order._id, body, 'PUT'); assert.equal(r.status, 200); assert.equal(f.sfifaMeters(), 17);
    for (let i = 0; i < 2; i++) { r = await request('/tailoring-orders/' + order._id + '/cancel', { version: r.data.__v }); assert.equal(r.status, 200); assert.equal(f.sfifaMeters(), 20); assert.equal(f.meters(), 35); assert.ok(r.data.sfifaStock.returnedAt); }
  });
  test(`${suffix}: cancelling a delivered order excludes profit and keeps cloth and sfifa consumed`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone; const order = await create(f);
    let r = await request('/tailoring-orders/' + order._id + '/deliver', { version: order.__v }); assert.equal(r.status, 200);
    r = await request('/tailoring-orders/' + order._id + '/cancel', { version: r.data.__v }); assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(f.meters(), 32); assert.equal(f.sfifaMeters(), 17); assert.equal(r.data.fabricStock.returnedAt, undefined); assert.equal(r.data.sfifaStock.returnedAt, undefined); assert.ok(r.data.cancelledAt); assert.ok(r.data.deliveredAt);
    const report = await request('/fabrics/profits'); assert.equal(report.status, 200); assert.equal(report.data.summary.profitAmount, 0);
    r = await request('/tailoring-orders/' + order._id + '/cancel', { version: 0 }); assert.equal(r.status, 200); assert.equal(f.sfifaMeters(), 17); assert.equal(f.meters(), 32);
  });
  test(`${suffix}: aggregate sfifa shortage, foreign stock and wrong subtypes never consume fabric`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone;
    const foreign = f.seedSfifa({ idAdmin: otherOwner });
    for (const selection of [f.selection(undefined, { meters: 21 }), f.selection(foreign), f.selection(undefined, { meterType: 'double' })]) {
      const r = await request('/tailoring-orders', input(f, { items: [item(f, { sfifa: { width: 'thin', style: 'fabric', stock: selection } })] }));
      assert.ok([400, 409].includes(r.status), JSON.stringify(r)); assert.equal(f.meters(), 35); assert.equal(f.sfifaMeters(), 20); assert.equal(f.orders.size, 0);
    }
    const r = await request('/tailoring-orders', input(f, { items: [item(f, { sfifa: { width: 'thin', style: 'fabric', stock: f.selection(undefined, { meters: 11 }) } }), item(f, { sfifa: { width: 'thin', style: 'fabric', stock: f.selection(undefined, { meters: 11 }) } })] }));
    assert.equal(r.status, 409); assert.equal(r.data.message, 'insufficientSfifaStock'); assert.equal(f.meters(), 35);
  });
  test(`${suffix}: sfifa-only additions to old orders never invent a cloth debit`, async t => {
    const f = tailoringSfifaFixture(t); f.controls.standalone = standalone;
    let order = await create(f, { deductFabricStock: false, items: [item(f, { sfifa: { width: 'thin', style: 'fabric' } })] });
    assert.equal(order.fabricStock, undefined); assert.equal(f.meters(), 35);
    const body = edit(order); body.items[0].sfifa.stock = f.selection();
    let r = await request('/tailoring-orders/' + order._id, body, 'PUT'); assert.equal(r.status, 200); assert.equal(r.data.fabricStock, undefined); assert.equal(f.sfifaMeters(), 17); assert.equal(f.meters(), 35);
    r = await request('/tailoring-orders/' + order._id + '/cancel', { version: r.data.__v }); assert.equal(r.status, 200); assert.equal(f.sfifaMeters(), 20); assert.equal(f.meters(), 35);
  });
}
test('standalone acknowledgement loss and interrupted commit resume both stock debits exactly once', async t => {
  const f = tailoringSfifaFixture(t); f.controls.standalone = true; f.controls.failSfifaAfter = true;
  const body = input(f); let r = await request('/tailoring-orders', body); assert.equal(r.status, 503); assert.equal(f.sfifaMeters(), 17); assert.equal(f.meters(), 32);
  r = await request('/tailoring-orders', body); assert.equal(r.status, 200); assert.equal(f.sfifaMeters(), 17); assert.equal(f.meters(), 32); assert.equal(r.data.stockOperation, undefined);
  f.controls.failSfifaAfter = true;
  r = await request('/tailoring-orders/' + r.data._id + '/cancel', { version: r.data.__v }); assert.equal(r.status, 503); assert.equal(f.sfifaMeters(), 20);
  r = await request('/tailoring-orders'); assert.equal(r.status, 200); assert.equal(r.data.orders[0].stockOperation, undefined); assert.equal(f.sfifaMeters(), 20); assert.equal(f.meters(), 35);
});
test('standalone sfifa shortage after intent rolls back the already deducted fabric', async t => {
  const f = tailoringSfifaFixture(t); f.controls.standalone = true;
  f.controls.afterIntent = () => { const row = f.stocks.get(String(f.sfifa._id)); row.quantity = 0; row.variants[0].quantity = 0; };
  const r = await request('/tailoring-orders', input(f)); assert.equal(r.status, 409); assert.equal(r.data.message, 'insufficientSfifaStock'); assert.equal(f.meters(), 35); assert.equal(f.orders.size, 0); assert.equal(f.sfifaMeters(), 0);
});
test('active tailoring sfifa reservations prevent deletion until cancellation', async t => {
  const f = tailoringSfifaFixture(t), order = await create(f);
  await assert.rejects(protectTailoringSfifaDeletion(f.stocks.get(String(f.sfifa._id)), new Set([String(f.sfifa.variants[0]._id)])), { message: 'tailoringSfifaInUse' });
  const r = await request('/tailoring-orders/' + order._id + '/cancel', { version: order.__v }); assert.equal(r.status, 200);
  await protectTailoringSfifaDeletion(f.stocks.get(String(f.sfifa._id)), null);
});
test('transaction rollback includes sfifa when a later cloth or order write fails', async t => {
  const f = tailoringSfifaFixture(t); f.controls.failFabricBefore = true;
  let r = await request('/tailoring-orders', input(f)); assert.equal(r.status, 503); assert.equal(f.sfifaMeters(), 20); assert.equal(f.meters(), 35); assert.equal(f.orders.size, 0);
  delete f.controls.failFabricBefore;
  f.controls.retryTransactionOnce = true;
  const order = await create(f); assert.equal(f.sfifaMeters(), 17); assert.equal(f.meters(), 32);
  f.faults.orderSave = true;
  r = await request('/tailoring-orders/' + order._id + '/cancel', { version: order.__v }); assert.equal(r.status, 503); assert.equal(f.sfifaMeters(), 17); assert.equal(f.meters(), 32);
});
