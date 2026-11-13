import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from '../BackEnd/node_modules/jsonwebtoken/index.js';
import { randomUUID } from 'node:crypto';
import TrouserCostSettings from '../BackEnd/models/TrouserCostSettings.js';
import TailoringOrder from '../BackEnd/models/TailoringOrder.js';
import { djellabaFixture, owner, otherOwner, employee, query, garment } from './helpers/djellabaCostsFixture.js';
import { tailoringStockFixture } from './helpers/tailoringStockFixture.js';
import { validateTailoringOrder } from '../shared/tailoring.js';
import { trouserCostsTotal, trouserOrderCostsTotal, trouserLaborCostsTotal, trouserLaborRates, validateDjellabaRates, tailoringRateFields } from '../shared/tailoringCosts.js';
process.env.JWT_SECRET = 'isolated-trouser-labor';
const { default: app } = await import('../BackEnd/app.js');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/tailoring-orders'; });
after(() => server.close());
const admin = { id: owner, role: 'admin' }, staff = { id: employee, role: 'Employe', idAdmin: owner };
const request = async (path = '', body, actor = admin, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign(actor, process.env.JWT_SECRET) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
};
function fixture(t, createFixture = djellabaFixture) {
  const f = createFixture(t), laborSettings = new Map(), fault = {};
  t.mock.method(TrouserCostSettings, 'findOne', scope => query(() => laborSettings.has(String(scope.idAdmin)) ? new TrouserCostSettings(laborSettings.get(String(scope.idAdmin)).toObject()) : null));
  t.mock.method(TrouserCostSettings, 'create', async input => {
    if (laborSettings.has(String(input.idAdmin))) throw Object.assign(new Error('duplicate'), { code: 11000 });
    const row = new TrouserCostSettings({ ...input, __v: 0 }); await row.validate(); laborSettings.set(String(row.idAdmin), row); return row;
  });
  t.mock.method(TrouserCostSettings.prototype, 'save', async function () {
    if (fault.save) throw new Error('Synthetic write failure');
    const old = laborSettings.get(String(this.idAdmin)); await this.validate();
    if (!old || this.__v !== old.__v) throw Object.assign(new Error('Conflict'), { name: 'VersionError' });
    this.__v += 1; laborSettings.set(String(this.idAdmin), new TrouserCostSettings(this.toObject())); return this;
  });
  const seedLabor = (laborPrice = 15, idAdmin = owner) => { const row = new TrouserCostSettings({ idAdmin, laborPrice, updatedBy: idAdmin, __v: 0 }); laborSettings.set(String(idAdmin), row); return row; };
  return { ...f, laborSettings, fault, seedLabor };
}
const saveRate = (laborPrice, version = null, actor = admin) => request('/cost-settings?garment=trousers', { rates: typeof laborPrice === 'object' ? laborPrice : { regularLaborPrice: laborPrice, qandrissiLaborPrice: laborPrice }, version }, actor, 'PUT');
const trouser = patch => { const item = garment({ trouserType: 'regular', fabricUnitPrice: 0, ...patch }); delete item.sfifa; return item; };
const input = patch => ({ clientName: 'زبون السراويل', phone: '0612345678', orderDate: '2026-11-02', readyDate: '2026-11-10', garmentType: 'trousers', paidAmount: 100, expenseAmount: 15, fabricCosting: true, laborCosting: true, costSettingsVersion: 0, items: [trouser()], requestId: randomUUID(), ...patch });
const edit = (order, patch) => ({ ...validateTailoringOrder({ ...order, fabricCosting: true, laborCosting: true, costSettingsVersion: order.trouserCosting?.settingsVersion ?? null, items: order.items.map(item => ({ ...item, fabricUnitPrice: item.fabricCost?.fabricUnitPrice ?? 0 })) }), version: order.__v, ...patch });

test('trouser settings contain only labor and remain separate from other garment prices and other shops', async t => {
  const f = fixture(t); f.seedSettings();
  let result = await request('/cost-settings?garment=trousers'); assert.equal(result.status, 200); assert.equal(result.data.configured, false);
  result = await saveRate('12,50'); assert.equal(result.status, 200); assert.deepEqual(result.data.rates, { regularLaborPrice: 12.5, qandrissiLaborPrice: 12.5 }); assert.deepEqual(tailoringRateFields('trousers'), ['regularLaborPrice', 'qandrissiLaborPrice']);
  assert.deepEqual((await request('/cost-settings')).data.rates, { thinSfifaPrice: 10, thickSfifaPrice: 20, laborPrice: 30 });
  assert.equal((await request('/cost-settings?garment=trousers', undefined, { id: otherOwner, role: 'admin' })).data.configured, false);
  assert.deepEqual(validateDjellabaRates({ laborPrice: '0', thinSfifaPrice: 100 }, 'trousers'), { regularLaborPrice: 0, qandrissiLaborPrice: 0 });
});
test('invalid prices, stale versions and failed saves preserve the existing labor rate', async t => {
  const f = fixture(t); f.seedLabor();
  for (const value of ['', -1, '1.001', 'NaN', {}, '1e2']) assert.equal((await saveRate(value, 0)).status, 400);
  let result = await saveRate(20, 0); assert.equal(result.status, 200); assert.equal(result.data.version, 1);
  assert.equal((await saveRate(25, 0)).status, 409); assert.equal((await saveRate(20, 0)).status, 200);
  f.fault.save = true; assert.equal((await saveRate(25, 1)).status, 500); assert.deepEqual(trouserLaborRates(f.laborSettings.get(owner)), { regularLaborPrice: 20, qandrissiLaborPrice: 20 });
});
test('current section access and operation permissions govern viewing and saving trouser prices', async t => {
  const f = fixture(t); f.staff.moduleAccess = ['tailoring']; f.staff.action.update = false;
  assert.equal((await request('/cost-settings?garment=trousers', undefined, staff)).data.canEdit, false); assert.equal((await saveRate(20, null, staff)).status, 403);
  f.staff.action.update = true; assert.equal((await saveRate(20, null, staff)).status, 200);
  f.staff.moduleAccess = []; assert.equal((await request('/cost-settings?garment=trousers', undefined, staff)).status, 403); assert.equal((await saveRate(30, 0, staff)).status, 403);
});
test('the suggested total adds labor once per trouser, including customer cloth, using exact centimes', () => {
  assert.equal(trouserCostsTotal([{ fabricAmount: 50 }, { fabricAmount: 37.5 }, { fabricAmount: 0 }], 15), 132.5);
  assert.equal(trouserCostsTotal([{ fabricAmount: 0.1 }, { fabricAmount: 0.2 }], '0.10'), 0.5);
  for (const costs of [[], undefined, [null]]) assert.equal(trouserCostsTotal(costs, 10), null);
  assert.equal(trouserCostsTotal([{ fabricAmount: 999999999.99 }], 0.01), null);
});
test('orders store the authoritative labor snapshot and preserve manually edited expenses', async t => {
  const f = fixture(t); f.seedLabor(); const fabric = f.seedFabric();
  const items = [trouser({ fabricSource: 'shop', fabricId: String(fabric._id), colorId: String(fabric.colors[0]._id), fabricUnitPrice: 25 }), trouser({ trouserType: 'qandrissi' })];
  for (const expenseAmount of [0, 80, 120.5]) {
    const result = await request('', input({ items, expenseAmount, trouserCosting: { laborPrice: 999 } })); assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.equal(result.data.trouserCosting.regularLaborPrice, 15); assert.equal(result.data.trouserCosting.settingsVersion, 0); assert.equal(result.data.expenseAmount, expenseAmount); assert.equal(result.data.items[0].fabricCost.fabricAmount, 50); assert.equal(result.data.items[1].fabricCost.fabricAmount, 0);
    assert.equal(result.data.costing, undefined); assert.equal(result.data.items[0].sfifa, undefined); assert.doesNotMatch(JSON.stringify(result.data.customerReceipt), /trouserCosting|laborPrice|expenseAmount/);
  }
});
test('a changed price blocks a stale new order but a committed retry returns its original snapshot', async t => {
  const f = fixture(t); f.seedLabor(); const body = input(); let result = await request('', body); assert.equal(result.status, 201);
  await saveRate(25, 0); result = await request('', body); assert.equal(result.status, 200); assert.equal(result.data.trouserCosting.regularLaborPrice, 15); assert.equal(f.orders.size, 1);
  result = await request('', input()); assert.equal(result.status, 409); assert.equal(result.data.message, 'costSettingsChanged'); assert.equal(f.orders.size, 1);
});
test('editing and delivering retain the saved labor rate after prices change', async t => {
  const f = fixture(t); f.seedLabor(); let result = await request('', input()); assert.equal(result.status, 201); let order = result.data;
  await saveRate(99, 0); result = await request('/' + order._id, edit(order, { clientName: 'اسم معدّل', expenseAmount: 35 }), admin, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.data)); order = result.data;
  assert.equal(order.trouserCosting.regularLaborPrice, 15); assert.equal(order.expenseAmount, 35);
  result = await request('/' + order._id + '/deliver', { version: order.__v }); assert.equal(result.status, 200); assert.equal(result.data.trouserCosting.regularLaborPrice, 15); assert.equal(result.data.deliveryFinancials.expenseAmount, 35);
});
test('unconfigured and legacy orders retain zero labor when global prices are subsequently set', async t => {
  const f = fixture(t); let result = await request('', input({ costSettingsVersion: null, expenseAmount: 0 })); assert.equal(result.status, 201); const order = result.data;
  assert.equal(order.trouserCosting.regularLaborPrice, 0); assert.equal(order.trouserCosting.settingsVersion, null); await saveRate(25);
  result = await request('/' + order._id, edit(order), admin, 'PUT'); assert.equal(result.status, 200); assert.equal(result.data.trouserCosting.regularLaborPrice, 0); assert.equal(result.data.expenseAmount, 0);
  const legacyBody = input(); delete legacyBody.laborCosting; delete legacyBody.costSettingsVersion; result = await request('', legacyBody); assert.equal(result.status, 201); assert.equal(result.data.trouserCosting, undefined);
  result = await request('/' + result.data._id, edit(result.data), admin, 'PUT'); assert.equal(result.status, 200); assert.equal(result.data.trouserCosting.regularLaborPrice, 0); assert.equal(f.orders.size, 2);
});

test('independent trouser rates initialize from the legacy price and save without repricing other settings', async t => {
  const f = fixture(t); f.seedLabor();
  const loaded = await request('/cost-settings?garment=trousers');
  assert.equal(loaded.data.configured, true); assert.deepEqual(loaded.data.rates, { regularLaborPrice: 15, qandrissiLaborPrice: 15 });
  let result = await saveRate({ regularLaborPrice: '12,50', qandrissiLaborPrice: '27.75' }, 0);
  assert.equal(result.status, 200); assert.deepEqual(result.data.rates, { regularLaborPrice: 12.5, qandrissiLaborPrice: 27.75 }); assert.equal(result.data.version, 1);
  result = await saveRate({ regularLaborPrice: '0', qandrissiLaborPrice: 27.75 }, 1);
  assert.equal(result.status, 200); assert.deepEqual(result.data.rates, { regularLaborPrice: 0, qandrissiLaborPrice: 27.75 });
  assert.deepEqual((await request('/cost-settings?garment=trousers')).data.rates, result.data.rates);
  assert.equal((await saveRate(result.data.rates, 1)).data.version, 2);
  assert.equal((await saveRate({ regularLaborPrice: 1, qandrissiLaborPrice: 2 }, 1)).status, 409);
});
test('both trouser rates are required and invalid typed prices never fall back to the legacy price', async t => {
  const f = fixture(t); f.seedLabor();
  for (const rates of [{}, { regularLaborPrice: 10 }, { qandrissiLaborPrice: 20 }, { regularLaborPrice: '', qandrissiLaborPrice: 20, laborPrice: 15 }, { regularLaborPrice: 10, qandrissiLaborPrice: -1 }, { regularLaborPrice: 10, qandrissiLaborPrice: '1.001' }]) {
    const result = await saveRate(rates, 0); assert.equal(result.status, 400); assert.equal(f.laborSettings.get(owner).__v, 0);
  }
  for (const rates of [{}, { regularLaborPrice: 10 }, { laborPrice: 15, qandrissiLaborPrice: 20 }]) {
    await assert.rejects(new TrouserCostSettings({ idAdmin: owner, updatedBy: owner, ...rates }).validate());
    const row = new TailoringOrder({ trouserCosting: { ...rates, calculatedAt: new Date() } });
    assert.ok(Object.keys(row.trouserCosting.validateSync().errors).some(key => /LaborPrice/.test(key)));
  }
});
test('mixed-type expenses sum the correct rate for each piece with exact centimes', () => {
  const rates = { regularLaborPrice: 12.5, qandrissiLaborPrice: 27.75 };
  const items = [trouser({ fabricCost: { fabricAmount: 50 } }), trouser({ trouserType: 'qandrissi', fabricCost: { fabricAmount: 0 } }), trouser({ fabricCost: { fabricAmount: 37.5 } })];
  assert.equal(trouserLaborCostsTotal(items, rates), 52.75); assert.equal(trouserOrderCostsTotal(items, rates), 140.25);
  items[0].trouserType = 'qandrissi'; assert.equal(trouserOrderCostsTotal(items, rates), 155.5);
  assert.equal(trouserOrderCostsTotal(items, { laborPrice: 15 }), 132.5);
  assert.equal(trouserOrderCostsTotal(items), 87.5);
  assert.equal(trouserOrderCostsTotal([trouser({ fabricCost: { fabricAmount: 0.1 } }), trouser({ trouserType: 'qandrissi', fabricCost: { fabricAmount: 0.2 } })], { regularLaborPrice: 0.1, qandrissiLaborPrice: 0.2 }), 0.6);
  for (const invalid of [undefined, [], [null], [{}]]) assert.equal(trouserOrderCostsTotal(invalid, rates), null);
  assert.equal(trouserOrderCostsTotal([trouser({ fabricCost: { fabricAmount: 999999999.99 } })], rates), null);
});
test('mixed orders freeze authoritative independent rates across edits, retries and delivery', async t => {
  fixture(t);
  const rates = { regularLaborPrice: 12.5, qandrissiLaborPrice: 27.75 }; assert.equal((await saveRate(rates)).status, 200);
  const body = input({ items: [trouser(), trouser({ trouserType: 'qandrissi' })], expenseAmount: 40.25, trouserCosting: { regularLaborPrice: 999, qandrissiLaborPrice: 999 } });
  let result = await request('', body); assert.equal(result.status, 201); let order = result.data;
  assert.deepEqual(trouserLaborRates(order.trouserCosting), rates); assert.equal(order.trouserCosting.laborPrice, undefined);
  assert.doesNotMatch(JSON.stringify(order.customerReceipt), /regularLaborPrice|qandrissiLaborPrice/);
  await saveRate({ regularLaborPrice: 99, qandrissiLaborPrice: 101 }, 0);
  result = await request('', body); assert.equal(result.status, 200); assert.deepEqual(trouserLaborRates(result.data.trouserCosting), rates);
  result = await request('/' + order._id, edit(order, { expenseAmount: 43.25 }), admin, 'PUT'); assert.equal(result.status, 200); order = result.data;
  assert.deepEqual(trouserLaborRates(order.trouserCosting), rates); assert.equal(order.expenseAmount, 43.25);
  result = await request('/' + order._id + '/deliver', { version: order.__v }); assert.equal(result.status, 200); assert.deepEqual(trouserLaborRates(result.data.trouserCosting), rates); assert.equal(result.data.deliveryFinancials.expenseAmount, 43.25);
});
test('historical flat-rate orders retain their saved rate after the two new rates are configured', async t => {
  const f = fixture(t); f.seedLabor();
  const created = await request('', input()); assert.equal(created.status, 201);
  const document = f.orders.get(created.data._id); document.trouserCosting = { laborPrice: 15, settingsVersion: 0, calculatedAt: new Date() }; await document.validate();
  const order = document.toObject(); await saveRate({ regularLaborPrice: 20, qandrissiLaborPrice: 40 }, 0);
  const result = await request('/' + order._id, edit(order), admin, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.trouserCosting.laborPrice, 15); assert.deepEqual(trouserLaborRates(result.data.trouserCosting), { regularLaborPrice: 15, qandrissiLaborPrice: 15 }); assert.equal(result.data.expenseAmount, 15);
});

test('the complete browser multipart form can create and edit a mixed trouser order', async t => {
  const f = fixture(t, tailoringStockFixture); f.seedLabor();
  const multipart = async (path, values, method) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(values)) body.append(key, ['items', 'measurements', 'sfifa'].includes(key) ? JSON.stringify(value) : value ?? '');
    const response = await fetch(base + path, { method, headers: { Authorization: 'Bearer ' + jwt.sign(admin, process.env.JWT_SECRET) }, body });
    return { status: response.status, data: await response.json() };
  };
  const body = input({ items: [trouser(), trouser({ trouserType: 'qandrissi' })], deductFabricStock: true, recordFabricSales: true, expenseAmount: 30 });
  const createBody = { ...validateTailoringOrder(body), requestId: body.requestId }; assert.ok(Object.keys(createBody).length > 20);
  let result = await multipart('', createBody, 'POST'); assert.equal(result.status, 201, JSON.stringify(result.data)); const order = result.data;
  const editBody = { ...validateTailoringOrder({ ...body, expenseAmount: 35 }), version: order.__v, removeImage: false }; assert.ok(Object.keys(editBody).length > 20);
  result = await multipart('/' + order._id, editBody, 'PUT'); assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.expenseAmount, 35); assert.equal(result.data.items.length, 2); assert.deepEqual(trouserLaborRates(result.data.trouserCosting), { regularLaborPrice: 15, qandrissiLaborPrice: 15 });
});
